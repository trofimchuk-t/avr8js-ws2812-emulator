import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  RotateCw,
  type LucideIcon,
} from "lucide-react";
import {
  COLOR_ORDERS,
  MAX_LEDS,
  clipSegments,
  rowSegments,
  segmentsLedCount,
  type ColorOrder,
  type CustomLayout,
  type LedConfig,
  type LedSegment,
} from "@avr8js-ws2812/engine";

const PINS = Array.from({ length: 12 }, (_, i) => i + 2);

/** Direction buttons for each layout that has one (`reversed` is the stored value). */
const DIRECTIONS: Record<
  "strip" | "ring",
  { reversed: boolean; label: string; Icon: LucideIcon }[]
> = {
  strip: [
    { reversed: false, label: "Left to right", Icon: ArrowRight },
    { reversed: true, label: "Right to left", Icon: ArrowLeft },
  ],
  ring: [
    { reversed: false, label: "Clockwise", Icon: RotateCw },
    { reversed: true, label: "Counter-clockwise", Icon: RotateCcw },
  ],
};

type LayoutKind = LedConfig["layout"]["kind"];

/** Rows left to right, top to bottom, with only `count` LEDs (the last row may be short). */
function fillRows(cols: number, rows: number, count: number): LedSegment[] {
  return clipSegments(rowSegments(cols, rows), cols, rows)
    .map((segment) => ({
      ...segment,
      length: Math.min(segment.length, count - segment.row * cols),
    }))
    .filter((segment) => segment.length > 0);
}

/** Switches the layout type, keeping as much of the current setup as makes sense. */
function withLayoutKind(led: LedConfig, kind: LayoutKind): LedConfig {
  const { layout } = led;
  switch (kind) {
    case "strip":
    case "ring":
      return {
        ...led,
        layout: {
          kind,
          // Switching between strip and ring keeps the direction.
          ...((layout.kind === "strip" || layout.kind === "ring") &&
            layout.reversed && { reversed: true }),
        },
      };
    case "matrix":
      return layout.kind === "custom"
        ? {
            ...led,
            count: layout.cols * layout.rows,
            layout: { kind: "matrix", cols: layout.cols, rows: layout.rows },
          }
        : { ...led, layout: { kind: "matrix", cols: led.count, rows: 1 } };
    case "custom": {
      // A matrix keeps its grid (wired as rows, like before); anything else gets a roughly
      // square grid filled row by row with the same number of LEDs.
      const cols = layout.kind === "matrix" ? layout.cols : Math.ceil(Math.sqrt(led.count));
      const rows = layout.kind === "matrix" ? layout.rows : Math.ceil(led.count / cols);
      const segments = fillRows(cols, rows, led.count);
      return {
        ...led,
        count: segmentsLedCount(segments),
        layout: { kind: "custom", cols, rows, segments },
      };
    }
  }
}

/** New grid size for a custom matrix: segments are cut at the new edge. */
function resizeCustom(led: LedConfig, layout: CustomLayout, cols: number, rows: number): LedConfig {
  let segments = clipSegments(layout.segments, cols, rows);
  // Nothing left inside the grid: start again from plain rows rather than an empty wiring.
  if (segments.length === 0) segments = rowSegments(cols, rows);
  return {
    ...led,
    count: segmentsLedCount(segments),
    layout: { ...layout, cols, rows, segments },
  };
}

/**
 * Whole-number field with ▲/▼ steppers. Typing is only applied when the field loses focus or on
 * Enter; the steppers and the ↑/↓ keys apply at once. Text that is not a number in range is
 * dropped and the field shows the current value again.
 */
