import {
  createSimulation,
  type LedConfig,
  type Simulation,
  type SketchFile,
} from "@avr8js-ws2812/engine";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { MatrixHandle } from "../components/Matrix";
import { buildHex } from "../compile";
import { errorText } from "../lib/errors";
import {
  EMPTY_LOG,
  appendInput,
  appendOutput,
  type SerialChunk,
  type SerialLog,
} from "../lib/serial";
import { usePref } from "../lib/storage";

/** How often buffered serial output and the simulated time reach React state. */
const FLUSH_MS = 100;

export type RunState = "idle" | "compiling" | "running" | "paused";
/** Multiple of real time; `0` stands for "as fast as possible" (stored as JSON, so no Infinity). */
export type Speed = 0 | 1;

export interface CompileOutput {
  text: string;
  /** The build failed (compiler error or server failure). */
  failed: boolean;
}

/**
 * Compiles and runs the sketch, and collects compiler output, the serial terminal log and the
 * simulated time.
 */
export function useSimulation(matrix: RefObject<MatrixHandle | null>) {
  const simulation = useRef<Simulation | null>(null);
  const alive = useRef(true);
  const [runState, setRunState] = useState<RunState>("idle");
  const [runningLed, setRunningLed] = useState<LedConfig | null>(null);
  const [compileOutput, setCompileOutput] = useState<CompileOutput | null>(null);
  const [serial, setSerial] = useState<SerialLog>(EMPTY_LOG);
  const [nanos, setNanos] = useState<number | null>(null);
  const [speed, setSpeedPref] = usePref<Speed>("speed", 0);
  /** Output not yet in `serial`; a new chunk starts after every "\n". */
  const serialBuffer = useRef<SerialChunk[]>([]);
  const latestNanos = useRef<number | null>(null);

  const takeSerial = () => {
    const chunks = serialBuffer.current;
    serialBuffer.current = [];
    return chunks;
  };

  useEffect(() => {
    alive.current = true;
    const timer = setInterval(() => {
      const chunks = takeSerial();
      if (chunks.length) setSerial((prev) => appendOutput(prev, chunks));
      setNanos(latestNanos.current);
    }, FLUSH_MS);
    return () => {
      alive.current = false;
      clearInterval(timer);
      simulation.current?.stop();
      simulation.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    simulation.current?.stop();
    simulation.current = null;
    latestNanos.current = null;
    setNanos(null);
    setRunState("idle");
  }, []);

  const pause = useCallback(() => {
    if (simulation.current?.state !== "running") return;
    simulation.current.pause();
    setRunState("paused");
  }, []);

  const resume = useCallback(() => {
    if (simulation.current?.state !== "paused") return;
    simulation.current.start();
    setRunState("running");
  }, []);

  const setSpeed = useCallback(
    (next: Speed) => {
      setSpeedPref(next);
      simulation.current?.setSpeed(next || Infinity);
    },
    [setSpeedPref],
  );

  const run = useCallback(
    async ({ files, main, led }: { files: SketchFile[]; main: string; led: LedConfig }) => {
      stop();
      setSerial(EMPTY_LOG);
      serialBuffer.current = [];
      matrix.current?.clear();
      setRunState("compiling");
      try {
        const result = await buildHex(files, main);
        if (!alive.current) return;
        setCompileOutput({ text: result.stderr || result.stdout, failed: !result.hex });
        if (!result.hex) {
          setRunState("idle");
          return;
        }
        setRunningLed(led);
        const sim = createSimulation({
          hex: result.hex,
          led,
          onSerial: (char, time) => {
            const chunks = serialBuffer.current;
            const last = chunks[chunks.length - 1];
            if (last && !last.text.endsWith("\n")) last.text += char;
            else chunks.push({ text: char, nanos: time });
          },
          onProgress: (time) => {
            latestNanos.current = time;
          },
          onFrame: (pixels) => matrix.current?.setPixels(pixels),
        });
        sim.setSpeed(speed || Infinity);
        simulation.current = sim;
        sim.start();
        setRunState("running");
      } catch (err) {
        if (!alive.current) return;
        setCompileOutput({ text: errorText(err), failed: true });
        setRunState("idle");
      }
    },
    [matrix, speed, stop],
  );

  /** Sends `command` plus `ending` to the running sketch and echoes the command in the log. */
  const send = useCallback((command: string, ending: string) => {
    const sim = simulation.current;
    if (!sim || (sim.state !== "running" && sim.state !== "paused")) return false;
    sim.sendSerial(command + ending);
    // Output so far goes before the echo.
    const chunks = takeSerial();
    const time = sim.nanos;
    setSerial((prev) => appendInput(appendOutput(prev, chunks), command, time));
    return true;
  }, []);

  return {
    runState,
    runningLed,
    compileOutput,
    clearCompileOutput: useCallback(() => setCompileOutput(null), []),
    serial,
    clearSerial: useCallback(() => setSerial(EMPTY_LOG), []),
    send,
    nanos,
    speed,
    setSpeed,
    run,
    stop,
    pause,
    resume,
  };
}
