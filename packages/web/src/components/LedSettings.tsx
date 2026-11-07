import { useState } from "react";
import { COLOR_ORDERS, MAX_LEDS, type ColorOrder, type LedConfig } from "@avr8js-ws2812/engine";

const PINS = Array.from({ length: 12 }, (_, i) => i + 2);

/** Text input that only commits whole numbers inside the range, and restores the value on blur. */
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
  return (
    <label>
      {label}
      <input
        type="text"
        inputMode="numeric"
        size={5}
        value={text ?? String(value)}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() !== "" && Number.isInteger(n) && n >= min && n <= max) {
            onCommit(n);
          }
        }}
        onBlur={() => setText(null)}
      />
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
      <label>
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
      <label>
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
      <label>
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
            max={MAX_LEDS}
            onCommit={(cols) => {
              if (cols * layout.rows > MAX_LEDS) return;
              onChange({ ...led, count: cols * layout.rows, layout: { ...layout, cols } });
            }}
          />
          <NumberField
            label="Rows"
            value={layout.rows}
            min={1}
            max={MAX_LEDS}
            onCommit={(rows) => {
              if (layout.cols * rows > MAX_LEDS) return;
              onChange({ ...led, count: layout.cols * rows, layout: { ...layout, rows } });
            }}
          />
        </>
      )}
    </div>
  );
}
