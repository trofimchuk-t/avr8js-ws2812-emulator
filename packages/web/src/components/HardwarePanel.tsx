import type { LedConfig, SketchConfigResult } from "@avr8js-ws2812/engine";
import { AlertTriangle, Info } from "lucide-react";
import { LedSettings } from "./LedSettings";

/** LED settings plus what the sketch itself declares, with a one-click fix when they differ. */
export function HardwarePanel({
  led,
  sketchConfig,
  onChange,
}: {
  led: LedConfig;
  sketchConfig: SketchConfigResult;
  onChange: (led: LedConfig) => void;
}) {
  const { found, config, warnings } = sketchConfig;
  const mismatches: string[] = [];
  if (found.dataPin && config.dataPin !== led.dataPin) {
    mismatches.push(`pin D${config.dataPin} (settings: D${led.dataPin})`);
  }
  if (found.count && config.count !== led.count) {
    mismatches.push(`${config.count} LEDs (settings: ${led.count})`);
  }
  if (found.colorOrder && config.colorOrder !== led.colorOrder) {
    mismatches.push(`color order ${config.colorOrder} (settings: ${led.colorOrder})`);
  }

  return (
    <section className="hardware" aria-label="Hardware">
      <div className="panel-header">
        <h2>Hardware</h2>
        <span className="panel-meta">WS2812B on ATmega328p</span>
      </div>
      <div className="hardware-body">
        {mismatches.length > 0 && (
          <div className="banner warn" role="status">
            <AlertTriangle size={16} aria-hidden />
            <div>
              The sketch says {mismatches.join(", ")}.
              <button
                className="button small"
                onClick={() =>
                  onChange({
                    ...led,
                    ...(found.dataPin && { dataPin: config.dataPin }),
                    ...(found.count && { count: config.count, layout: { kind: "strip" } }),
                    ...(found.colorOrder && { colorOrder: config.colorOrder }),
                  })
                }
              >
                Use the sketch values
              </button>
            </div>
          </div>
        )}
        {warnings.map((warning) => (
          <div key={warning} className="banner info">
            <Info size={16} aria-hidden />
            <div>{warning}</div>
          </div>
        ))}
        <LedSettings led={led} onChange={onChange} />
      </div>
    </section>
  );
}
