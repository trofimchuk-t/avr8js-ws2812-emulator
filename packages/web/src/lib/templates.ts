import { createLedConfig } from "@avr8js-ws2812/engine";
import type { ProjectDraft } from "./project-io";
import { ledFromSketch, sanitizeBaseName } from "./sketch-files";

const sources = import.meta.glob("../../../../demo_sketches/*.ino", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export interface Template {
  id: string;
  title: string;
  draft: ProjectDraft;
}

function titleOf(path: string) {
  return path.slice(path.lastIndexOf("/") + 1).replace(/\.ino$/, "");
}

export const TEMPLATES: Template[] = Object.entries(sources)
  .map(([path, content]) => {
    const title = titleOf(path);
    const name = sanitizeBaseName(title) + ".ino";
    const files = [{ name, content }];
    return {
      id: title,
      title,
      draft: { name: title, led: ledFromSketch(files, name), files, main: name },
    };
  })
  .sort((a, b) => (a.title < b.title ? -1 : 1));

export const DEFAULT_TEMPLATE = TEMPLATES.find((t) => t.id === "rainbow_beat") ?? TEMPLATES[0];

const BLANK_SOURCE = `#include <FastLED.h>

#define DATA_PIN 3
#define NUM_LEDS 30

CRGB leds[NUM_LEDS];

void setup() {
  FastLED.addLeds<NEOPIXEL, DATA_PIN>(leds, NUM_LEDS);
}

void loop() {
  fill_solid(leds, NUM_LEDS, CRGB::Black);
  FastLED.show();
}
`;

export const BLANK_DRAFT: ProjectDraft = {
  name: "Untitled",
  led: createLedConfig({ count: 30 }),
  files: [{ name: "sketch.ino", content: BLANK_SOURCE }],
  main: "sketch.ino",
};
