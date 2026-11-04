// Rebuilds the golden fixtures from demo_sketches with the pinned toolchain (needs arduino-cli).
// Usage: yarn golden:update
import { readdir, readFile, writeFile } from "node:fs/promises";
import { Compiler } from "../packages/server/compiler.ts";
import { loadConfig } from "../packages/server/config.ts";
import { parseSketchConfig } from "../packages/engine/src/sketch-config.ts";
import { runGolden } from "../packages/engine/test/golden.ts";

const sketchDir = new URL("../demo_sketches/", import.meta.url);
const fixtureDir = new URL("../packages/engine/test/fixtures/", import.meta.url);

const compiler = new Compiler(loadConfig());
await compiler.verifyToolchain();

const golden: Record<string, unknown> = {};
for (const file of (await readdir(sketchDir)).filter((f) => f.endsWith(".ino")).sort()) {
  const name = file.replace(/\.ino$/, "");
  const source = await readFile(new URL(file, sketchDir), "utf8");
  const { config, warnings } = parseSketchConfig(source);
  if (warnings.length) throw new Error(`${file}: ${warnings.join(" ")}`);
  const result = await compiler.compile(source);
  if (!result.hex) throw new Error(`${file} failed to compile:\n${result.stderr}`);
  await writeFile(new URL(`${name}.hex`, fixtureDir), result.hex);
  golden[name] = runGolden(result.hex, config);
  console.log(`${name}: ok`);
}
await writeFile(new URL("golden.json", fixtureDir), JSON.stringify(golden, null, 2) + "\n");
