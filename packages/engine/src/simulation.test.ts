import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createSimulation } from "./simulation.ts";
import { createLedConfig } from "./led-config.ts";

const hex = readFileSync(new URL("../test/fixtures/rainbow.hex", import.meta.url), "utf8");

describe("Simulation", () => {
  it("steps deterministically and reports serial output, frames and time", () => {
    const frames: Uint32Array[] = [];
    let serial = "";
    const sim = createSimulation({
      hex,
      led: createLedConfig(),
      onFrame: (p) => frames.push(p),
      onSerial: (c) => (serial += c),
    });
    expect(sim.state).toBe("idle");
    for (let i = 0; i < 2000; i++) sim.step(16_000);
    expect(sim.nanos).toBeGreaterThanOrEqual(2000e6);
    expect(serial).toBe("FastLED initialized.\r\n");
    expect(frames.length).toBeGreaterThan(0);
    // Frames are copies: later frames must not mutate earlier ones.
    expect(frames[0]).not.toBe(frames[frames.length - 1]);
  });

  it("single-steps one instruction by default", () => {
    const sim = createSimulation({ hex, led: createLedConfig() });
    sim.step();
    expect(sim.nanos).toBeGreaterThan(0);
    expect(sim.nanos).toBeLessThan(1000);
  });

  it("runs, pauses, resumes and stops", async () => {
    const progress: number[] = [];
    const sim = createSimulation({
      hex,
      led: createLedConfig(),
      onProgress: (n) => progress.push(n),
    });
    sim.start();
    expect(sim.state).toBe("running");
    expect(() => sim.step()).toThrow();
    await new Promise((r) => setTimeout(r, 50));
    sim.pause();
    expect(sim.state).toBe("paused");
    await new Promise((r) => setTimeout(r, 20));
    const paused = sim.nanos;
    await new Promise((r) => setTimeout(r, 50));
    expect(sim.nanos).toBe(paused);
    expect(progress.length).toBeGreaterThan(0);

    sim.start();
    await new Promise((r) => setTimeout(r, 50));
    expect(sim.nanos).toBeGreaterThan(paused);
    sim.stop();
    await new Promise((r) => setTimeout(r, 20));
    const stopped = sim.nanos;
    sim.start();
    await new Promise((r) => setTimeout(r, 30));
    expect(sim.state).toBe("stopped");
    expect(sim.nanos).toBe(stopped);
  });

  it("paces to real time when a speed is set", async () => {
    const sim = createSimulation({ hex, led: createLedConfig() });
    sim.setSpeed(1);
    sim.start();
    await new Promise((r) => setTimeout(r, 300));
    sim.stop();
    // Real time is about 300 ms of simulated time; unthrottled would be several times more.
    expect(sim.nanos).toBeLessThan(450e6);
    expect(sim.nanos).toBeGreaterThan(100e6);
    expect(() => sim.setSpeed(0)).toThrow(RangeError);
  });

  describe("configuration", () => {
    const pin9 = readFileSync(new URL("../test/fixtures/pin9_rgb.hex", import.meta.url), "utf8");

    function lastFrame(hexText: string, led: ReturnType<typeof createLedConfig>) {
      let latest: Uint32Array | null = null;
      const sim = createSimulation({ hex: hexText, led, onFrame: (p) => (latest = p) });
      for (let i = 0; i < 300; i++) sim.step(16_000);
      return latest as Uint32Array | null;
    }

    it("listens on a PORTB pin and converts RGB wire order to GRB words", () => {
      const frame = lastFrame(pin9, createLedConfig({ count: 30, dataPin: 9, colorOrder: "RGB" }));
      expect(frame).not.toBeNull();
      expect(frame!.length).toBe(30);
      expect(frame![0]).toBe(0x00ff00); // red
      expect(frame![1]).toBe(0xff0000); // green
      expect(frame![2]).toBe(0x0000ff); // blue
      expect(frame![29]).toBe((0x20 << 16) | (0x10 << 8) | 0x40);
    });

    it("sees raw wire order when the config says GRB", () => {
      const frame = lastFrame(pin9, createLedConfig({ count: 30, dataPin: 9 }));
      expect(frame![0]).toBe(0xff0000);
    });

    it("sees nothing on a different pin", () => {
      // The decoder reports an initial all-black frame but never decodes a pixel.
      for (const dataPin of [3, 10]) {
        const frame = lastFrame(pin9, createLedConfig({ count: 30, dataPin }));
        expect(frame?.every((word) => word === 0) ?? true).toBe(true);
      }
    });

    it("rejects invalid pins and counts", () => {
      expect(() => createSimulation({ hex, led: createLedConfig({ dataPin: 1 }) })).toThrow(
        RangeError,
      );
      expect(() => createSimulation({ hex, led: createLedConfig({ count: 0 }) })).toThrow(
        RangeError,
      );
    });
  });
});
