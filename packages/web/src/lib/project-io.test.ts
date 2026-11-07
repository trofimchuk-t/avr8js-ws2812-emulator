import { strToU8, zipSync } from "fflate";
import { createLedConfig } from "@avr8js-ws2812/engine";
import { describe, expect, it } from "vitest";
import { exportProject, importProject } from "./project-io";
import { checkNewFileName, joinSources, sanitizeBaseName } from "./sketch-files";

const sketch = (pin: number, n: number) =>
  `#define N ${n}\nCRGB leds[N];\nvoid setup(){ FastLED.addLeds<NEOPIXEL, ${pin}>(leds, N); }\nvoid loop(){}`;

describe("export / import", () => {
  it("exports a single-file project as a plain .ino", () => {
    const out = exportProject({
      name: "My strip!",
      led: createLedConfig(),
      files: [{ name: "a.ino", content: "x" }],
      main: "a.ino",
    });
    expect(out.filename).toBe("My_strip.ino");
    expect(new TextDecoder().decode(out.data)).toBe("x");
  });

  it("round-trips a multi-file project through a zip, keeping the LED config", () => {
    const project = {
      name: "Multi",
      led: createLedConfig({ count: 7, dataPin: 9, colorOrder: "RGB" }),
      files: [
        { name: "main.ino", content: sketch(3, 50) },
        { name: "config.h", content: "#define X 1" },
      ],
      main: "main.ino",
    };
    const out = exportProject(project);
    expect(out.filename).toBe("Multi.zip");
    const back = importProject(out.filename, out.data);
    expect(back).toMatchObject({ name: "Multi", led: project.led, main: "main.ino", warnings: [] });
    expect(back.files).toEqual([project.files[1], project.files[0]]);
  });

  it("imports a .ino and reads the LED config from it", () => {
    const back = importProject("Cool sketch.ino", strToU8(sketch(6, 12)));
    expect(back.name).toBe("Cool sketch");
    expect(back.files[0].name).toBe("Cool_sketch.ino");
    expect(back.led).toMatchObject({ dataPin: 6, count: 12 });
  });

  it("strips one wrapping folder and skips unsupported entries", () => {
    const zip = zipSync({
      "proj/proj.ino": strToU8(sketch(3, 5)),
      "proj/notes.txt": strToU8("hi"),
      "proj/sub/x.h": strToU8(""),
      "__MACOSX/._proj.ino": strToU8(""),
    });
    const back = importProject("proj.zip", zip);
    expect(back.files.map((f) => f.name)).toEqual(["proj.ino"]);
    expect(back.warnings).toHaveLength(2);
  });

  it("picks the .ino with setup() as main when there is no manifest", () => {
    const zip = zipSync({
      "a.ino": strToU8("int x;"),
      "b.ino": strToU8(sketch(3, 5)),
    });
    expect(importProject("p.zip", zip).main).toBe("b.ino");
  });

  it("ignores an invalid manifest LED config and rejects bad files", () => {
    const zip = zipSync({
      "a.ino": strToU8(sketch(4, 9)),
      "project.json": strToU8(JSON.stringify({ led: { count: -1 } })),
    });
    const back = importProject("p.zip", zip);
    expect(back.led).toMatchObject({ dataPin: 4, count: 9 });
    expect(back.warnings).toHaveLength(1);
    expect(() => importProject("p.zip", strToU8("not a zip"))).toThrow();
    expect(() => importProject("p.zip", zipSync({ "a.h": strToU8("") }))).toThrow(/no .ino/);
    expect(() => importProject("p.txt", new Uint8Array())).toThrow();
  });
});

describe("sketch file helpers", () => {
  it("puts the main file first", () => {
    const files = [
      { name: "b.h", content: "B" },
      { name: "a.h", content: "A" },
      { name: "m.ino", content: "M" },
    ];
    expect(joinSources(files, "m.ino")).toBe("M\nA\nB");
  });

  it("sanitizes names and checks new ones", () => {
    expect(sanitizeBaseName("Мій скетч.ino")).toBe("sketch");
    expect(sanitizeBaseName("a b.c")).toBe("a_b");
    const files = [{ name: "a.ino", content: "" }];
    expect(checkNewFileName("b.h", files)).toBeNull();
    expect(checkNewFileName("A.ino", files)).toMatch(/exists/);
    expect(checkNewFileName("a.ino", files, "a.ino")).toBeNull();
    expect(checkNewFileName("../a.h", files)).toMatch(/Use letters/);
  });
});
