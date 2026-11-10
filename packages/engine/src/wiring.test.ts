import { describe, expect, it } from "vitest";
import { createLedConfig, validateLedConfig } from "./led-config.ts";
import {
  clipSegments,
  reverseSegment,
  rowSegments,
  segmentCells,
  segmentTowards,
  validateSegments,
  wiringCells,
  wiringGrid,
  type CustomLayout,
  type LedSegment,
} from "./wiring.ts";

// The example from the feature request: 2 columns of 3 LEDs, data up the first, down the second.
const columns: CustomLayout = {
  kind: "custom",
  cols: 2,
  rows: 3,
  segments: [
    { col: 0, row: 2, direction: "up", length: 3 },
    { col: 1, row: 0, direction: "down", length: 3 },
  ],
};

describe("wiring", () => {
  it("lists the cells of a segment from its first LED", () => {
    expect(segmentCells({ col: 3, row: 1, direction: "left", length: 3 })).toEqual([
      { col: 3, row: 1 },
      { col: 2, row: 1 },
      { col: 1, row: 1 },
    ]);
  });

  it("puts the LEDs in wire order and builds the grid lookup", () => {
    expect(wiringCells(columns)).toEqual([
      { col: 0, row: 2 },
      { col: 0, row: 1 },
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 1, row: 1 },
      { col: 1, row: 2 },
    ]);
    // Row by row: [LED at (0,0), LED at (1,0)], ...
    expect(Array.from(wiringGrid(columns))).toEqual([2, 3, 1, 4, 0, 5]);
  });

  it("marks cells without an LED with -1", () => {
    const sparse: CustomLayout = { ...columns, cols: 3, segments: [columns.segments[0]] };
    expect(Array.from(wiringGrid(sparse))).toEqual([2, -1, -1, 1, -1, -1, 0, -1, -1]);
  });

  it("reverses a segment in place", () => {
    const segment: LedSegment = { col: 1, row: 4, direction: "up", length: 3 };
    expect(reverseSegment(segment)).toEqual({ col: 1, row: 2, direction: "down", length: 3 });
    expect(reverseSegment(reverseSegment(segment))).toEqual(segment);
  });

  it("wires a plain matrix as rows", () => {
    expect(rowSegments(4, 2)).toEqual([
      { col: 0, row: 0, direction: "right", length: 4 },
      { col: 0, row: 1, direction: "right", length: 4 },
    ]);
  });

  it("clips segments to a smaller grid", () => {
    expect(clipSegments(columns.segments, 2, 2)).toEqual([
      // Starts at row 2, outside a 2-row grid: dropped.
      { col: 1, row: 0, direction: "down", length: 2 },
    ]);
    expect(clipSegments(columns.segments, 1, 3)).toEqual([columns.segments[0]]);
  });

  describe("segmentTowards", () => {
    const free = () => true;
    it("follows the axis the drag moved most on", () => {
      const start = { col: 2, row: 2 };
      expect(segmentTowards(start, { col: 5, row: 3 }, free)).toEqual({
        ...start,
        direction: "right",
        length: 4,
      });
      expect(segmentTowards(start, { col: 1, row: 0 }, free)).toEqual({
        ...start,
        direction: "up",
        length: 3,
      });
      expect(segmentTowards(start, start, free)).toEqual({
        ...start,
        direction: "right",
        length: 1,
      });
    });
    it("stops before a taken cell", () => {
      const isFree = ({ col }: { col: number }) => col !== 4;
      expect(segmentTowards({ col: 1, row: 0 }, { col: 6, row: 0 }, isFree).length).toBe(3);
    });
  });

  describe("validateSegments", () => {
    it("accepts valid segments and drops unknown fields", () => {
      const withExtra = columns.segments.map((s) => ({ ...s, extra: true }));
      expect(validateSegments(withExtra, 2, 3)).toEqual(columns.segments);
    });
    it("rejects bad segments", () => {
      const bad: unknown[] = [
        null,
        [null],
        [{ col: 0, row: 0, direction: "diagonal", length: 1 }],
        [{ col: 0, row: 0, direction: "up", length: 0 }],
        [{ col: 0.5, row: 0, direction: "up", length: 1 }],
        // Leaves the grid.
        [{ col: 0, row: 0, direction: "up", length: 2 }],
        // Overlaps.
        [
          { col: 0, row: 0, direction: "right", length: 2 },
          { col: 1, row: 1, direction: "up", length: 2 },
        ],
      ];
      for (const value of bad) expect(() => validateSegments(value, 2, 3)).toThrow(RangeError);
    });
  });

  it("validates a custom LedConfig", () => {
    const led = createLedConfig({ count: 6, layout: columns });
    expect(validateLedConfig(led)).toEqual(led);
    expect(() => validateLedConfig({ ...led, count: 5 })).toThrow(RangeError);
    expect(() =>
      validateLedConfig({ ...led, layout: { ...columns, cols: 4096, rows: 2 } }),
    ).toThrow(RangeError);
  });
});