function NumberField({
  label,
  value,
  min,
  max,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
}) {
  const [text, setText] = useState<string | null>(null);

  const commitText = () => {
    if (text === null) return;
    const n = Number(text);
    if (text.trim() !== "" && Number.isInteger(n) && n >= min && n <= max && n !== value) {
      onCommit(n);
    }
    setText(null);
  };
  const step = (delta: number) => {
    const base = text !== null && Number.isInteger(Number(text)) ? Number(text) : value;
    const next = Math.min(max, Math.max(min, base + delta));
    setText(null);
    if (next !== value) onCommit(next);
  };

  return (
    <label className="led-field">
      {label}
      <span className="stepper">
        <input
          type="text"
          inputMode="numeric"
          value={text ?? String(value)}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitText();
            } else if (e.key === "Escape") {
              setText(null);
            } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              step(e.key === "ArrowUp" ? 1 : -1);
            }
          }}
        />
        <span className="stepper-buttons">
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Increase ${label}`}
            disabled={value >= max}
            // Keep focus (and any typed text) in the input.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => step(1)}
          >
            <ChevronUp size={12} aria-hidden />
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Decrease ${label}`}
            disabled={value <= min}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => step(-1)}
          >
            <ChevronDown size={12} aria-hidden />
          </button>
        </span>
      </span>
    </label>
  );
}

export function LedSettings({
  led,
  onChange,
}: {
  led: LedConfig;
  onChange: (led: LedConfig) => void;
}) {
  const { layout } = led;
  return (
    <div className="led-settings">
      <div className="led-row">
        <label className="led-field">
          Data pin
          <select
            value={led.dataPin}
            onChange={(e) => onChange({ ...led, dataPin: Number(e.target.value) })}
          >
            {PINS.map((pin) => (
              <option key={pin} value={pin}>
                D{pin}
              </option>
            ))}
          </select>
        </label>
        <label className="led-field">
          Color order
          <select
            value={led.colorOrder}
            onChange={(e) => onChange({ ...led, colorOrder: e.target.value as ColorOrder })}
          >
            {COLOR_ORDERS.map((order) => (
              <option key={order}>{order}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="led-row">
        <label className="led-field">
          Layout
          <select
            value={layout.kind}
            onChange={(e) => onChange(withLayoutKind(led, e.target.value as LayoutKind))}
          >
            <option value="strip">Strip</option>
            <option value="ring">Ring</option>
            <option value="matrix">Matrix</option>
            <option value="custom">Custom matrix</option>
          </select>
        </label>
        {(layout.kind === "strip" || layout.kind === "ring") && (
          <>
            <NumberField
              label="LEDs"
              value={led.count}
              min={1}
              max={MAX_LEDS}
              onCommit={(count) => onChange({ ...led, count })}
            />
            <div className="led-field">
              <span id="led-direction">Direction</span>
              <div className="segmented led-direction" role="group" aria-labelledby="led-direction">
                {DIRECTIONS[layout.kind].map(({ reversed, label, Icon }) => (
                  <button
                    key={label}
                    type="button"
                    className="segment"
                    aria-label={label}
                    title={label}
                    aria-pressed={!!layout.reversed === reversed}
                    onClick={() =>
                      onChange({
                        ...led,
                        layout: reversed ? { kind: layout.kind, reversed } : { kind: layout.kind },
                      })
                    }
                  >
                    <Icon size={16} aria-hidden />
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        {layout.kind === "matrix" && (
          <>
            <NumberField
              label="Columns"
              value={layout.cols}
              min={1}
              max={Math.floor(MAX_LEDS / layout.rows)}
              onCommit={(cols) =>
                onChange({ ...led, count: cols * layout.rows, layout: { ...layout, cols } })
              }
            />
            <NumberField
              label="Rows"
              value={layout.rows}
              min={1}
              max={Math.floor(MAX_LEDS / layout.cols)}
              onCommit={(rows) =>
                onChange({ ...led, count: layout.cols * rows, layout: { ...layout, rows } })
              }
            />
          </>
        )}
        {layout.kind === "custom" && (
          <>
            <NumberField
              label="Columns"
              value={layout.cols}
              min={1}
              max={Math.floor(MAX_LEDS / layout.rows)}
              onCommit={(cols) => onChange(resizeCustom(led, layout, cols, layout.rows))}
            />
            <NumberField
              label="Rows"
              value={layout.rows}
              min={1}
              max={Math.floor(MAX_LEDS / layout.cols)}
              onCommit={(rows) => onChange(resizeCustom(led, layout, layout.cols, rows))}
            />
            <div className="led-field">
              <span id="led-custom-count">LEDs</span>
              <output className="led-output" aria-labelledby="led-custom-count">
                {led.count}
              </output>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
