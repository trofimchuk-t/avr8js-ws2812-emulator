import { MAX_DATA_PIN, MIN_DATA_PIN } from "./pins.ts";

export const MAX_LEDS = 4096;

export const COLOR_ORDERS = ["RGB", "RBG", "GRB", "GBR", "BRG", "BGR"] as const;
/** Order in which the three color bytes are sent on the wire (FastLED's `EOrder`). */
export type ColorOrder = (typeof COLOR_ORDERS)[number];

export interface LedConfig {
  /** Number of LEDs in the strip, ring or matrix. */
  count: number;
  /**
   * How the LEDs are drawn. A strip runs left to right, a ring is `count` LEDs on a circle with
   * LED 0 at the top, clockwise. `reversed` flips that: right to left, counter-clockwise.
   */
  layout:
    | { kind: "strip"; reversed?: boolean }
    | { kind: "ring"; reversed?: boolean }
    | { kind: "matrix"; cols: number; rows: number; serpentine?: boolean };
  /** Arduino pin number of the data line, D2..D13. */
  dataPin: number;
  colorOrder: ColorOrder;
  chip: "WS2812B";
}

export const DEFAULT_LED_CONFIG: LedConfig = {
  count: 50,
  layout: { kind: "strip" },
  dataPin: 3,
  colorOrder: "GRB",
  chip: "WS2812B",
};

export function createLedConfig(overrides: Partial<LedConfig> = {}): LedConfig {
  return { ...DEFAULT_LED_CONFIG, ...overrides };
}

export function isColorOrder(value: string): value is ColorOrder {
  return (COLOR_ORDERS as readonly string[]).includes(value);
}

/**
 * Converts a 24-bit word as received on the wire (first byte in bits 16–23) to the canonical GRB
 * word used by `Simulation.onFrame`: G in bits 16–23, R in bits 8–15, B in bits 0–7.
 */
export function wireToGrb(word: number, order: ColorOrder): number {
  if (order === "GRB") return word;
  const wire = [(word >> 16) & 0xff, (word >> 8) & 0xff, word & 0xff];
  const channel = { R: 0, G: 0, B: 0 };
  for (let i = 0; i < 3; i++) channel[order[i] as "R" | "G" | "B"] = wire[i];
  return (channel.G << 16) | (channel.R << 8) | channel.B;
}

/**
 * Position on screen of LED `i` (0 is the left end of a strip, the top of a ring, and for a matrix
 * the index in row order). Only drawing uses it: frames stay in wire order.
 */
export function displayPosition(layout: LedConfig["layout"], count: number, i: number): number {
  if (layout.kind === "matrix" || !layout.reversed) return i;
  // A reversed ring keeps LED 0 at the top and goes the other way round.
  return layout.kind === "ring" ? (count - i) % count : count - 1 - i;
}

/**
 * Checks untrusted input (for example a request body) and returns a clean `LedConfig`.
 * Throws a `RangeError` with a readable message for the first problem found.
 */
export function validateLedConfig(value: unknown): LedConfig {
  const v = value as Partial<LedConfig> | null;
  if (typeof v !== "object" || v === null) throw new RangeError("`led` must be an object");
  const { count, dataPin, colorOrder, layout } = v;
  if (!Number.isInteger(count) || count < 1 || count > MAX_LEDS) {
    throw new RangeError(`LED count must be an integer from 1 to ${MAX_LEDS}`);
  }
  if (!Number.isInteger(dataPin) || dataPin < MIN_DATA_PIN || dataPin > MAX_DATA_PIN) {
    throw new RangeError(`Data pin must be an integer from D${MIN_DATA_PIN} to D${MAX_DATA_PIN}`);
  }
  if (typeof colorOrder !== "string" || !isColorOrder(colorOrder)) {
    throw new RangeError(`Color order must be one of ${COLOR_ORDERS.join(", ")}`);
  }
  if (v.chip !== "WS2812B") throw new RangeError("Chip must be WS2812B");
  if (layout?.kind === "matrix") {
    const { cols, rows, serpentine } = layout;
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) {
      throw new RangeError("Matrix columns and rows must be positive integers");
    }
    if (cols * rows !== count)
      throw new RangeError("Matrix columns × rows must equal the LED count");
    return {
      count,
      dataPin,
      colorOrder,
      chip: "WS2812B",
      layout:
        serpentine === undefined
          ? { kind: "matrix", cols, rows }
          : { kind: "matrix", cols, rows, serpentine: !!serpentine },
    };
  }
  if (layout?.kind !== "strip" && layout?.kind !== "ring") {
    throw new RangeError("Layout must be a strip, a ring or a matrix");
  }
  const { reversed } = layout;
  if (reversed !== undefined && typeof reversed !== "boolean") {
    throw new RangeError("Layout direction (`reversed`) must be true or false");
  }
  return {
    count,
    dataPin,
    colorOrder,
    chip: "WS2812B",
    layout: reversed === undefined ? { kind: layout.kind } : { kind: layout.kind, reversed },
  };
}
