import { usart0Config } from "avr8js";
import { AVRRunner, CPU_HZ } from "./execute.ts";
import { WS2812Controller } from "./ws2812.ts";
import { wireToGrb, type LedConfig } from "./led-config.ts";
import { arduinoPinToPort } from "./pins.ts";

const UCSRA_RXC = 0x80;

/** Cycles between frame checks, progress callbacks and event-loop yields (about 31 ms). */
const TICK_CYCLES = 500_000;

export interface SimulationOptions {
  /** Intel HEX program for an ATmega328p. */
  hex: string;
  led: LedConfig;
  /**
   * Called when the decoded LED state changed. Each pixel is a 24-bit GRB word whatever the
   * configured `colorOrder`: G in bits 16–23, R in bits 8–15, B in bits 0–7. The array is a copy that the caller may keep.
   * `nanos` is the simulated time.
   */
  onFrame?: (pixels: Uint32Array, nanos: number) => void;
  /**
   * Called for every byte the sketch writes to Serial, as a one-character string (Latin-1, so
   * every byte value maps to one character), with the simulated time.
   */
  onSerial?: (char: string, nanos: number) => void;
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
  /**
   * Queues bytes for the sketch's Serial input (RX of USART0). A string is sent as UTF-8. Bytes
   * arrive at the configured baud rate, and the next byte is only delivered after the sketch has
   * read the previous one from UDR0, so nothing is lost while interrupts are off (for example in
   * `FastLED.show()`). Bytes wait in the queue until the sketch calls `Serial.begin()`.
   */
  sendSerial(data: string | Uint8Array): void;
  /** Bytes queued by `sendSerial` that the sketch has not received yet. */
  readonly serialPending: number;
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
  /** Bytes waiting for the receiver; `rxHead` is the next one to send. */
  private rxQueue: number[] = [];
  private rxHead = 0;
  /** A byte has been delivered to UDR0 and the sketch has not read it yet. */
  private rxUnread = false;
  private rxLast = 0;

  constructor(options: SimulationOptions) {
    this.options = options;
    const { count } = options.led;
    if (!Number.isInteger(count) || count < 1)
      throw new RangeError("LED count must be a positive integer");
    const { port, bit } = arduinoPinToPort(options.led.dataPin);
    const runner = new AVRRunner(options.hex);
    this.runner = runner;
    this.controller = new WS2812Controller(count);

    const ioPort = port === "B" ? runner.portB : runner.portD;
    ioPort.addListener(() => {
      this.controller.feedValue(ioPort.pinState(bit), this.nanos);
    });
    const usart = runner.usart;
    usart.onByteTransmit = (value: number) => {
      options.onSerial?.(String.fromCharCode(value), this.nanos);
    };
    usart.onRxComplete = () => {
      this.rxUnread = true;
    };
    // Enabling the receiver (Serial.begin) lets queued bytes through.
    usart.onConfigurationChange = () => this.pumpSerial();
    const cpu = runner.cpu;
    const { UDR, UCSRA, UCSRB } = usart0Config;
    const readUdr = cpu.readHooks[UDR];
    cpu.readHooks[UDR] = (addr) => {
      const value = readUdr(addr);
      this.rxUnread = false;
      this.pumpSerial();
      return value;
    };
    // avr8js clears RXC on every UCSR0B write that keeps the receiver on, and Serial.write()
    // toggles UDRIE all the time, so an unread byte would vanish. The real chip keeps it.
    const writeUcsrb = cpu.writeHooks[UCSRB];
    cpu.writeHooks[UCSRB] = (value, oldValue, addr, mask) => {
      const result = writeUcsrb(value, oldValue, addr, mask);
      if (this.rxUnread && !(cpu.data[UCSRA] & UCSRA_RXC)) {
        if (usart.rxEnable) {
          usart.writeByte(this.rxLast, true);
        } else {
          this.rxUnread = false;
        }
      }
      return result;
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
    this.rxQueue = [];
    this.rxHead = 0;
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

  get serialPending() {
    return this.rxQueue.length - this.rxHead;
  }

  sendSerial(data: string | Uint8Array) {
    if (this._state === "stopped") return;
    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
    for (const byte of bytes) this.rxQueue.push(byte);
    this.pumpSerial();
  }

  /** Hands the next queued byte to the receiver if it is free and the last byte was read. */
  private pumpSerial() {
    if (this.rxHead >= this.rxQueue.length || this.rxUnread) return;
    const usart = this.runner.usart;
    if (usart.rxBusy || !usart.rxEnable) return;
    this.rxLast = this.rxQueue[this.rxHead++];
    usart.writeByte(this.rxLast);
    if (this.rxHead === this.rxQueue.length) {
      this.rxQueue = [];
      this.rxHead = 0;
    }
  }

  private resetAnchor() {
    this.anchorWall = performance.now();
    this.anchorCycles = this.runner.cpu.cycles;
  }

  private emitFrame() {
    const pixels = this.controller.update(this.nanos);
    if (!pixels) return;
    const order = this.options.led.colorOrder;
    const copy = order === "GRB" ? pixels.slice() : pixels.map((word) => wireToGrb(word, order));
    this.options.onFrame?.(copy, this.nanos);
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
