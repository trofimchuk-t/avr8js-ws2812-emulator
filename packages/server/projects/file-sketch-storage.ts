import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isValidSketchFileName, type SketchFile } from "@avr8js-ws2812/engine";
import { SketchMissingError, type SketchStorage } from "./types.ts";

const REF = /^[A-Za-z0-9-]{1,64}$/;

/** One directory per project under `root`. Refs and file names are validated, so paths cannot escape. */
export class FileSketchStorage implements SketchStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  private dir(ref: string) {
    if (!REF.test(ref)) throw new RangeError("Invalid sketch ref");
    return join(this.root, ref);
  }

  async readAll(ref: string): Promise<SketchFile[]> {
    const dir = this.dir(ref);
    let names: string[];
    try {
      names = await readdir(dir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") throw new SketchMissingError(ref);
      throw err;
    }
    const files: SketchFile[] = [];
    for (const name of names.filter(isValidSketchFileName).sort()) {
      files.push({ name, content: await readFile(join(dir, name), "utf8") });
    }
    return files;
  }

  async writeAll(ref: string, files: SketchFile[]) {
    const dir = this.dir(ref);
    await mkdir(this.root, { recursive: true });
    // Write next to the target, then swap, so a crash never leaves a half-written project.
    const next = join(this.root, `.new-${randomUUID()}`);
    const old = join(this.root, `.old-${randomUUID()}`);
    try {
      await mkdir(next);
      for (const file of files) {
        if (!isValidSketchFileName(file.name)) throw new RangeError("Invalid sketch file name");
        await writeFile(join(next, file.name), file.content);
      }
      let hadOld = true;
      try {
        await rename(dir, old);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
        hadOld = false;
      }
      try {
        await rename(next, dir);
      } catch (err) {
        if (hadOld) await rename(old, dir);
        throw err;
      }
      if (hadOld) await rm(old, { recursive: true, force: true });
    } finally {
      await rm(next, { recursive: true, force: true });
    }
  }

  async delete(ref: string) {
    await rm(this.dir(ref), { recursive: true, force: true });
  }
}
