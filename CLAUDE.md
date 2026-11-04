# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A browser-only demo that runs Arduino sketches using FastLED on a simulated ATmega328p (via [avr8js](https://github.com/wokwi/avr8js)) and renders the WS2812/NeoPixel output on a `wokwi-neopixel-matrix` element. Users paste a sketch into the Monaco editor and press Run.

## Commands

`package.json` pins Node 24 LTS and Yarn through Volta. ESLint 10 does not support Node 23.

- `yarn install`: install dependencies (Yarn 1 workspaces)
- `yarn start`: Vite dev server (`packages/web`) at http://localhost:3000
- `yarn typecheck`: `tsc` (no emit) in every package
- `yarn lint` / `yarn lint:fix`: ESLint (flat config in `eslint.config.js`, typescript-eslint recommended)
- `yarn format` / `yarn format:check`: Prettier (`*.md` is ignored)
- `yarn server`: compile server on http://127.0.0.1:3001 (needs `arduino-cli`, see README)
- `yarn test`: Vitest, run once from the root for all packages
- `yarn golden:update`: rebuilds the engine golden fixtures from `demo_sketches` (needs `arduino-cli`)
- `yarn run check`: typecheck + lint + format check + tests (plain `yarn check` is Yarn's own built-in command, so use `yarn run`)

`yarn test` runs Vitest (engine tests in `packages/engine`, server tests in `packages/server`; the real-`arduino-cli` test is skipped when the CLI is missing). Vite transpiles the TypeScript on the fly and does not type-check, so run `yarn run check`. Each package has `volta.extends` so Volta picks Node 24 inside `packages/*` too. TypeScript is pinned to 6.0.x because typescript-eslint supports only TypeScript < 6.1.

## Architecture

Monorepo (Yarn workspaces): `packages/engine` (no DOM), `packages/web` (frontend), `packages/server` (compile server).

Pipeline: **sketch source → remote compile → Intel HEX → AVR emulation → pin-edge decoding → pixel rendering**

- `packages/web/src/compile.ts`: POSTs the sketch to `${VITE_API_URL ?? "/api"}/compile`. In dev, Vite proxies `/api` to the compile server (`packages/web/vite.config.ts`, `API_PROXY_TARGET` overrides the target). It throws `CompileError` for network and HTTP errors; the UI shows them in the compiler-output panel.
- `packages/server/` (Fastify, run with `yarn server`, Node runs the `.ts` directly so use erasable syntax and `.ts` import extensions): `POST /api/compile` takes `{ sketch }` and returns `{ stdout, stderr, hex }`. `compiler.ts` runs `arduino-cli compile` through `execFile` in a temp directory, caches by sha256(toolchain + sketch), shares identical in-flight builds, and queues builds (`semaphore.ts`). Compiler errors are a 200 response with an empty `hex`. The toolchain is pinned in `config.ts` (FastLED 3.6.0, `arduino:avr` 1.8.8) and checked at startup, because FastLED versions change the pulse timings that `MARGIN` is tuned for; FastLED 3.10.x does not compile the demo sketches. The `Dockerfile` builds the same toolchain.
- `packages/engine/` (`@avr8js-ws2812/engine`, imported by the web app as a workspace package; no `window`/`document`, its tsconfig has no DOM lib; erasable TS syntax only so Node can run it):
  - `src/simulation.ts`: the public API, `createSimulation({ hex, led, onFrame, onSerial, onProgress })` returning `Simulation` (`start/pause/stop/step/setSpeed`). It owns the run loop: every 500,000 cycles it checks for a frame, calls `onProgress` and yields with `setTimeout`. That yield is the only point where `pause()`/`stop()` take effect. `stop()` is final. `step(cycles)` runs synchronously (for tests and single-stepping). Speed is unthrottled by default (`Infinity`); `setSpeed(1)` paces to real time. It listens to the port of `led.dataPin` (`pins.ts`: D2–D7 are PORTD, D8–D13 are PORTB), converts cycles to simulated nanoseconds and converts the wire color order to GRB words.
  - `src/execute.ts` (`AVRRunner`): wires up the CPU, timer0, ports B/C/D, and USART0 at 16 MHz. No loop of its own.
  - `src/ws2812.ts` (`WS2812Controller`): decodes the WS2812 bitstream from pin transitions timestamped in simulated nanoseconds. It classifies HIGH/LOW pulse widths against the `ZERO_*`/`ONE_*` constants with a `MARGIN` tolerance tuned for FastLED's timing, assembles 24-bit pixels, and resets on a LOW of 50 µs or more. The last bit of a frame is inferred (`checkLastBit` / `update`) because the trailing LOW may never be followed by another edge.
  - `src/led-config.ts`, `src/pins.ts`, `src/sketch-config.ts`: `LedConfig`, the Arduino pin → port/bit table, and `parseSketchConfig(source)`, which reads `FastLED.addLeds<CHIP, PIN[, ORDER]>(leds, N)` (resolving `#define`/`const` and integer arithmetic) and falls back to `DEFAULT_LED_CONFIG` with a warning for anything it cannot resolve.
  - `src/intelhex.ts`: minimal Intel HEX loader.
  - `test/fixtures/`: golden HEX files built from `demo_sketches` plus `golden.json` (the `LedConfig` plus hashes of the latest frame at 100/500/1000/2000 ms of simulated time and the serial output). `golden.test.ts` replays them headless in Node. After an intentional change to the toolchain or decoder run `yarn golden:update` and review the diff.
- `packages/web/src/index.ts`: UI glue. It creates the Monaco editor from the `monaco-editor` npm package. `self.MonacoEnvironment.getWorker` supplies the generic editor worker through Vite's `?worker` import, which is the only worker C++ needs. It connects the toolbar buttons and creates a `Simulation`; `onFrame` copies pixels to the matrix and `onSerial` appends to the serial panel.

LED pin, count and color order are not hardcoded: on every Run `packages/web/src/index.ts` calls `parseSketchConfig` on the editor text, shows its warnings in the compiler-output panel, sizes the `<wokwi-neopixel-matrix>` from the resulting `LedConfig` and passes it to `createSimulation`. `onFrame` pixels are always GRB words (G in bits 16–23, R in bits 8–15, B in bits 0–7) whatever the sketch's color order. The golden fixtures store the `LedConfig` they ran with (`yarn golden:update` derives it from the sketch).

The editor contents are saved to `localStorage` under the key `AVRJS8_EDITOR_HISTORY` (`packages/web/src/utils/editor-history.util.ts`) only when Run or Revert is pressed. Edits that are never run are lost on reload. Revert restores `DEFAULT_CODE` in `packages/web/src/index.ts` and saves it.

`demo_sketches/*.ino` holds sample sketches that users copy into the editor by hand. The app does not load them.
