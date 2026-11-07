import "@wokwi/elements";
import type { NeopixelMatrixElement } from "@wokwi/elements";
import { useImperativeHandle, useRef, type Ref } from "react";

export interface MatrixHandle {
  /** `pixels` are GRB words as delivered by `Simulation.onFrame`. */
  setPixels(pixels: ArrayLike<number>): void;
  clear(): void;
}

export function Matrix({
  cols,
  rows,
  ref,
}: {
  cols: number;
  rows: number;
  ref?: Ref<MatrixHandle>;
}) {
  const element = useRef<(NeopixelMatrixElement & HTMLElement) | null>(null);
  // Frames can arrive between renders, so they read the latest size from here.
  const size = useRef({ cols, rows });
  size.current = { cols, rows };

  useImperativeHandle(ref, () => {
    const setPixels = (pixels: ArrayLike<number>) => {
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
    return { setPixels, clear: () => setPixels([]) };
  }, []);

  return (
    <div className="pixels">
      <wokwi-neopixel-matrix ref={element} cols={cols} rows={rows} />
    </div>
  );
}
