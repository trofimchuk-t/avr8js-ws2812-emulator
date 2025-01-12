import "@wokwi/elements";
import { buildHex } from "./compile";
import { AVRRunner } from "./execute";
import { formatTime } from "./format-time";
import { NeopixelMatrixElement } from "@wokwi/elements";
import { WS2812Controller } from "./ws2812";
import "./index.css";
import { EditorHistoryUtil } from "./utils/editor-history.util";

let editor: any;
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

// Load Editor
declare const window: any;
declare const monaco: any;
window.require.config({
  paths: {
    vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.33.0/min/vs",
  },
});
window.require(["vs/editor/editor.main"], () => {
  editor = monaco.editor.create(document.querySelector(".code-editor"), {
    value: EditorHistoryUtil.getValue() || DEFAULT_CODE,
    language: "cpp",
    minimap: { enabled: false },
  });
});

// Set up the NeoPixel matrix
const matrix = document.querySelector<NeopixelMatrixElement & HTMLElement>(
  "wokwi-neopixel-matrix"
);

// Set up toolbar
let runner: AVRRunner;

/* eslint-disable @typescript-eslint/no-use-before-define */
const runButton = document.querySelector("#run-button");
runButton.addEventListener("click", compileAndRun);
const stopButton = document.querySelector("#stop-button");
stopButton.addEventListener("click", stopCode);
const revertButton = document.querySelector("#revert-button");
revertButton.addEventListener("click", revertSnippet);
const statusLabel = document.querySelector("#status-label");
const compilerOutputText = document.querySelector("#compiler-output-text");
const serialOutputText = document.querySelector("#serial-output-text");

function executeProgram(hex: string) {
  runner = new AVRRunner(hex);
  const MHZ = 16000000;

  const cpuNanos = () => Math.round((runner.cpu.cycles / MHZ) * 1000000000);
  const matrixController = new WS2812Controller(matrix.cols * matrix.rows);

  // Hook to PORTD register
  runner.portD.addListener(() => {
    matrixController.feedValue(runner.portD.pinState(3), cpuNanos());
  });

  // Serial port output support
  runner.usart.onByteTransmit = (value: number) => {
    serialOutputText.textContent += String.fromCharCode(value);
  };

  runner.execute((cpu) => {
    const time = formatTime(cpu.cycles / MHZ);
    statusLabel.textContent = "Simulation time: " + time;
    const pixels = matrixController.update(cpuNanos());
    if (pixels) {
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
    }
  });
}

async function compileAndRun() {
  storeUserSnippet();

  runButton.setAttribute("disabled", "1");
  revertButton.setAttribute("disabled", "1");
  serialOutputText.textContent = "";

  try {
    statusLabel.textContent = "Compiling...";
    const result = await buildHex(editor.getModel().getValue());
    compilerOutputText.textContent = result.stderr || result.stdout;
    if (result.hex) {
      compilerOutputText.textContent += "\nProgram running...";
      stopButton.removeAttribute("disabled");
      executeProgram(result.hex);
    } else {
      runButton.removeAttribute("disabled");
    }
  } catch (err) {
    runButton.removeAttribute("disabled");
    revertButton.removeAttribute("disabled");
    alert("Failed: " + err);
  } finally {
    statusLabel.textContent = "";
  }
}

function stopCode() {
  stopButton.setAttribute("disabled", "1");
  runButton.removeAttribute("disabled");
  revertButton.removeAttribute("disabled");

  if (runner) {
    runner.stop();
    runner = null;
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
