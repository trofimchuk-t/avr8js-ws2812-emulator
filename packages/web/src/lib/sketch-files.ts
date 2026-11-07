import {
  isValidSketchFileName,
  parseSketchConfig,
  type LedConfig,
  type SketchFile,
} from "@avr8js-ws2812/engine";

/** All sources as one text for `parseSketchConfig`: the main file first, the rest by name. */
export function joinSources(files: SketchFile[], main: string) {
  const rest = files.filter((f) => f.name !== main).sort((a, b) => (a.name < b.name ? -1 : 1));
  return [...files.filter((f) => f.name === main), ...rest].map((f) => f.content).join("\n");
}

/** Reads pin, count and color order from the sketch text. */
export function ledFromSketch(files: SketchFile[], main: string): LedConfig {
  return parseSketchConfig(joinSources(files, main)).config;
}

/** Turns an arbitrary title into a valid file base name. */
export function sanitizeBaseName(text: string, fallback = "sketch") {
  const base = text
    .replace(/\.[^.]*$/, "")
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base.slice(0, 40) || fallback;
}

/** Returns an error message for a new file name, or null when it is fine. */
export function checkNewFileName(name: string, files: SketchFile[], ignore?: string) {
  if (!isValidSketchFileName(name)) {
    return "Use letters, digits, _ or - and one of .ino .h .hpp .c .cpp";
  }
  if (files.some((f) => f.name !== ignore && f.name.toLowerCase() === name.toLowerCase())) {
    return `"${name}" already exists`;
  }
  return null;
}
