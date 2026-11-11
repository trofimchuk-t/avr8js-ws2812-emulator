import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createSimulation } from "../src/simulation.ts";
import { validateSerialConfig } from "../src/serial-config.ts";
import golden from "./fixtures/golden.json" with { type: "json" };
import type { LedConfig } from "../src/led-config.ts";

const hex = readFileSync(new URL("./fixtures/serial_commands.hex", import.meta.url), "utf8");
const led = golden.serial_commands.led as LedConfig;
const MS = 16_000;

function start() {
  let serial = "";
  let frame: Uint32Array | null = null;
  const sim = createSimulation({
    hex,
    led,
    onSerial: (c) => (serial += c),
    onFrame: (p) => (frame = p),
  });
  const run = (ms: number) => {
    for (let i = 0; i < ms; i++) sim.step(MS);
  };
  return { sim, run, serial: () => serial, frame: () => frame };
}

describe("Simulation.sendSerial", () => {
  it("delivers bytes that the sketch echoes back", () => {
    const t = start();
    t.run(50);
    expect(t.serial()).toContain("Commands:");
    t.sim.sendSerial("echo hello, world\n");
    t.run(50);
    expect(t.serial()).toContain("\r\nhello, world\r\n");
    expect(t.sim.serialPending).toBe(0);
  });

  it("queues bytes sent before Serial.begin()", () => {
    const t = start();
    t.sim.sendSerial("echo early\r");
    expect(t.sim.serialPending).toBe(11);
    t.run(50);
    expect(t.serial()).toContain("early\r\n");
  });

  it("loses nothing while the sketch is busy with FastLED.show()", () => {
    const t = start();
    t.run(20);
    const text = "x".repeat(50);
    // Many lines at once overflow the 64-byte Arduino ring buffer unless delivery is paced.
    for (let i = 0; i < 5; i++) t.sim.sendSerial(new TextEncoder().encode(`echo ${i}${text}\n`));
    t.run(200);
    for (let i = 0; i < 5; i++) expect(t.serial()).toContain(`${i}${text}\r\n`);
  });

  it("drives the LEDs from commands", () => {
    const t = start();
    t.run(30);
    t.sim.sendSerial("red\n");
    t.run(50);
    expect(t.serial()).toContain("OK red\r\n");
    const frame = t.frame()!;
    // GRB words: red only. Brightness scales the value.
    expect(Array.from(frame).every((w) => w >> 16 === 0 && (w & 0xff) === 0 && w >> 8 > 0)).toBe(
      true,
    );
  });

  it("paces bytes at the baud rate", () => {
    const t = start();
    t.run(20);
    t.sim.sendSerial("echo " + "y".repeat(100) + "\n");
    // 115200 baud, 10 bits per byte: about 87 µs per byte, so 106 bytes need about 9 ms.
    t.run(5);
    expect(t.sim.serialPending).toBeGreaterThan(30);
    t.run(10);
    expect(t.sim.serialPending).toBe(0);
  });
});

describe("validateSerialConfig", () => {
  it("accepts known line endings and rejects anything else", () => {
    expect(validateSerialConfig({ lineEnding: "crlf" })).toEqual({ lineEnding: "crlf" });
    expect(() => validateSerialConfig({ lineEnding: "\n" })).toThrow(RangeError);
    expect(() => validateSerialConfig(null)).toThrow(RangeError);
  });
});
