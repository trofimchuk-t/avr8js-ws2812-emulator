import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { COLOR_ORDERS, MAX_LEDS, type ColorOrder, type LedConfig } from "@avr8js-ws2812/engine";

const PINS = Array.from({ length: 12 }, (_, i) => i + 2);

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
            onChange={(e) =>
              onChange(
                e.target.value === "matrix"
                  ? { ...led, layout: { kind: "matrix", cols: led.count, rows: 1 } }
                  : { ...led, layout: { kind: "strip" } },
              )
            }
          >
            <option value="strip">Strip</option>
            <option value="matrix">Matrix</option>
          </select>
        </label>
        {layout.kind === "strip" ? (
          <NumberField
            label="LEDs"
            value={led.count}
            min={1}
            max={MAX_LEDS}
            onCommit={(count) => onChange({ ...led, count })}
          />
        ) : (
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
      </div>
    </div>
  );
}
