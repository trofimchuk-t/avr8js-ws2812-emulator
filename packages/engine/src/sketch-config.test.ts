import { describe, expect, it } from "vitest";
import { parseSketchConfig } from "./sketch-config.ts";
import { DEFAULT_LED_CONFIG } from "./led-config.ts";

const sketch = (body: string) => `#include "FastLED.h"\n${body}\nvoid setup(){}\nvoid loop(){}`;

describe("parseSketchConfig", () => {
  it("reads defines and a NEOPIXEL addLeds call", () => {
    const r = parseSketchConfig(
      sketch(`#define DATA_PIN 6
#define NUM_LEDS 120
CRGB leds[NUM_LEDS];
void f(){ FastLED.addLeds<NEOPIXEL, DATA_PIN>(leds, NUM_LEDS); }`),
    );
    expect(r.config).toMatchObject({ count: 120, dataPin: 6, colorOrder: "GRB" });
    expect(r.warnings).toEqual([]);
    expect(r.found).toEqual({ count: true, dataPin: true, colorOrder: true });
  });

  it("reads an explicit color order, through a define, and arithmetic counts", () => {
    const r = parseSketchConfig(
      sketch(`#define W 8
#define H 4
#define NUM_LEDS (W * H + 0x2)
#define ORDER BRG
FastLED.addLeds<WS2812B, 12, ORDER>(leds, NUM_LEDS);`),
    );
    expect(r.config).toMatchObject({ count: 34, dataPin: 12, colorOrder: "BRG" });
  });

  it("resolves const ints and literals, and uses the last argument of the offset form", () => {
    const r = parseSketchConfig(
      sketch(`const uint8_t kPin = 10;
static const int N = 16;
FastLED.addLeds<WS2812, kPin, RGB>(leds, 0, N);`),
    );
    expect(r.config).toMatchObject({ count: 16, dataPin: 10, colorOrder: "RGB" });
  });

  it("ignores commented-out calls and defines", () => {
    const r = parseSketchConfig(
      sketch(`// #define NUM_LEDS 999
/* FastLED.addLeds<NEOPIXEL, 9>(leds, 999); */
#define NUM_LEDS 7
FastLED.addLeds<NEOPIXEL, 4>(leds, NUM_LEDS);`),
    );
    expect(r.config).toMatchObject({ count: 7, dataPin: 4 });
  });

  it("uses chip default color orders", () => {
    expect(
      parseSketchConfig(sketch("FastLED.addLeds<WS2811, 3>(leds, 5);")).config.colorOrder,
    ).toBe("RGB");
  });

  it("supports CRGBArray with a single argument", () => {
    const r = parseSketchConfig(sketch("CRGBArray<24> leds;\nFastLED.addLeds<NEOPIXEL, 3>(leds);"));
    expect(r.config.count).toBe(24);
  });

  it("falls back to the defaults with a warning when nothing is found", () => {
    const r = parseSketchConfig("void setup() {}");
    expect(r.config).toEqual(DEFAULT_LED_CONFIG);
    expect(r.warnings).toHaveLength(1);
  });

  it("warns about values it cannot resolve or that are out of range", () => {
    const unknown = parseSketchConfig(sketch("FastLED.addLeds<NEOPIXEL, PIN>(leds, getCount());"));
    expect(unknown.warnings).toHaveLength(2);
    expect(unknown.found).toMatchObject({ count: false, dataPin: false });
    expect(unknown.config).toMatchObject({ count: 50, dataPin: 3 });

    const range = parseSketchConfig(sketch("FastLED.addLeds<NEOPIXEL, 1>(leds, 0);"));
    expect(range.warnings).toHaveLength(2);
    expect(range.config).toMatchObject({ count: 50, dataPin: 3 });
  });

  it("warns about unsupported chips and several strips", () => {
    expect(
      parseSketchConfig(sketch("FastLED.addLeds<APA102, 11, 13>(leds, 5);")).warnings[0],
    ).toMatch(/APA102/);
    const multi = parseSketchConfig(
      sketch("FastLED.addLeds<NEOPIXEL, 3>(a, 5);\nFastLED.addLeds<NEOPIXEL, 4>(b, 6);"),
    );
    expect(multi.config).toMatchObject({ count: 5, dataPin: 3 });
    expect(multi.warnings).toHaveLength(1);
  });

  it("survives cyclic defines", () => {
    const r = parseSketchConfig(
      sketch("#define A B\n#define B A\nFastLED.addLeds<NEOPIXEL, A>(leds, 5);"),
    );
    expect(r.found.dataPin).toBe(false);
  });
});
