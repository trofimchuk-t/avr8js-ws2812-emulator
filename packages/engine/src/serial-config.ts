/** What the serial terminal appends to every line it sends, as in the Arduino IDE. */
export const LINE_ENDINGS = ["none", "lf", "cr", "crlf"] as const;
export type LineEnding = (typeof LINE_ENDINGS)[number];

export const LINE_ENDING_TEXT: Record<LineEnding, string> = {
  none: "",
  lf: "\n",
  cr: "\r",
  crlf: "\r\n",
};

/** Per-project settings of the serial terminal. */
export interface SerialConfig {
  lineEnding: LineEnding;
}

export const DEFAULT_SERIAL_CONFIG: SerialConfig = { lineEnding: "lf" };

/** Checks untrusted input (API bodies, imported files). Throws `RangeError`. */
export function validateSerialConfig(value: unknown): SerialConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RangeError("`serial` must be an object");
  }
  const { lineEnding } = value as Record<string, unknown>;
  if (!(LINE_ENDINGS as readonly unknown[]).includes(lineEnding)) {
    throw new RangeError(`\`serial.lineEnding\` must be one of ${LINE_ENDINGS.join(", ")}`);
  }
  return { lineEnding: lineEnding as LineEnding };
}
