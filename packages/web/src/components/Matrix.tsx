import "@wokwi/elements";
import type { NeopixelMatrixElement } from "@wokwi/elements";
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";

export interface MatrixHandle {
  /** `pixels` are GRB words as delivered by `Simulation.onFrame`. */
  setPixels(pixels: ArrayLike<number>): void;
  clear(): void;
}

export type Zoom = "fit" | 1 | 2;

/** Upper bound for "fit", so a handful of LEDs does not fill the whole panel. */
const MAX_FIT_SCALE = 3;

/** LED preview, drawn exactly as configured: a strip is one row, a matrix is `cols`×`rows`. */
export function Matrix({
  cols,
  rows,
  zoom,
  ref,
}: {
  cols: number;
  rows: number;
  zoom: Zoom;
  ref?: Ref<MatrixHandle>;
}) {
  const element = useRef<(NeopixelMatrixElement & HTMLElement) | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  // Frames can arrive between renders, so they read the latest size from here.
  const size = useRef({ cols, rows });
  size.current = { cols, rows };
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
      if (disposed || el.cols !== size.current.cols || el.rows !== size.current.rows) return;
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
  }, [zoom, cols, rows]);

  const paint = (pixels: ArrayLike<number>) => {
    lastPixels.current = pixels;
    const el = element.current;
    if (!el) return;
    const { cols, rows } = size.current;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const value = pixels[row * cols + col] ?? 0;
        el.setPixel(row, col, {
          b: (value & 0xff) / 255,
          r: ((value >> 8) & 0xff) / 255,
          g: ((value >> 16) & 0xff) / 255,
        });
      }
    }
  };
  // `paint` only reads refs, so the first one stays valid.
  const paintRef = useRef(paint);

  useImperativeHandle(
    ref,
    () => ({ setPixels: (pixels) => paintRef.current(pixels), clear: () => paintRef.current([]) }),
    [],
  );

  // A new shape redraws the element with all LEDs off; show the last frame again.
  useEffect(() => {
    void element.current?.updateComplete.then(() => paintRef.current(lastPixels.current));
  }, [cols, rows]);

  return (
    <div className="stage" ref={stage}>
      <div
        className="stage-box"
        style={{ width: box.width || undefined, height: box.height || undefined }}
      >
        <div className="stage-scale" style={{ transform: `scale(${box.scale})` }}>
          <wokwi-neopixel-matrix ref={element} cols={cols} rows={rows} />
        </div>
      </div>
    </div>
  );
}
