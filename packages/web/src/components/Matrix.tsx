import "@wokwi/elements";
import { displayPosition } from "@avr8js-ws2812/engine";
import type { LEDRingElement, NeopixelMatrixElement } from "@wokwi/elements";
import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from "react";

export interface MatrixHandle {
  /** `pixels` are GRB words as delivered by `Simulation.onFrame`. */
  setPixels(pixels: ArrayLike<number>): void;
  clear(): void;
}

export type Zoom = "fit" | 1 | 2;

/** Upper bound for "fit", so a handful of LEDs does not fill the whole panel. */
const MAX_FIT_SCALE = 3;
/** Dragging stops this many pixels short of moving the LEDs out of the stage. */
const MIN_VISIBLE = 40;

/**
 * LED preview, drawn exactly as configured: a strip is one row, a matrix is `cols`×`rows`, a ring
 * (`ring`) is `cols` LEDs on a circle with LED 0 at the top, clockwise. `reversed` (strip and ring
 * only) draws a strip right to left and a ring counter-clockwise.
 */
export function Matrix({
  cols,
  rows,
  ring = false,
  reversed = false,
  grid,
  overlay,
  zoom,
  ref,
}: {
  cols: number;
  rows: number;
  ring?: boolean;
  reversed?: boolean;
  /**
   * Which LED each matrix cell shows: entry `row * cols + col` is an LED index, or -1 for a cell
   * without one. Without it the LEDs fill the matrix row by row.
   */
  grid?: Int32Array;
  /** Drawn over the LEDs, at their size and scale (the wiring of a custom matrix). */
  overlay?: ReactNode;
  zoom: Zoom;
  ref?: Ref<MatrixHandle>;
}) {
  const element = useRef<((NeopixelMatrixElement | LEDRingElement) & HTMLElement) | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  // Frames can arrive between renders, so they read the latest size from here.
  const size = useRef({ cols, rows, ring, reversed, grid });
  size.current = { cols, rows, ring, reversed, grid };
  const lastPixels = useRef<ArrayLike<number>>([]);

  // The element draws an SVG with a fixed size in mm, so scaling is a transform on a wrapper
  // whose box is set to the scaled size (that keeps scrolling right at 2×).
  const [box, setBox] = useState({ width: 0, height: 0, scale: 1 });
  useLayoutEffect(() => {
    const el = element.current;
    const container = stage.current;
    if (!el || !container) return;
    let disposed = false;
    const measure = async () => {
      // Lit renders asynchronously: measure only once the SVG has the shape we asked for.
      await el.updateComplete;
      const { cols, rows, ring } = size.current;
      const shaped =
        ring && "pixels" in el
          ? el.pixels === cols
          : !ring && "cols" in el && el.cols === cols && el.rows === rows;
      if (disposed || !shaped) return;
      const width = el.offsetWidth;
      const height = el.offsetHeight;
      if (!width || !height) return;
      const style = getComputedStyle(container);
      const availW = container.clientWidth - parseFloat(style.paddingLeft) * 2;
      const availH = container.clientHeight - parseFloat(style.paddingTop) * 2;
      const scale =
        zoom === "fit"
          ? Math.max(0.05, Math.min(availW / width, availH / height, MAX_FIT_SCALE))
          : zoom;
      setBox({ width: width * scale, height: height * scale, scale });
    };
    void measure();
    const observer = new ResizeObserver(() => void measure());
    observer.observe(container);
    observer.observe(el);
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [zoom, cols, rows, ring]);

  const paint = (pixels: ArrayLike<number>) => {
    lastPixels.current = pixels;
    const el = element.current;
    if (!el) return;
    const { cols, rows, ring, reversed, grid } = size.current;
    const color = (value: number) => ({
      b: (value & 0xff) / 255,
      r: ((value >> 8) & 0xff) / 255,
      g: ((value >> 16) & 0xff) / 255,
    });
    if ("pixels" in el) {
      const layout = { kind: "ring", reversed } as const;
      for (let i = 0; i < el.pixels; i++) {
        el.setPixel(displayPosition(layout, el.pixels, i), color(pixels[i] ?? 0));
      }
      return;
    }
    if (reversed && !ring && rows === 1) {
      const layout = { kind: "strip", reversed } as const;
      for (let i = 0; i < cols; i++) {
        el.setPixel(0, displayPosition(layout, cols, i), color(pixels[i] ?? 0));
      }
      return;
    }
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const index = grid ? grid[row * cols + col] : row * cols + col;
        el.setPixel(row, col, color(index >= 0 ? (pixels[index] ?? 0) : 0));
      }
    }
  };
  // `paint` only reads refs, so the first one stays valid.
  const paintRef = useRef(paint);

  // --- dragging: the LEDs can be moved around the stage; a double click centers them again ---
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [shape, setShape] = useState({ cols, rows, ring });
  if (shape.cols !== cols || shape.rows !== rows || shape.ring !== ring) {
    // A different layout starts centered.
    setShape({ cols, rows, ring });
    setOffset({ x: 0, y: 0 });
  }
  const drag = useRef<{ id: number; x: number; y: number; from: { x: number; y: number } } | null>(
    null,
  );
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !(e.target instanceof Element) || !e.target.closest(".stage-box")) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, from: offset };
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const container = stage.current;
    if (!d || d.id !== e.pointerId || !container) return;
    // Keep at least MIN_VISIBLE pixels of the LEDs inside the stage (the box starts centered).
    const limitX = Math.max(0, (container.clientWidth + box.width) / 2 - MIN_VISIBLE);
    const limitY = Math.max(0, (container.clientHeight + box.height) / 2 - MIN_VISIBLE);
    const clamp = (v: number, limit: number) => Math.min(limit, Math.max(-limit, v));
    setOffset({
      x: clamp(d.from.x + e.clientX - d.x, limitX),
      y: clamp(d.from.y + e.clientY - d.y, limitY),
    });
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
  };

  useImperativeHandle(
    ref,
    () => ({ setPixels: (pixels) => paintRef.current(pixels), clear: () => paintRef.current([]) }),
    [],
  );

  // A new shape redraws the element with all LEDs off, and a new direction moves the LEDs:
  // show the last frame again (also while paused).
  useEffect(() => {
    void element.current?.updateComplete.then(() => paintRef.current(lastPixels.current));
  }, [cols, rows, ring, reversed, grid]);

  return (
    <div
      className={dragging ? "stage dragging" : "stage"}
      ref={stage}
      title="Drag to move the LEDs, double-click to center them"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => setOffset({ x: 0, y: 0 })}
    >
      <div
        className="stage-box"
        style={{
          width: box.width || undefined,
          height: box.height || undefined,
          translate: offset.x || offset.y ? `${offset.x}px ${offset.y}px` : undefined,
        }}
      >
        <div className="stage-scale" style={{ transform: `scale(${box.scale})` }}>
          {ring ? (
            <wokwi-led-ring key="ring" ref={element} pixels={cols} />
          ) : (
            <wokwi-neopixel-matrix key="matrix" ref={element} cols={cols} rows={rows} />
          )}
          {overlay}
        </div>
      </div>
    </div>
  );
}
