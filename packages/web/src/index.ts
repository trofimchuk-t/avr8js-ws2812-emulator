import "@wokwi/elements";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import { buildHex } from "./compile";
import {
  createSimulation,
  formatTime,
  parseSketchConfig,
  type LedConfig,
  type Simulation,
} from "@avr8js-ws2812/engine";
import { NeopixelMatrixElement } from "@wokwi/elements";
import "./index.css";
import { EditorHistoryUtil } from "./utils/editor-history.util";

const DEFAULT_CODE = `
#include "FastLED.h"

#define DATA_PIN 3                                     // Data pin to connect to the strip.
#define NUM_LEDS 50                                    // Number of LED's.

uint8_t max_bright = 255;                              // Overall brightness definition. It can be changed on the fly.
struct CRGB leds[NUM_LEDS];                            // Initialize our LED array.


void setup() {
  Serial.begin(115200);                                // Initialize serial port for debugging.
  FastLED.addLeds<NEOPIXEL, DATA_PIN>(leds, NUM_LEDS);
  FastLED.setBrightness(max_bright);
  Serial.println("FastLED initialized.");
}

void loop() {
  rainbow_beat();
  FastLED.show();
}

void rainbow_beat() { 
  uint8_t beatA = beatsin8(17, 0, 255);                // Starting hue
  uint8_t beatB = beatsin8(13, 0, 255);
  fill_rainbow(leds, NUM_LEDS, (beatA+beatB)/2, 8);    // Use FastLED's fill_rainbow routine.
}
`.trim();

// Load Editor. C++ only needs the generic editor worker (no language-service worker).
self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};
const editor = monaco.editor.create(document.querySelector<HTMLElement>(".code-editor"), {
  value: EditorHistoryUtil.getValue() || DEFAULT_CODE,
  language: "cpp",
  minimap: { enabled: false },
});

// Set up the NeoPixel matrix
const matrix = document.querySelector<NeopixelMatrixElement & HTMLElement>("wokwi-neopixel-matrix");

// Set up toolbar
let simulation: Simulation | null = null;

const runButton = document.querySelector("#run-button");
runButton.addEventListener("click", compileAndRun);
const stopButton = document.querySelector("#stop-button");
stopButton.addEventListener("click", stopCode);
const revertButton = document.querySelector("#revert-button");
revertButton.addEventListener("click", revertSnippet);
const statusLabel = document.querySelector("#status-label");
const compilerOutputText = document.querySelector("#compiler-output-text");
const serialOutputText = document.querySelector("#serial-output-text");

/** Sizes the matrix element from the config (the single source of truth for the LED count). */
function applyLayout(led: LedConfig) {
  const { layout } = led;
  matrix.cols = layout.kind === "matrix" ? layout.cols : led.count;
  matrix.rows = layout.kind === "matrix" ? layout.rows : 1;
}

function executeProgram(hex: string, led: LedConfig) {
  applyLayout(led);
  simulation = createSimulation({
    hex,
    led,
    onSerial: (char) => {
      serialOutputText.textContent += char;
    },
    onProgress: (nanos) => {
      statusLabel.textContent = "Simulation time: " + formatTime(nanos / 1e9);
    },
    onFrame: (pixels) => {
      for (let row = 0; row < matrix.rows; row++) {
        for (let col = 0; col < matrix.cols; col++) {
          const value = pixels[row * matrix.cols + col];
          matrix.setPixel(row, col, {
            b: (value & 0xff) / 255,
            r: ((value >> 8) & 0xff) / 255,
            g: ((value >> 16) & 0xff) / 255,
          });
        }
      }
    },
  });
  simulation.start();
}

async function compileAndRun() {
  storeUserSnippet();

  runButton.setAttribute("disabled", "1");
  revertButton.setAttribute("disabled", "1");
  serialOutputText.textContent = "";

  try {
    statusLabel.textContent = "Compiling...";
    const source = editor.getValue();
    // Pin, LED count and color order come from the sketch text.
    const { config, warnings } = parseSketchConfig(source);
    const result = await buildHex(source);
    compilerOutputText.textContent = result.stderr || result.stdout;
    for (const warning of warnings) compilerOutputText.textContent += `\nWarning: ${warning}`;
    if (result.hex) {
      compilerOutputText.textContent += `\nProgram running (${config.count} LEDs on D${config.dataPin}, ${config.colorOrder})...`;
      stopButton.removeAttribute("disabled");
      executeProgram(result.hex, config);
    } else {
      runButton.removeAttribute("disabled");
      revertButton.removeAttribute("disabled");
    }
  } catch (err) {
    runButton.removeAttribute("disabled");
    revertButton.removeAttribute("disabled");
    compilerOutputText.textContent = err instanceof Error ? err.message : String(err);
  } finally {
    statusLabel.textContent = "";
  }
}

function stopCode() {
  stopButton.setAttribute("disabled", "1");
  runButton.removeAttribute("disabled");
  revertButton.removeAttribute("disabled");

  if (simulation) {
    simulation.stop();
    simulation = null;
  }
}

function storeUserSnippet() {
  EditorHistoryUtil.clearSnippet();
  EditorHistoryUtil.storeSnippet(editor.getValue());
}

function revertSnippet() {
  editor.setValue(DEFAULT_CODE);
  EditorHistoryUtil.storeSnippet(editor.getValue());
}
