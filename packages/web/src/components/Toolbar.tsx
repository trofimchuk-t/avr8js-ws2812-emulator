import { formatTime } from "@avr8js-ws2812/engine";
import { Loader2, Pause, Play, RotateCw, Square } from "lucide-react";
import type { RunState, Speed } from "../hooks/useSimulation";
import { shortcutText } from "../lib/shortcuts";

const STATUS: Record<RunState, string> = {
  idle: "Stopped",
  compiling: "Compiling…",
  running: "Running",
  paused: "Paused",
};

const SPEEDS: { value: Speed; label: string; title: string }[] = [
  { value: 0, label: "Max", title: "As fast as the browser allows" },
  { value: 1, label: "1×", title: "Real time (16 MHz)" },
];

export function Toolbar({
  runState,
  nanos,
  speed,
  disabled,
  onRun,
  onStop,
  onPause,
  onResume,
  onSpeed,
}: {
  runState: RunState;
  nanos: number | null;
  speed: Speed;
  /** No project is open. */
  disabled?: boolean;
  onRun: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  onSpeed: (speed: Speed) => void;
}) {
  const active = runState === "running" || runState === "paused";
  return (
    <div className="toolbar" role="toolbar" aria-label="Simulation">
      <button
        className="button primary"
        onClick={onRun}
        disabled={disabled || runState === "compiling"}
        title={`${active ? "Compile and restart" : "Compile and run"} (${shortcutText("run")})`}
      >
        {runState === "compiling" ? (
          <Loader2 size={16} className="spin" aria-hidden />
        ) : active ? (
          <RotateCw size={16} aria-hidden />
        ) : (
          <Play size={16} aria-hidden />
        )}
        {active ? "Restart" : "Run"}
      </button>
      <button
        className="button"
        onClick={onStop}
        disabled={!active}
        title={`Stop (${shortcutText("stop")})`}
      >
        <Square size={14} aria-hidden />
        Stop
      </button>
      <button
        className="button"
        onClick={runState === "paused" ? onResume : onPause}
        disabled={!active}
        aria-pressed={runState === "paused"}
      >
        {runState === "paused" ? <Play size={14} aria-hidden /> : <Pause size={14} aria-hidden />}
        {runState === "paused" ? "Resume" : "Pause"}
      </button>

      <div className="toolbar-divider" aria-hidden />
      <div className="segmented" role="group" aria-label="Speed">
        <span className="segmented-label">Speed</span>
        {SPEEDS.map((s) => (
          <button
            key={s.value}
            className="segment"
            aria-pressed={speed === s.value}
            title={s.title}
            onClick={() => onSpeed(s.value)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="spacer" />
      <div className="run-status" role="status">
        <span className={`status-dot ${runState}`} aria-hidden />
        <span>{STATUS[runState]}</span>
        {nanos !== null && <span className="sim-time">{formatTime(nanos / 1e9)}</span>}
      </div>
    </div>
  );
}
