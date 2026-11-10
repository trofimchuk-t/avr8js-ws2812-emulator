import {
  reverseSegment,
  segmentCells,
  segmentTowards,
  segmentsLedCount,
  wiringCells,
  type Cell,
  type CustomLayout,
  type LedConfig,
  type LedSegment,
} from "@avr8js-ws2812/engine";
import { ArrowLeftRight, Eraser, Trash2, Undo2 } from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { IconButton } from "./ui";

/** Undo steps kept while editing. */
const MAX_HISTORY = 100;

export interface WiringEditor {
  editing: boolean;
  setEditing(editing: boolean): void;
  /** The wiring being shown: the saved one, or an empty one after "Clear" until something is drawn. */
  layout: CustomLayout;
  selected: number | null;
  select(index: number | null): void;
  add(segment: LedSegment): void;
  reverse(): void;
  remove(): void;
  clear(): void;
  undo(): void;
  canUndo: boolean;
}

/**
 * Editing state for a custom matrix. Every change goes to `onChange` at once (so autosave and the
 * preview follow), except an empty wiring: a project needs at least one LED, so "Clear" only
 * empties the drawing until the first new segment.
 */
export function useWiringEditor(
  led: LedConfig,
  onChange: ((led: LedConfig) => void) | undefined,
): WiringEditor | null {
  const custom = led.layout.kind === "custom" ? led.layout : null;
  const [editing, setEditingState] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [history, setHistory] = useState<LedSegment[][]>([]);
  const [selected, setSelected] = useState<number | null>(null);

  // A new grid (or another layout type) makes the undo steps meaningless.
  const gridKey = custom ? `${custom.cols}×${custom.rows}` : null;
  const [prevGridKey, setPrevGridKey] = useState(gridKey);
  if (prevGridKey !== gridKey) {
    setPrevGridKey(gridKey);
    setHistory([]);
    setSelected(null);
    setCleared(false);
    if (!custom) setEditingState(false);
  }

  const layout = useMemo(
    () => (custom && cleared ? { ...custom, segments: [] } : custom),
    [custom, cleared],
  );
  if (!custom || !layout || !onChange) return null;
  const segments = layout.segments;

  const apply = (next: LedSegment[]) => {
    if (next.length === 0) {
      setCleared(true);
      return;
    }
    setCleared(false);
    onChange({ ...led, count: segmentsLedCount(next), layout: { ...custom, segments: next } });
  };
  const commit = (next: LedSegment[]) => {
    setHistory((h) => [...h, segments].slice(-MAX_HISTORY));
    apply(next);
  };

  return {
    editing,
    setEditing: (value) => {
      setEditingState(value);
      setSelected(null);
      if (!value) {
        // Leaving with nothing drawn keeps the saved wiring.
        setCleared(false);
        setHistory([]);
      }
    },
    layout,
    selected,
    select: setSelected,
    add: (segment) => {
      commit([...segments, segment]);
      setSelected(segments.length);
    },
    reverse: () => {
      if (selected === null) return;
      commit(segments.map((s, i) => (i === selected ? reverseSegment(s) : s)));
    },
    remove: () => {
      if (selected === null) return;
      commit(segments.filter((_, i) => i !== selected));
      setSelected(null);
    },
    clear: () => {
      if (segments.length === 0) return;
      commit([]);
      setSelected(null);
    },
    undo: () => {
      const previous = history[history.length - 1];
      if (!previous) return;
      setHistory((h) => h.slice(0, -1));
      setSelected(null);
      apply(previous);
    },
    canUndo: history.length > 0,
  };
}

// Geometry of <wokwi-neopixel-matrix> (default spacing), in the mm of its SVG viewBox.
const PIXEL_W = 5.66;
const PIXEL_H = 5;
const PITCH_X = PIXEL_W + 1;
const PITCH_Y = PIXEL_H + 1;
const center = ({ col, row }: Cell) => ({
  x: col * PITCH_X + PIXEL_W / 2,
  y: row * PITCH_Y + PIXEL_H / 2,
});

