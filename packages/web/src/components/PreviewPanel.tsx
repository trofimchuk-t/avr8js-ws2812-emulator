import type { LedConfig } from "@avr8js-ws2812/engine";
import type { RefObject } from "react";
import { usePref } from "../lib/storage";
import { Matrix, type MatrixHandle, type Zoom } from "./Matrix";

const ZOOMS: { value: Zoom; label: string }[] = [
  { value: "fit", label: "Fit" },
  { value: 1, label: "1×" },
  { value: 2, label: "2×" },
];

export function PreviewPanel({
  led,
  matrix,
}: {
  /** The layout being shown: the running one, or the project settings. */
  led: LedConfig;
  matrix: RefObject<MatrixHandle | null>;
}) {
  const [zoom, setZoom] = usePref<Zoom>("zoom", "fit");
  const cols = led.layout.kind === "matrix" ? led.layout.cols : led.count;
  const rows = led.layout.kind === "matrix" ? led.layout.rows : 1;
  return (
    <section className="preview" aria-label="LED preview">
      <div className="panel-header">
        <h2>Preview</h2>
        <span className="panel-meta">
          {led.layout.kind === "matrix" ? `${cols}×${rows} matrix` : `${led.count} LED strip`}
        </span>
        <div className="spacer" />
        <div className="segmented" role="group" aria-label="Zoom">
          {ZOOMS.map((z) => (
            <button
              key={z.label}
              className="segment"
              aria-pressed={zoom === z.value}
              onClick={() => setZoom(z.value)}
            >
              {z.label}
            </button>
          ))}
        </div>
      </div>
      <Matrix ref={matrix} cols={cols} rows={rows} zoom={zoom} />
    </section>
  );
}
