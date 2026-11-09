import type { LedConfig, SketchConfigResult } from "@avr8js-ws2812/engine";
import { AlertTriangle, Info } from "lucide-react";
import { LedSettings } from "./LedSettings";

/** LED settings plus what the sketch itself declares, with a one-click fix when they differ. */
export function HardwarePanel({
  led,
  sketchConfig,
  runningLed,
  onChange,
  onRestart,
}: {
  led: LedConfig;
  sketchConfig: SketchConfigResult;
  /** The settings of the simulation that is running or paused, if any. */
  runningLed: LedConfig | null;
  onChange: (led: LedConfig) => void;
  onRestart: () => void;
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

  // The layout is only drawing, so the preview follows it at once. Pin, count and color order
  // are part of the decoding, so a running simulation needs a restart to pick them up.
  const stale =
    runningLed &&
    (runningLed.dataPin !== led.dataPin ||
      runningLed.count !== led.count ||
      runningLed.colorOrder !== led.colorOrder);

  return (
    <section className="hardware" aria-label="Hardware">
      <div className="panel-header">
        <h2>Hardware</h2>
        <span className="panel-meta">WS2812B on ATmega328p</span>
      </div>
      <div className="hardware-body">
        <LedSettings led={led} onChange={onChange} />
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
        {stale && (
          <div className="banner info" role="status">
            <Info size={16} aria-hidden />
            <div>
              The running simulation still uses D{runningLed.dataPin}, {runningLed.count} LEDs,{" "}
              {runningLed.colorOrder}.
              <button className="button small" onClick={onRestart}>
                Restart with these settings
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