/** Arrowhead at `tip`, pointing from `from` to `tip`; a single LED points right. */
function arrowHead(from: { x: number; y: number }, tip: { x: number; y: number }, size = 1.4) {
  const angle =
    from.x === tip.x && from.y === tip.y ? 0 : Math.atan2(tip.y - from.y, tip.x - from.x);
  const point = (a: number, r: number) =>
    `${tip.x + Math.cos(angle + a) * r},${tip.y + Math.sin(angle + a) * r}`;
  return [point(0, size), point(2.4, size), point(-2.4, size)].join(" ");
}

function SegmentShape({ segment, className }: { segment: LedSegment; className: string }) {
  const cells = segmentCells(segment);
  const start = center(cells[0]);
  const end = center(cells[cells.length - 1]);
  // A one-LED segment still shows its direction: the arrow leaves the cell center.
  const tip =
    cells.length > 1
      ? end
      : center({
          col:
            cells[0].col +
            (segment.direction === "right" ? 0.35 : segment.direction === "left" ? -0.35 : 0),
          row:
            cells[0].row +
            (segment.direction === "down" ? 0.35 : segment.direction === "up" ? -0.35 : 0),
        });
  return (
    <g className={className}>
      <line x1={start.x} y1={start.y} x2={tip.x} y2={tip.y} />
      <circle cx={start.x} cy={start.y} r={0.8} />
      <polygon points={arrowHead(start, tip)} />
    </g>
  );
}

/**
 * Drawn over the matrix. While editing: dragging from a free cell lays a segment, clicking a
 * segment selects it, and the keyboard reverses (R), deletes (Delete) and undoes (Ctrl/⌘+Z).
 * Otherwise it only dims the cells without an LED and lets the stage handle the mouse.
 */
