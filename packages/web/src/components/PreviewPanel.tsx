import { wiringGrid, type LedConfig } from "@avr8js-ws2812/engine";
import { Maximize2, Minimize2, Pencil } from "lucide-react";
import { useMemo, type RefObject } from "react";
import { usePref } from "../lib/storage";
import { Matrix, type MatrixHandle, type Zoom } from "./Matrix";
import { IconButton } from "./ui";
import { useWiringEditor, WiringBar, WiringOverlay } from "./WiringEditor";

const ZOOMS: { value: Zoom; label: string }[] = [
  { value: "fit", label: "Fit" },
  { value: 1, label: "1×" },
  { value: 2, label: "2×" },
];

function describe(led: LedConfig): string {
  const { layout } = led;
  switch (layout.kind) {
    case "matrix":
      return `${layout.cols}×${layout.rows} matrix`;
    case "custom":
      return `${layout.cols}×${layout.rows} custom matrix · ${led.count} LEDs`;
    case "ring":
      return `${led.count} LED ring${layout.reversed ? ", counter-clockwise" : ""}`;
    case "strip":
      return `${led.count} LED strip${layout.reversed ? ", right to left" : ""}`;
  }
}

export function PreviewPanel({
  led,
  matrix,
  onChange,
  maximized = false,
  onToggleMaximized,
}: {
  /** The layout being shown: the running one, or the project settings. */
  led: LedConfig;
  matrix: RefObject<MatrixHandle | null>;
  /** Changes the project's LED settings (the wiring editor of a custom matrix). */
  onChange?: (led: LedConfig) => void;
  /** The preview covers the whole workspace (the toolbar stays visible). */
  maximized?: boolean;
  onToggleMaximized?: () => void;
}) {
  const [zoom, setZoom] = usePref<Zoom>("zoom", "fit");
  const wiring = useWiringEditor(led, onChange);
  const { layout } = led;
  const grid = useMemo(() => (wiring ? wiringGrid(wiring.layout) : undefined), [wiring?.layout]);

  let cols = led.count;
  let rows = 1;
  if (layout.kind === "matrix" || layout.kind === "custom") ({ cols, rows } = layout);
  const reversed = (layout.kind === "strip" || layout.kind === "ring") && !!layout.reversed;

  return (
    <section className={`preview${maximized ? " maximized" : ""}`} aria-label="LED preview">
      <div className="panel-header">
        <h2>Preview</h2>
        <span className="panel-meta">{describe(led)}</span>
        <div className="spacer" />
        {wiring && !wiring.editing && (
          <button className="button small" onClick={() => wiring.setEditing(true)}>
            <Pencil size={14} aria-hidden />
            Edit wiring
          </button>
        )}
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
        {onToggleMaximized && (
          <IconButton
            label={maximized ? "Restore preview (Esc)" : "Maximize preview"}
            aria-pressed={maximized}
            onClick={onToggleMaximized}
          >
            {maximized ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </IconButton>
        )}
      </div>
      {wiring?.editing && <WiringBar editor={wiring} />}
      <Matrix
        ref={matrix}
        cols={cols}
        rows={rows}
        ring={layout.kind === "ring"}
        reversed={reversed}
        grid={grid}
        overlay={wiring && <WiringOverlay editor={wiring} />}
        zoom={zoom}
      />
    </section>
  );
}
