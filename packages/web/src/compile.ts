import type { SketchFile } from "@avr8js-ws2812/engine";
import { ApiError, request } from "./lib/api";

export interface IHexiResult {
  stdout: string;
  stderr: string;
  hex: string;
}

export class CompileError extends Error {}

export async function buildHex(files: SketchFile[], main: string) {
  try {
    return await request<IHexiResult>("/compile", { method: "POST", json: { files, main } });
  } catch (err) {
    if (err instanceof ApiError) throw new CompileError(err.message);
    throw err;
  }
}
