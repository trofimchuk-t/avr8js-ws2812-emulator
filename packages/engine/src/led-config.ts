export const COLOR_ORDERS = ["RGB", "RBG", "GRB", "GBR", "BRG", "BGR"] as const;
/** Order in which the three color bytes are sent on the wire (FastLED's `EOrder`). */
export type ColorOrder = (typeof COLOR_ORDERS)[number];

export interface LedConfig {
  /** Number of LEDs in the strip or matrix. */
  count: number;
  layout: { kind: "strip" } | { kind: "matrix"; cols: number; rows: number; serpentine?: boolean };
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
