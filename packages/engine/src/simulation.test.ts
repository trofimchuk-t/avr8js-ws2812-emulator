import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createSimulation } from "./simulation.ts";

const hex = readFileSync(new URL("../test/fixtures/rainbow.hex", import.meta.url), "utf8");

describe("Simulation", () => {
  it("steps deterministically and reports serial output, frames and time", () => {
    const frames: Uint32Array[] = [];
    let serial = "";
    const sim = createSimulation({
      hex,
      led: { count: 50 },
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
    const sim = createSimulation({ hex, led: { count: 50 } });
    sim.step();
    expect(sim.nanos).toBeGreaterThan(0);
    expect(sim.nanos).toBeLessThan(1000);
  });

  it("runs, pauses, resumes and stops", async () => {
    const progress: number[] = [];
    const sim = createSimulation({ hex, led: { count: 50 }, onProgress: (n) => progress.push(n) });
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
    const sim = createSimulation({ hex, led: { count: 50 } });
    sim.setSpeed(1);
    sim.start();
    await new Promise((r) => setTimeout(r, 300));
    sim.stop();
    // Real time is about 300 ms of simulated time; unthrottled would be several times more.
    expect(sim.nanos).toBeLessThan(450e6);
    expect(sim.nanos).toBeGreaterThan(100e6);
    expect(() => sim.setSpeed(0)).toThrow(RangeError);
  });
});
