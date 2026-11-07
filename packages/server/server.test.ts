import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.ts";
import { Compiler, type Exec } from "./compiler.ts";
import { loadConfig } from "./config.ts";
import { memoryProjects } from "./projects/test-helpers.ts";
import { BuildQueue, QueueFullError } from "./semaphore.ts";
import { validateSketchFiles, type SketchFile } from "@avr8js-ws2812/engine";

const config = { ...loadConfig(), maxSketchBytes: 1000, maxSketchFiles: 4 };

function sketchOf(files: SketchFile[], main?: string) {
  return validateSketchFiles(files, main, config);
}
const one = (content: string) => sketchOf([{ name: "sketch.ino", content }]);

function fakeExec(calls: string[][] = []): Exec {
  return async (_file, args) => {
    calls.push(args);
    const dir = args[args.length - 1];
    const out = args[args.indexOf("--output-dir") + 1];
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(out, { recursive: true });
    const id = dir.slice(dir.lastIndexOf("/") + 1);
    await writeFile(`${out}/${id}.ino.hex`, ":00000001FF\n");
    return { stdout: `Sketch uses 10 bytes\nUsed platform ${dir}\n`, stderr: "" };
  };
}

describe("BuildQueue", () => {
  it("limits concurrency and rejects when the queue is full", async () => {
    const q = new BuildQueue(1, 1);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const first = q.run(() => gate);
    const second = q.run(async () => "second");
    await expect(q.run(async () => "third")).rejects.toBeInstanceOf(QueueFullError);
    release();
    await first;
    expect(await second).toBe("second");
    expect(await q.run(async () => "after")).toBe("after");
  });
});

describe("Compiler", () => {
  it("returns hex, hides temp paths and caches by sketch", async () => {
    const calls: string[][] = [];
    const c = new Compiler(config, fakeExec(calls));
    const a = await c.compile(one("void setup(){}"));
    expect(a.hex).toContain(":00000001FF");
    expect(a.stdout).toBe("Sketch uses 10 bytes");
    expect(a.stdout).not.toContain("ws2812-build");
    await c.compile(one("void setup(){}"));
    expect(calls).toHaveLength(1);
    await c.compile(one("void loop(){}"));
    expect(calls).toHaveLength(2);
  });

  it("shares one build between concurrent identical requests", async () => {
    const calls: string[][] = [];
    const c = new Compiler(config, fakeExec(calls));
    await Promise.all([c.compile(one("x")), c.compile(one("x")), c.compile(one("x"))]);
    expect(calls).toHaveLength(1);
  });

  it("returns compiler errors with an empty hex", async () => {
    const exec: Exec = async (_f, args) => {
      throw Object.assign(new Error("failed"), {
        stdout: "",
        stderr: `${args[args.length - 1]}: error`,
      });
    };
    const r = await new Compiler(config, exec).compile(one("bad"));
    expect(r.hex).toBe("");
    expect(r.stderr).toContain("<tmp>");
  });

  it("writes every file and maps errors back to the user's file names", async () => {
    let written: string[] = [];
    const exec: Exec = async (_f, args) => {
      const dir = args[args.length - 1];
      const { readdir } = await import("node:fs/promises");
      written = (await readdir(dir)).sort();
      throw Object.assign(new Error("failed"), {
        stdout: "",
        stderr: `${dir}/config.h:3: error\n${dir}/${dir.slice(dir.lastIndexOf("/") + 1)}.ino:1: error`,
      });
    };
    const r = await new Compiler(config, exec).compile(
      sketchOf(
        [
          { name: "main.ino", content: '#include "config.h"' },
          { name: "config.h", content: "#define N 3" },
          { name: "util.cpp", content: "" },
        ],
        "main.ino",
      ),
    );
    expect(written).toHaveLength(3);
    expect(written).toContain("config.h");
    expect(written).toContain("util.cpp");
    expect(written.filter((n) => n.endsWith(".ino"))).toHaveLength(1);
    expect(r.stderr).toBe("config.h:3: error\nmain.ino:1: error");
  });

  it("keys the cache by every file, the main file and boundaries", () => {
    const f = (name: string, content: string) => ({ name, content });
    const key = (files: SketchFile[], main?: string) => Compiler.cacheKey(sketchOf(files, main));
    const a = [f("a.ino", "x"), f("b.h", "y")];
    expect(key(a)).toBe(key([...a].reverse()));
    expect(key(a)).not.toBe(key([f("a.ino", "x"), f("b.h", "z")]));
    expect(key(a)).not.toBe(key([f("a.ino", "x"), f("c.h", "y")]));
    expect(key([f("a.ino", "xb.h"), f("c.h", "")])).not.toBe(key([f("a.ino", "x"), f("b.h", "")]));
    const two = [f("a.ino", "x"), f("b.ino", "y")];
    expect(key(two, "a.ino")).not.toBe(key(two, "b.ino"));
  });

  it("reports timeouts", async () => {
    const exec: Exec = async () => {
      throw Object.assign(new Error("t"), { killed: true });
    };
    expect((await new Compiler(config, exec).compile(one("slow"))).stderr).toBe("Build timed out");
  });

  it("passes arguments as an array, never via a shell", async () => {
    const calls: string[][] = [];
    await new Compiler(config, fakeExec(calls)).compile(one("$(rm -rf /)"));
    expect(calls[0]).toContain("arduino:avr:uno");
    expect(calls[0].join(" ")).not.toContain("rm -rf");
  });
});

