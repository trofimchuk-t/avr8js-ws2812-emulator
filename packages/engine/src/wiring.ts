/**
 * Custom matrix wiring: LED strip segments laid on a `cols`×`rows` grid in any order and direction.
 * The data runs through `segments` in array order, and through each segment from its start cell
 * in its `direction`.
 */

export const SEGMENT_DIRECTIONS = ["up", "down", "left", "right"] as const;
export type SegmentDirection = (typeof SEGMENT_DIRECTIONS)[number];

export interface LedSegment {
  /** Cell of the first LED of the segment (the one that gets the data first). */
  col: number;
  row: number;
  direction: SegmentDirection;
  /** Number of LEDs, at least 1. */
  length: number;
}

export interface CustomLayout {
  kind: "custom";
  cols: number;
  rows: number;
  segments: LedSegment[];
}

export interface Cell {
  col: number;
  row: number;
}

function isSegmentDirection(value: unknown): value is SegmentDirection {
  return typeof value === "string" && (SEGMENT_DIRECTIONS as readonly string[]).includes(value);
}

const STEP: Record<SegmentDirection, Cell> = {
  up: { col: 0, row: -1 },
  down: { col: 0, row: 1 },
  left: { col: -1, row: 0 },
  right: { col: 1, row: 0 },
};

const OPPOSITE: Record<SegmentDirection, SegmentDirection> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

/** Cells of one segment, first LED first. */
export function segmentCells(segment: LedSegment): Cell[] {
  const step = STEP[segment.direction];
  return Array.from({ length: segment.length }, (_, i) => ({
    col: segment.col + step.col * i,
    row: segment.row + step.row * i,
  }));
}

/** Total number of LEDs in the segments. */
export function segmentsLedCount(segments: readonly LedSegment[]): number {
  return segments.reduce((sum, s) => sum + s.length, 0);
}

/** Cells of all LEDs in wire order: `wiringCells(layout)[i]` is where LED `i` is drawn. */
export function wiringCells(layout: CustomLayout): Cell[] {
  return layout.segments.flatMap(segmentCells);
}

/**
 * Grid lookup for drawing: entry `row * cols + col` is the index of the LED in that cell, or -1
 * for a cell without an LED.
 */
export function wiringGrid(layout: CustomLayout): Int32Array {
  const grid = new Int32Array(layout.cols * layout.rows).fill(-1);
  wiringCells(layout).forEach(({ col, row }, i) => {
    if (col >= 0 && row >= 0 && col < layout.cols && row < layout.rows) {
      grid[row * layout.cols + col] = i;
    }
  });
  return grid;
}

/**
 * The segment a mouse drag from `start` to `target` lays: a straight run along the axis the drag
 * moved most on, cut short before the first cell that `isFree` rejects. `start` itself is taken
 * as free; a drag that has not left `start` is a single LED.
 */
export function segmentTowards(
  start: Cell,
  target: Cell,
  isFree: (cell: Cell) => boolean,
): LedSegment {
  const dx = target.col - start.col;
  const dy = target.row - start.row;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const direction: SegmentDirection = horizontal
    ? dx < 0
      ? "left"
      : "right"
    : dy < 0
      ? "up"
      : "down";
  const wanted = Math.max(Math.abs(dx), Math.abs(dy)) + 1;
  const cells = segmentCells({ ...start, direction, length: wanted });
  let length = 1;
  while (length < wanted && isFree(cells[length])) length++;
  return { col: start.col, row: start.row, direction, length };
}

/** The same LEDs with the data running the other way: starts at the old end. */
export function reverseSegment(segment: LedSegment): LedSegment {
  const cells = segmentCells(segment);
  const end = cells[cells.length - 1];
  return { ...end, direction: OPPOSITE[segment.direction], length: segment.length };
}

/** Every row left to right, top to bottom: the wiring of a plain matrix. */
export function rowSegments(cols: number, rows: number): LedSegment[] {
  return Array.from({ length: rows }, (_, row) => ({
    col: 0,
    row,
    direction: "right" as const,
    length: cols,
  }));
}

/**
 * Fits the segments into a smaller grid: segments that start outside are dropped, the others are
 * cut at the edge.
 */
export function clipSegments(
  segments: readonly LedSegment[],
  cols: number,
  rows: number,
): LedSegment[] {
  const result: LedSegment[] = [];
  for (const segment of segments) {
    let length = 0;
    for (const { col, row } of segmentCells(segment)) {
      if (col < 0 || row < 0 || col >= cols || row >= rows) break;
      length++;
    }
    if (length > 0) result.push({ ...segment, length });
  }
  return result;
}

/**
 * Checks untrusted segments against the grid and returns clean copies. Throws a `RangeError` for
 * the first problem: a bad field, a segment leaving the grid, or two segments sharing a cell.
 */
export function validateSegments(value: unknown, cols: number, rows: number): LedSegment[] {
  if (!Array.isArray(value)) throw new RangeError("Wiring segments must be an array");
  const used = new Set<number>();
  return value.map((raw: unknown, index) => {
    const s = raw as Partial<LedSegment> | null;
    const name = `Wiring segment ${index + 1}`;
    if (typeof s !== "object" || s === null) throw new RangeError(`${name} must be an object`);
    const { col, row, direction, length } = s;
    if (!Number.isInteger(col) || !Number.isInteger(row)) {
      throw new RangeError(`${name}: column and row must be integers`);
    }
    if (!isSegmentDirection(direction)) {
      throw new RangeError(`${name}: direction must be one of ${SEGMENT_DIRECTIONS.join(", ")}`);
    }
    if (!Number.isInteger(length) || length < 1) {
      throw new RangeError(`${name}: length must be a positive integer`);
    }
    const segment: LedSegment = { col, row, direction, length };
    for (const cell of segmentCells(segment)) {
      if (cell.col < 0 || cell.row < 0 || cell.col >= cols || cell.row >= rows) {
        throw new RangeError(`${name} leaves the ${cols}×${rows} grid`);
      }
      const key = cell.row * cols + cell.col;
      if (used.has(key)) {
        throw new RangeError(
          `${name} overlaps another segment at column ${cell.col + 1}, row ${cell.row + 1}`,
        );
      }
      used.add(key);
    }
    return segment;
  });
}
