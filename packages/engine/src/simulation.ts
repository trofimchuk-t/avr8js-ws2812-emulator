import { AVRRunner, CPU_HZ } from "./execute.ts";
import { WS2812Controller } from "./ws2812.ts";

/** Arduino D3 = PORTD bit 3. Becomes configurable with `LedConfig.dataPin` in phase 3. */
const DATA_PORT_D_BIT = 3;

/** Cycles between frame checks, progress callbacks and event-loop yields (about 31 ms). */
const TICK_CYCLES = 500_000;

export interface LedConfig {
  /** Number of LEDs in the strip or matrix. */
  count: number;
}

export interface SimulationOptions {
  /** Intel HEX program for an ATmega328p. */
  hex: string;
  led: LedConfig;
  /**
   * Called when the decoded LED state changed. Each pixel is a 24-bit GRB word: G in bits 16–23,
   * R in bits 8–15, B in bits 0–7. The array is a copy that the caller may keep.
   * `nanos` is the simulated time.
   */
  onFrame?: (pixels: Uint32Array, nanos: number) => void;
  /** Called for every byte the sketch writes to Serial, as a one-character string. */
  onSerial?: (char: string) => void;
  /** Called about every 31 ms of simulated time while running, with the simulated time. */
  onProgress?: (nanos: number) => void;
}

export type SimulationState = "idle" | "running" | "paused" | "stopped";

export interface Simulation {
  readonly state: SimulationState;
  /** Simulated time in nanoseconds. */
  readonly nanos: number;
  /** Starts, or resumes after `pause()`. Does nothing once stopped. */
  start(): void;
  /** Halts at the next yield and keeps the state, so `start()` or `step()` can continue. */
  pause(): void;
  /** Ends the simulation for good. Create a new one to run again. */
  stop(): void;
  /**
   * Runs synchronously for at least `cycles` CPU cycles (default 1, so one instruction) and then
   * reports a frame if there is one. Only valid when not running; used for single-stepping and
   * deterministic tests.
   */
  step(cycles?: number): void;
  /**
   * Target speed as a multiple of real time. `1` is real time (16 MHz), `Infinity` (the default)
   * runs as fast as the host allows. The host may be too slow to reach the target.
   */
  setSpeed(multiplier: number): void;
}

export function cyclesToNanos(cycles: number) {
  return Math.round((cycles / CPU_HZ) * 1e9);
}

export function createSimulation(options: SimulationOptions): Simulation {
  return new SimulationImpl(options);
}

class SimulationImpl implements Simulation {
  private readonly runner: AVRRunner;
  private readonly controller: WS2812Controller;
  private readonly options: SimulationOptions;

  private _state: SimulationState = "idle";
  private speed = Infinity;
  /** Incremented on every start so that a stale loop (paused, then resumed) exits. */
  private runId = 0;
  /** Real-time pacing anchor: wall clock and CPU cycles at the last (re)start or speed change. */
  private anchorWall = 0;
  private anchorCycles = 0;

  constructor(options: SimulationOptions) {
    this.options = options;
    const runner = new AVRRunner(options.hex);
    this.runner = runner;
    this.controller = new WS2812Controller(options.led.count);

    runner.portD.addListener(() => {
      this.controller.feedValue(runner.portD.pinState(DATA_PORT_D_BIT), this.nanos);
    });
    runner.usart.onByteTransmit = (value: number) => {
      options.onSerial?.(String.fromCharCode(value));
    };
  }

  get state() {
    return this._state;
  }

  get nanos() {
    return cyclesToNanos(this.runner.cpu.cycles);
  }

  start() {
    if (this._state === "running" || this._state === "stopped") return;
    this._state = "running";
    this.resetAnchor();
    void this.loop(++this.runId);
  }

  pause() {
    if (this._state === "running") this._state = "paused";
  }

  stop() {
    this._state = "stopped";
  }

  step(cycles = 1) {
    if (this._state === "running") throw new Error("Cannot step while running; call pause() first");
    if (this._state === "stopped") return;
    this.runner.runUntil(this.runner.cpu.cycles + cycles);
    this.emitFrame();
  }

  setSpeed(multiplier: number) {
    if (!(multiplier > 0)) throw new RangeError("Speed must be a positive number");
    this.speed = multiplier;
    this.resetAnchor();
  }

  private resetAnchor() {
    this.anchorWall = performance.now();
    this.anchorCycles = this.runner.cpu.cycles;
  }

  private emitFrame() {
    const pixels = this.controller.update(this.nanos);
    if (pixels) this.options.onFrame?.(pixels.slice(), this.nanos);
  }

  private async loop(id: number) {
    const cpu = this.runner.cpu;
    while (this._state === "running" && this.runId === id) {
      this.runner.runUntil(cpu.cycles + TICK_CYCLES);
      this.emitFrame();
      this.options.onProgress?.(this.nanos);
      await new Promise((resolve) => setTimeout(resolve, this.delayMs()));
    }
  }

  /** Time to wait before the next chunk so that the simulation does not outrun `speed`. */
  private delayMs() {
    if (this.speed === Infinity) return 0;
    const targetWall =
      this.anchorWall + ((this.runner.cpu.cycles - this.anchorCycles) / CPU_HZ / this.speed) * 1000;
    return Math.max(0, targetWall - performance.now());
  }
}
