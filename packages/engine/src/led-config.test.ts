import { describe, expect, it } from "vitest";
import { createLedConfig, displayPosition, validateLedConfig, wireToGrb } from "./led-config.ts";
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
  it("accepts a valid strip, a ring and a matrix, dropping unknown fields", () => {
    expect(validateLedConfig({ ...createLedConfig(), extra: 1 })).toEqual(createLedConfig());
    const ring = createLedConfig({ count: 16, layout: { kind: "ring" } });
    expect(validateLedConfig({ ...ring, layout: { kind: "ring", cols: 4 } })).toEqual(ring);
    const reversed = createLedConfig({ count: 16, layout: { kind: "strip", reversed: true } });
    expect(validateLedConfig(reversed)).toEqual(reversed);
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
      { ...createLedConfig(), layout: { kind: "circle" } },
      { ...createLedConfig(), layout: { kind: "ring", reversed: "yes" } },
      { ...createLedConfig(), count: 10, layout: { kind: "matrix", cols: 3, rows: 3 } },
    ];
    for (const value of bad) expect(() => validateLedConfig(value)).toThrow(RangeError);
  });
});

describe("displayPosition", () => {
  const positions = (layout: Parameters<typeof displayPosition>[0], count: number) =>
    Array.from({ length: count }, (_, i) => displayPosition(layout, count, i));

  it("keeps the order by default", () => {
    expect(positions({ kind: "strip" }, 4)).toEqual([0, 1, 2, 3]);
    expect(positions({ kind: "ring", reversed: false }, 4)).toEqual([0, 1, 2, 3]);
    expect(positions({ kind: "matrix", cols: 2, rows: 2 }, 4)).toEqual([0, 1, 2, 3]);
  });
  it("draws a reversed strip right to left", () => {
    expect(positions({ kind: "strip", reversed: true }, 4)).toEqual([3, 2, 1, 0]);
  });
  it("draws a reversed ring counter-clockwise from the top", () => {
    expect(positions({ kind: "ring", reversed: true }, 4)).toEqual([0, 3, 2, 1]);
  });
  it("handles a single LED", () => {
    expect(positions({ kind: "strip", reversed: true }, 1)).toEqual([0]);
    expect(positions({ kind: "ring", reversed: true }, 1)).toEqual([0]);
  });
});
