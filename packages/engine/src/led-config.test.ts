import { describe, expect, it } from "vitest";
import { createLedConfig, validateLedConfig, wireToGrb } from "./led-config.ts";
import { arduinoPinToPort } from "./pins.ts";

describe("arduinoPinToPort", () => {
  it("maps D2..D13 to PORTD and PORTB bits", () => {
    expect(arduinoPinToPort(2)).toEqual({ port: "D", bit: 2 });
    expect(arduinoPinToPort(7)).toEqual({ port: "D", bit: 7 });
    expect(arduinoPinToPort(8)).toEqual({ port: "B", bit: 0 });
    expect(arduinoPinToPort(13)).toEqual({ port: "B", bit: 5 });
  });
  it("rejects other pins", () => {
    for (const pin of [0, 1, 14, 2.5, NaN]) expect(() => arduinoPinToPort(pin)).toThrow(RangeError);
  });
});

describe("wireToGrb", () => {
  // Wire bytes 0x11, 0x22, 0x33 in the given order.
  const word = 0x112233;
  it.each([
    ["GRB", 0x112233],
    ["RGB", 0x221133],
    ["RBG", 0x331122],
    ["GBR", 0x113322],
    ["BRG", 0x332211],
    ["BGR", 0x223311],
  ] as const)("%s", (order, expected) => {
    expect(wireToGrb(word, order)).toBe(expected);
  });
});

describe("validateLedConfig", () => {
  it("accepts a valid strip and a matrix, dropping unknown fields", () => {
    expect(validateLedConfig({ ...createLedConfig(), extra: 1 })).toEqual(createLedConfig());
    const matrix = createLedConfig({ count: 12, layout: { kind: "matrix", cols: 4, rows: 3 } });
    expect(validateLedConfig(matrix)).toEqual(matrix);
  });
  it("rejects bad values", () => {
    const bad: unknown[] = [
      null,
      "x",
      { ...createLedConfig(), count: 0 },
      { ...createLedConfig(), count: 1.5 },
      { ...createLedConfig(), count: 5000 },
      { ...createLedConfig(), dataPin: 1 },
      { ...createLedConfig(), colorOrder: "XYZ" },
      { ...createLedConfig(), chip: "APA102" },
      { ...createLedConfig(), layout: { kind: "ring" } },
      { ...createLedConfig(), count: 10, layout: { kind: "matrix", cols: 3, rows: 3 } },
    ];
    for (const value of bad) expect(() => validateLedConfig(value)).toThrow(RangeError);
  });
});
