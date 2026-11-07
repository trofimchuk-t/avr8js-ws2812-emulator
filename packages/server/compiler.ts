import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { CORE, FQBN, LIBRARIES, TOOLCHAIN_ID, type ServerConfig } from "./config.ts";
import { BuildQueue } from "./semaphore.ts";
import type { ValidatedSketch } from "@avr8js-ws2812/engine";

const execFileAsync = promisify(execFile);

/** Same shape as `IHexiResult` in `src/compile.ts`. */
export interface CompileResult {
  stdout: string;
  stderr: string;
  hex: string;
}

export type Exec = (
  file: string,
  args: string[],
  options: { timeout: number; maxBuffer: number },
) => Promise<{ stdout: string; stderr: string }>;

const defaultExec: Exec = (file, args, options) => execFileAsync(file, args, options);

export class Compiler {
  private readonly cache = new Map<string, CompileResult>();
  private readonly inflight = new Map<string, Promise<CompileResult>>();
  private readonly queue: BuildQueue;

  private readonly config: ServerConfig;
  private readonly exec: Exec;

  constructor(config: ServerConfig, exec: Exec = defaultExec) {
    this.config = config;
    this.exec = exec;
    this.queue = new BuildQueue(config.maxConcurrentBuilds, config.maxQueuedBuilds);
  }

  /** Order-independent, and length-prefixed so that file boundaries cannot be forged. */
  static cacheKey(sketch: ValidatedSketch) {
    const hash = createHash("sha256").update(TOOLCHAIN_ID).update("\0");
    const field = (text: string) => hash.update(`${Buffer.byteLength(text)}:`).update(text);
    field(sketch.main);
    for (const file of [...sketch.files].sort((a, b) => (a.name < b.name ? -1 : 1))) {
      field(file.name);
      field(file.content);
    }
    return hash.digest("hex");
  }

  compile(sketch: ValidatedSketch): Promise<CompileResult> {
    const key = Compiler.cacheKey(sketch);
    const cached = this.cache.get(key);
    if (cached) {
      // Refresh recency.
      this.cache.delete(key);
      this.cache.set(key, cached);
      return Promise.resolve(cached);
    }
    let pending = this.inflight.get(key);
    if (!pending) {
      pending = this.queue
        .run(() => this.build(sketch))
        .then((result) => {
          this.remember(key, result);
          return result;
        })
        .finally(() => this.inflight.delete(key));
      this.inflight.set(key, pending);
    }
    return pending;
  }

  /** Fails fast at startup if the installed toolchain differs from the pinned one. */
  async verifyToolchain() {
    const run = async (args: string[]) =>
      JSON.parse(
        (await this.exec(this.config.cliPath, args, { timeout: 30_000, maxBuffer: 10_000_000 }))
          .stdout,
      );
    const cores = (await run(["core", "list", "--format", "json"])).platforms ?? [];
    const core = cores.find((p: { id: string }) => p.id === CORE.id);
    if (core?.installed_version !== CORE.version) {
      throw new Error(
        `Expected ${CORE.id}@${CORE.version}, found ${core?.installed_version ?? "none"}`,
      );
    }
    const libs = (await run(["lib", "list", "--format", "json"])).installed_libraries ?? [];
    for (const wanted of LIBRARIES) {
      const lib = libs.find((l: { library: { name: string } }) => l.library.name === wanted.name);
      if (lib?.library.version !== wanted.version) {
        throw new Error(
          `Expected ${wanted.name}@${wanted.version}, found ${lib?.library.version ?? "none"}`,
        );
      }
    }
  }

  private remember(key: string, result: CompileResult) {
    this.cache.set(key, result);
    while (this.cache.size > this.config.cacheEntries) {
      this.cache.delete(this.cache.keys().next().value);
    }
  }

  private async build(sketch: ValidatedSketch): Promise<CompileResult> {
    // Sketch folder and .ino file must share a name; the random id is also unguessable.
    const id = "sketch_" + randomUUID().replace(/-/g, "");
    const root = join(tmpdir(), "ws2812-build-" + id);
    const dir = join(root, id);
    const out = join(root, "out");
    // The compiler prints resolved paths (e.g. /private/var on macOS), so clean those too.
    let real: string;
    try {
      await mkdir(dir, { recursive: true });
      real = await realpath(root);
      // arduino-cli wants the main .ino to share the folder's name; the other files keep theirs.
      // Names were validated as flat, so none of them can leave `dir`.
      for (const file of sketch.files) {
        const target = file.name === sketch.main ? id + ".ino" : file.name;
        await writeFile(join(dir, target), file.content);
      }
      let stdout = "";
      let stderr = "";
      try {
        // execFile with an argument array: no shell, the sketch text never reaches a command line.
        ({ stdout, stderr } = await this.exec(
          this.config.cliPath,
          ["compile", "--no-color", "--fqbn", FQBN, "--output-dir", out, dir],
          { timeout: this.config.buildTimeoutMs, maxBuffer: 10_000_000 },
        ));
      } catch (err) {
        const e = err as { stdout?: string; stderr?: string; killed?: boolean; message: string };
        stdout = e.stdout ?? "";
        stderr = e.killed ? "Build timed out" : (e.stderr ?? e.message);
        return {
          stdout: clean(stdout, [root, real], id, sketch, true),
          stderr: clean(stderr, [root, real], id, sketch),
          hex: "",
        };
      }
      const hex = await readFile(join(out, id + ".ino.hex"), "utf8");
      return {
        stdout: clean(stdout, [root, real], id, sketch, true),
        stderr: clean(stderr, [root, real], id, sketch),
        hex,
      };
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
}

/**
 * Hides temp paths and the generated sketch name, and maps files back to the user's names.
 * With `summary`, keeps only the size lines, since the rest of stdout lists local toolchain paths.
 */
function clean(
  text: string,
  roots: string[],
  id: string,
  sketch: ValidatedSketch,
  summary = false,
) {
  let out = text;
  // The resolved path can contain the plain one (/private/var/... vs /var/...), so replace it first.
  roots = [...roots].sort((a, b) => b.length - a.length);
  for (const root of roots) {
    for (const file of sketch.files) {
      const built = file.name === sketch.main ? id + ".ino" : file.name;
      out = out.split(join(root, id, built)).join(file.name);
    }
  }
  for (const root of roots) {
    out = out.split(root).join("<tmp>");
  }
  out = out.split(id).join(sketch.main.replace(/\.ino$/, ""));
  if (summary) {
    out = out
      .split("\n")
      .filter((line) => /^(Sketch uses|Global variables)/.test(line))
      .join("\n");
  }
  return out;
}
