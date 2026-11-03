import { describe, expect, it } from "vitest";
import { PinState } from "avr8js";
import { WS2812Controller } from "./ws2812.ts";

const ZERO = { high: 400, low: 850 };
const ONE = { high: 800, low: 450 };

/** Drives a controller with synthetic pin edges, tracking simulated time. */
class Driver {
  t = 1000;
  readonly ctrl: WS2812Controller;
  constructor(ctrl: WS2812Controller) {
    this.ctrl = ctrl;
  }

  pulse(high: number, low: number) {
    this.ctrl.feedValue(PinState.High, this.t);
    this.t += high;
    this.ctrl.feedValue(PinState.Low, this.t);
    this.t += low;
  }

  bit(value: number) {
    const p = value ? ONE : ZERO;
    this.pulse(p.high, p.low);
  }

  /** Sends 24 bits, MSB first. */
  pixel(value: number) {
    for (let i = 23; i >= 0; i--) this.bit((value >> i) & 1);
  }

  /** Idle LOW, then a new rising edge (closes the previous LOW period). */
  idle(ns: number) {
    this.t += ns;
    this.ctrl.feedValue(PinState.High, this.t);
  }

  update() {
    return this.ctrl.update(this.t);
  }
}

const setup = (n: number) => new Driver(new WS2812Controller(n));

describe("WS2812Controller", () => {
  it("decodes a pixel, inferring the last bit", () => {
    const d = setup(1);
    d.pixel(0xa5c3e1);
    expect(d.update()?.[0]).toBe(0xa5c3e1);
  });

  it("decodes all zeros and all ones", () => {
    const zeros = setup(1);
    zeros.pixel(0);
    expect(zeros.update()?.[0]).toBe(0);
    const ones = setup(1);
    ones.pixel(0xffffff);
    expect(ones.update()?.[0]).toBe(0xffffff);
  });

  it("decodes multiple pixels in order", () => {
    const d = setup(3);
    d.pixel(0x112233);
    d.pixel(0x445566);
    d.pixel(0x778899);
    expect(Array.from(d.update()!)).toEqual([0x112233, 0x445566, 0x778899]);
  });

  it("returns null from update() when nothing changed", () => {
    const d = setup(1);
    d.pixel(0x123456);
    expect(d.update()).not.toBeNull();
    expect(d.update()).toBeNull();
  });

  it("accepts HIGH widths at the MARGIN edge and rejects just outside", () => {
    // First bit uses a custom pulse, followed by 23 ones.
    const run = (high: number, low: number) => {
      const d = setup(1);
      d.pulse(high, low);
      for (let i = 0; i < 23; i++) d.bit(1);
      return d.update()?.[0];
    };
    expect(run(400 + 160, 850)).toBe(0x7fffff); // zero, upper bound
    expect(run(400 - 160, 850)).toBe(0x7fffff); // zero, lower bound
    expect(run(800 + 160, 450)).toBe(0xffffff); // one, upper bound
    expect(run(800 - 160, 450)).toBe(0xffffff); // one, lower bound
    // Outside both windows: the bit is dropped, so the frame never completes.
    expect(run(400 + 161, 850)).toBe(0);
    expect(run(400 - 161, 850)).toBe(0);
  });

  it("drops a bit whose LOW period is too short", () => {
    const d = setup(1);
    d.pulse(ZERO.high, 850 - 160 - 1);
    for (let i = 0; i < 23; i++) d.bit(1);
    expect(d.update()?.[0]).toBe(0);
  });

  it("ignores pixels beyond the configured count", () => {
    const d = setup(1);
    d.pixel(0x0000ff);
    d.pixel(0xff0000);
    d.pixel(0x00ff00);
    expect(d.update()?.[0]).toBe(0x0000ff);
  });

  it("resets after a LOW of 50 µs and starts a new frame", () => {
    const d = setup(2);
    d.pixel(0x111111);
    d.pixel(0x222222);
    d.update();
    d.idle(50000);
    // Rest of the pulse after the reset edge
    d.t += 400;
    d.ctrl.feedValue(PinState.Low, d.t);
    d.t += 850;
    for (let i = 0; i < 23; i++) d.bit(0);
    d.pixel(0x333333);
    // Without the reset both slots would be full and the new data would be ignored.
    expect(Array.from(d.update()!)).toEqual([0, 0x333333]);
  });

  it("does not reset on a LOW shorter than 50 µs", () => {
    const d = setup(2);
    d.pixel(0x111111);
    d.idle(49000);
    d.t += 400;
    d.ctrl.feedValue(PinState.Low, d.t);
    d.t += 850;
    // Continues into pixel index 1 rather than overwriting pixel 0
    for (let i = 0; i < 23; i++) d.bit(1);
    d.update();
    expect(d.ctrl.pixels[0]).toBe(0x111111);
  });
});
