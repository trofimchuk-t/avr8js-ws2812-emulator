import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  validateLedConfig,
  isValidSketchFileName,
  type LedConfig,
  type SketchFile,
} from "@avr8js-ws2812/engine";
import { ledFromSketch, sanitizeBaseName } from "./sketch-files";

export interface ProjectDraft {
  name: string;
  led: LedConfig;
  files: SketchFile[];
  main: string;
}

export interface ImportedProject extends ProjectDraft {
  /** Entries of the archive that were skipped. */
  warnings: string[];
}

const MANIFEST = "project.json";
const MAX_ENTRY_BYTES = 256 * 1024;
const MAX_ENTRIES = 64;

export interface ExportedFile {
  filename: string;
  mime: string;
  data: Uint8Array;
}

/** A project with only its main .ino becomes a plain .ino; anything else a zip with a manifest. */
export function exportProject(project: ProjectDraft): ExportedFile {
  const base = sanitizeBaseName(project.name, "project");
  if (project.files.length === 1) {
    return { filename: `${base}.ino`, mime: "text/plain", data: strToU8(project.files[0].content) };
  }
  const entries: Record<string, Uint8Array> = {};
  for (const file of project.files) entries[file.name] = strToU8(file.content);
  entries[MANIFEST] = strToU8(
    JSON.stringify({ name: project.name, led: project.led, main: project.main }, null, 2),
  );
  return { filename: `${base}.zip`, mime: "application/zip", data: zipSync(entries) };
}

function pickMain(files: SketchFile[], wanted: unknown) {
  const inos = files.filter((f) => f.name.endsWith(".ino"));
  if (inos.length === 0) throw new Error("The archive has no .ino file");
  const chosen =
    inos.find((f) => f.name === wanted) ??
    inos.find((f) => /\bvoid\s+setup\s*\(/.test(f.content)) ??
    inos[0];
  return chosen.name;
}

export function importProject(filename: string, bytes: Uint8Array): ImportedProject {
  const title = filename.replace(/\.[^.]*$/, "") || "Imported project";
  if (/\.ino$/i.test(filename)) {
    const files = [{ name: sanitizeBaseName(filename) + ".ino", content: strFromU8(bytes) }];
    return {
      name: title,
      led: ledFromSketch(files, files[0].name),
      files,
      main: files[0].name,
      warnings: [],
    };
  }
  if (!/\.zip$/i.test(filename)) throw new Error("Choose a .ino or .zip file");

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, { filter: (f) => f.originalSize <= MAX_ENTRY_BYTES });
  } catch {
    throw new Error("Cannot read the zip file");
  }
  const warnings: string[] = [];
  // Archives made by other tools often wrap everything in one folder.
  let paths = Object.keys(entries).filter((p) => !p.endsWith("/") && !p.startsWith("__MACOSX/"));
  const tops = new Set(paths.map((p) => p.split("/")[0]));
  if (tops.size === 1 && paths.every((p) => p.includes("/"))) {
    const prefix = [...tops][0] + "/";
    entries = Object.fromEntries(paths.map((p) => [p.slice(prefix.length), entries[p]]));
    paths = Object.keys(entries);
  }
  const files: SketchFile[] = [];
  for (const path of paths.sort()) {
    if (path === MANIFEST) continue;
    if (!isValidSketchFileName(path)) {
      warnings.push(`Skipped ${path}`);
      continue;
    }
    files.push({ name: path, content: strFromU8(entries[path]) });
  }
  if (files.length > MAX_ENTRIES) throw new Error("Too many files in the archive");

  let manifest: { name?: unknown; led?: unknown; main?: unknown } = {};
  if (entries[MANIFEST]) {
    try {
      manifest = JSON.parse(strFromU8(entries[MANIFEST]));
    } catch {
      warnings.push(`Ignored an unreadable ${MANIFEST}`);
    }
  }
  const main = pickMain(files, manifest.main);
  let led: LedConfig | undefined;
  if (manifest.led !== undefined) {
    try {
      led = validateLedConfig(manifest.led);
    } catch {
      warnings.push("Ignored an invalid LED configuration in project.json");
    }
  }
  const name =
    typeof manifest.name === "string" && manifest.name.trim() ? manifest.name.trim() : title;
  return {
    name: name.slice(0, 100),
    led: led ?? ledFromSketch(files, main),
    files,
    main,
    warnings,
  };
}
