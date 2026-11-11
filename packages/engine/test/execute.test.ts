import { describe, expect, it } from "vitest";
import { AVRRunner } from "../src/execute.ts";

const ADCSRA = 0x7a;
const ADSC = 0x40;

describe("AVRRunner", () => {
  it("finishes an ADC conversion, so analogRead() does not hang", () => {
    // An empty program is all NOPs.
    const runner = new AVRRunner(":00000001FF");
    // What analogRead() does: enable the ADC with prescaler 128 and start a conversion.
    runner.cpu.writeData(ADCSRA, 0xc7);
    runner.runUntil(10_000);
    expect(runner.cpu.data[ADCSRA] & ADSC).toBe(0);
  });
});