describe("POST /api/compile", () => {
  const app = buildApp(config, new Compiler(config, fakeExec()), memoryProjects());
  const post = (payload: unknown) =>
    app.inject({ method: "POST", url: "/api/compile", payload: payload as object });

  it("compiles a sketch", async () => {
    const res = await post({ sketch: "void setup(){}" });
    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.json()).sort()).toEqual(["hex", "stderr", "stdout"]);
  });

  it("rejects a missing or empty sketch", async () => {
    expect((await post({})).statusCode).toBe(400);
    expect((await post({ sketch: "  " })).statusCode).toBe(400);
    expect((await post({ sketch: 5 })).statusCode).toBe(400);
  });

  it("rejects an oversized sketch", async () => {
    expect((await post({ sketch: "a".repeat(1001) })).statusCode).toBe(413);
    const files = [
      { name: "a.ino", content: "a".repeat(600) },
      { name: "b.h", content: "b".repeat(600) },
    ];
    expect((await post({ files })).statusCode).toBe(413);
  });

  it("compiles several files", async () => {
    const files = [
      { name: "a.ino", content: "void setup(){}" },
      { name: "b.h", content: "" },
    ];
    expect((await post({ files })).statusCode).toBe(200);
    expect((await post({ files, main: "a.ino" })).statusCode).toBe(200);
  });

  it("rejects bad file lists", async () => {
    const ino = { name: "a.ino", content: "x" };
    const bad: unknown[] = [
      { files: [] },
      { files: "a" },
      { files: [{ name: "a.ino" }] },
      { files: [{ name: "../a.ino", content: "x" }] },
      { files: [{ name: "src/a.ino", content: "x" }] },
      { files: [{ name: ".a.ino", content: "x" }] },
      { files: [{ name: "a.txt", content: "x" }] },
      { files: [{ name: "a.INO", content: "x" }] },
      { files: [ino, { name: "A.ino", content: "y" }] },
      { files: [ino, { name: "b.ino", content: "y" }] },
      { files: [ino], main: "b.ino" },
      { files: [{ name: "a.h", content: "x" }] },
      { files: [{ name: "a.ino", content: " " }] },
      { files: Array.from({ length: 5 }, (_, i) => ({ name: `f${i}.h`, content: "" })) },
    ];
    for (const payload of bad) {
      expect((await post(payload)).statusCode, JSON.stringify(payload)).toBe(400);
    }
  });
});

const hasCli = (() => {
  try {
    execFileSync("arduino-cli", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasCli)("real arduino-cli", () => {
  it("has the pinned toolchain and compiles a sketch", async () => {
    const c = new Compiler(loadConfig());
    await c.verifyToolchain();
    const r = await c.compile(one("void setup(){} void loop(){}"));
    expect(r.hex).toMatch(/^:/);
    const bad = await c.compile(one("void setup(){ nope }"));
    expect(bad.hex).toBe("");
    expect(bad.stderr).toContain("sketch.ino");
    expect(bad.stderr).not.toMatch(/\/(private|var|tmp)\//);
    expect(bad.stderr).not.toContain("\u001b");
  }, 120_000);

  it("compiles a sketch split over several files", async () => {
    const c = new Compiler(loadConfig());
    const ok = await c.compile(
      sketchOf(
        [
          {
            name: "main.ino",
            content: '#include "config.h"\nvoid setup(){ helper(N); }\nvoid loop(){}',
          },
          { name: "config.h", content: "#define N 3\nvoid helper(int n);" },
          {
            name: "helper.cpp",
            content: "#include <Arduino.h>\nvoid helper(int n){ pinMode(n, OUTPUT); }",
          },
          { name: "extra.ino", content: "int extra(){ return 1; }" },
        ],
        "main.ino",
      ),
    );
    expect(ok.stderr).toBe("");
    expect(ok.hex).toMatch(/^:/);
    const bad = await c.compile(
      sketchOf(
        [
          { name: "main.ino", content: "void setup(){}\nvoid loop(){}" },
          { name: "helper.cpp", content: "void helper(){ nope }" },
        ],
        "main.ino",
      ),
    );
    expect(bad.hex).toBe("");
    expect(bad.stderr).toContain("helper.cpp:1");
    expect(bad.stderr).not.toMatch(/\/(private|var|tmp)\//);
  }, 120_000);
});