export function WiringOverlay({ editor }: { editor: WiringEditor }) {
  const { layout, editing, selected } = editor;
  const { cols, rows, segments } = layout;
  const width = PIXEL_W * cols + (cols - 1);
  const height = PIXEL_H * rows + (rows - 1);
  const svg = useRef<SVGSVGElement>(null);

  // Which segment owns each cell (-1: none).
  const owner = useMemo(() => {
    const grid = new Int32Array(cols * rows).fill(-1);
    segments.forEach((segment, index) => {
      for (const { col, row } of segmentCells(segment)) grid[row * cols + col] = index;
    });
    return grid;
  }, [segments, cols, rows]);
  const cells = useMemo(() => wiringCells(layout), [layout]);

  const drag = useRef<{ id: number; start: Cell; moved: boolean } | null>(null);
  const [draft, setDraft] = useState<LedSegment | null>(null);

  const cellAt = (e: PointerEvent): Cell => {
    const rect = svg.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width;
    const y = ((e.clientY - rect.top) / rect.height) * height;
    return {
      col: Math.min(cols - 1, Math.max(0, Math.floor(x / PITCH_X))),
      row: Math.min(rows - 1, Math.max(0, Math.floor(y / PITCH_Y))),
    };
  };
  const isFree = ({ col, row }: Cell) => owner[row * cols + col] === -1;

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (!editing || e.button !== 0) return;
    // The stage would start moving the LEDs otherwise.
    e.stopPropagation();
    e.preventDefault();
    svg.current?.focus();
    const cell = cellAt(e);
    const index = owner[cell.row * cols + cell.col];
    if (index !== -1) {
      editor.select(index);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, start: cell, moved: false };
    setDraft(segmentTowards(cell, cell, isFree));
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const cell = cellAt(e);
    if (cell.col !== d.start.col || cell.row !== d.start.row) d.moved = true;
    setDraft(segmentTowards(d.start, cell, isFree));
  };
  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const segment = segmentTowards(d.start, cellAt(e), isFree);
    setDraft(null);
    // A plain click on a free cell first clears the selection; the next one adds a single LED.
    if (!d.moved && selected !== null) editor.select(null);
    else editor.add(segment);
  };
  const onPointerCancel = () => {
    drag.current = null;
    setDraft(null);
  };

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!editing) return;
    const key = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && key === "z" && !e.shiftKey) editor.undo();
    else if (e.metaKey || e.ctrlKey || e.altKey) return;
    else if (key === "delete" || key === "backspace") editor.remove();
    else if (key === "r") editor.reverse();
    else if (key === "escape") editor.select(null);
    else return;
    e.preventDefault();
  };

  return (
    <svg
      ref={svg}
      className={editing ? "wiring editing" : "wiring"}
      width={`${width}mm`}
      height={`${height}mm`}
      viewBox={`0 0 ${width} ${height}`}
      tabIndex={editing ? 0 : -1}
      role={editing ? "application" : undefined}
      aria-label={editing ? "Wiring editor" : undefined}
      aria-hidden={editing ? undefined : true}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={onKeyDown}
      // A double click while drawing must not re-center the stage.
      onDoubleClick={(e) => editing && e.stopPropagation()}
    >
      {Array.from(owner, (index, i) =>
        index === -1 ? (
          <rect
            key={i}
            className="wiring-empty"
            x={(i % cols) * PITCH_X}
            y={Math.floor(i / cols) * PITCH_Y}
            width={PIXEL_W}
            height={PIXEL_H}
            rx={0.6}
          />
        ) : null,
      )}
      {editing && (
        <>
          {segments.slice(1).map((segment, i) => {
            const prev = segmentCells(segments[i]);
            const from = center(prev[prev.length - 1]);
            const to = center(segment);
            return (
              <line key={i} className="wiring-link" x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
            );
          })}
          {segments.map((segment, i) => (
            <SegmentShape
              key={i}
              segment={segment}
              className={i === selected ? "wiring-segment selected" : "wiring-segment"}
            />
          ))}
          {draft && <SegmentShape segment={draft} className="wiring-segment draft" />}
          {cells.map((cell, i) => (
            <text
              key={i}
              className="wiring-index"
              x={cell.col * PITCH_X + 0.4}
              y={cell.row * PITCH_Y + 1.5}
            >
              {i}
            </text>
          ))}
        </>
      )}
    </svg>
  );
}

/** Actions and hints shown above the stage while editing the wiring. */
export function WiringBar({ editor }: { editor: WiringEditor }) {
  const { layout, selected } = editor;
  const count = segmentsLedCount(layout.segments);
  return (
    <div className="wiring-bar" role="toolbar" aria-label="Wiring">
      <span className="wiring-hint">
        {count === 0
          ? "Drag across the grid to lay the first segment. Until then the saved wiring stays."
          : selected === null
            ? "Drag from a free cell to add a segment, click a segment to select it."
            : `Segment ${selected + 1} selected: R reverses it, Delete removes it.`}
      </span>
      <span className="wiring-count">
        {layout.segments.length} segments · {count} LEDs
      </span>
      <IconButton label="Reverse segment (R)" disabled={selected === null} onClick={editor.reverse}>
        <ArrowLeftRight size={16} aria-hidden />
      </IconButton>
      <IconButton
        label="Delete segment (Delete)"
        disabled={selected === null}
        onClick={editor.remove}
      >
        <Trash2 size={16} aria-hidden />
      </IconButton>
      <IconButton label="Undo (Ctrl+Z)" disabled={!editor.canUndo} onClick={editor.undo}>
        <Undo2 size={16} aria-hidden />
      </IconButton>
      <IconButton label="Clear all segments" disabled={count === 0} onClick={editor.clear}>
        <Eraser size={16} aria-hidden />
      </IconButton>
      <button className="button small primary" onClick={() => editor.setEditing(false)}>
        Done
      </button>
    </div>
  );
}
