# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Runs Arduino sketches (one or several files) using FastLED on a simulated ATmega328p (via [avr8js](https://github.com/wokwi/avr8js)) and renders the WS2812/NeoPixel output on a `wokwi-neopixel-matrix` element. Users keep projects on the server, edit their files in Monaco and press Run.

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

- `packages/web/src/compile.ts` and `src/lib/api.ts`: `request()` talks to `${VITE_API_URL ?? "/api"}` (in dev Vite proxies `/api` to the server, `API_PROXY_TARGET` overrides the target) and turns network and HTTP failures into `ApiError`; `buildHex(files, main)` POSTs `/compile` and throws `CompileError`. `api.ts` also has the project calls.
- `packages/server/` (Fastify, run with `yarn server`, Node runs the `.ts` directly so use erasable syntax and `.ts` import extensions): `POST /api/compile` takes `{ files: [{ name, content }], main? }` (or the single-file `{ sketch }`) and returns `{ stdout, stderr, hex }`. `compiler.ts` runs `arduino-cli compile` through `execFile` in a temp directory, caches by sha256(toolchain + main + every file), shares identical in-flight builds, and queues builds (`semaphore.ts`). Compiler errors are a 200 response with an empty `hex`. The toolchain is pinned in `config.ts` (FastLED 3.6.0, `arduino:avr` 1.8.8) and checked at startup, because FastLED versions change the pulse timings that `MARGIN` is tuned for; FastLED 3.10.x does not compile the demo sketches. The `Dockerfile` builds the same toolchain.
  - Multi-file sketches: files are flat (`^[A-Za-z0-9_-]+\.(ino|h|hpp|c|cpp)$`), validated by `validateSketchFiles` in the engine (count and total-size limits, `MAX_SKETCH_FILES`/`MAX_SKETCH_BYTES`). The main `.ino` is written under the build folder's name, `clean()` maps paths back to the user's file names.
  - Projects (`projects/`): `ProjectService` keeps a `ProjectRepository` (`SqliteProjectRepository`, `node:sqlite`, SQL migrations in `projects/migrations/` tracked by `PRAGMA user_version`) and a `SketchStorage` (`FileSketchStorage`, one directory per project, atomic replace) in step: create writes files first, delete removes the record first, a missing directory is logged and reads as no files. Routes: `GET/POST /api/projects`, `GET/PUT/DELETE /api/projects/:id` (the list has no files; the body carries `files` and `main`). `ownerId` is the constant `config.ownerId` until authentication exists. `DATA_DIR` (default `./data` relative to the working directory, git-ignored) holds `projects.db` and `sketches/`.
- `packages/engine/` (`@avr8js-ws2812/engine`, imported by the web app as a workspace package; no `window`/`document`, its tsconfig has no DOM lib; erasable TS syntax only so Node can run it):
  - `src/simulation.ts`: the public API, `createSimulation({ hex, led, onFrame, onSerial, onProgress })` returning `Simulation` (`start/pause/stop/step/setSpeed`). It owns the run loop: every 500,000 cycles it checks for a frame, calls `onProgress` and yields with `setTimeout`. That yield is the only point where `pause()`/`stop()` take effect. `stop()` is final. `step(cycles)` runs synchronously (for tests and single-stepping). Speed is unthrottled by default (`Infinity`); `setSpeed(1)` paces to real time. It listens to the port of `led.dataPin` (`pins.ts`: D2–D7 are PORTD, D8–D13 are PORTB), converts cycles to simulated nanoseconds and converts the wire color order to GRB words.
  - `src/execute.ts` (`AVRRunner`): wires up the CPU, timer0, ports B/C/D, and USART0 at 16 MHz. No loop of its own.
  - `src/ws2812.ts` (`WS2812Controller`): decodes the WS2812 bitstream from pin transitions timestamped in simulated nanoseconds. It classifies HIGH/LOW pulse widths against the `ZERO_*`/`ONE_*` constants with a `MARGIN` tolerance tuned for FastLED's timing, assembles 24-bit pixels, and resets on a LOW of 50 µs or more. The last bit of a frame is inferred (`checkLastBit` / `update`) because the trailing LOW may never be followed by another edge.
  - `src/sketch-files.ts`: the sketch file model and `validateSketchFiles` (shared by server and web). `src/led-config.ts` also has `validateLedConfig` for untrusted input.
  - `src/led-config.ts`, `src/pins.ts`, `src/sketch-config.ts`: `LedConfig`, the Arduino pin → port/bit table, and `parseSketchConfig(source)`, which reads `FastLED.addLeds<CHIP, PIN[, ORDER]>(leds, N)` (resolving `#define`/`const` and integer arithmetic) and falls back to `DEFAULT_LED_CONFIG` with a warning for anything it cannot resolve.
  - `src/intelhex.ts`: minimal Intel HEX loader.
  - `test/fixtures/`: golden HEX files built from `demo_sketches` plus `golden.json` (the `LedConfig` plus hashes of the latest frame at 100/500/1000/2000 ms of simulated time and the serial output). `golden.test.ts` replays them headless in Node. After an intentional change to the toolchain or decoder run `yarn golden:update` and review the diff.
- `packages/web` is a React app (`src/main.tsx` → `components/App.tsx`). `App` lists projects (selection in `location.hash`), creates them from templates (`lib/templates.ts` globs `demo_sketches/*.ino` with `?raw`), imports/exports them (`lib/project-io.ts`: a single-file project is a plain `.ino`, otherwise a zip with the files plus `project.json`), duplicates and deletes them. `ProjectEditor` (keyed by project id) holds the draft (name, `LedConfig`, files, main), autosaves it 800 ms after the last edit through `PUT /api/projects/:id` (saves are serialised), runs the simulation, and shows a hint when the sketch's `parseSketchConfig` result differs from the project's LED settings. `CodeEditor` wraps Monaco (one model per file; `self.MonacoEnvironment.getWorker` supplies the generic editor worker via Vite's `?worker`, the only worker C++ needs). `Matrix` wraps `<wokwi-neopixel-matrix>` and exposes `setPixels`/`clear` through a ref. On the first start (no projects) it creates one from the `rainbow_beat` template.

LED pin, count, color order and layout are stored per project as a `LedConfig` (validated by `validateLedConfig`), edited in `LedSettings`, and passed to `createSimulation` on Run; new projects, imports and templates derive the initial value from the sketch with `parseSketchConfig`. `onFrame` pixels are always GRB words (G in bits 16–23, R in bits 8–15, B in bits 0–7) whatever the color order. The golden fixtures store the `LedConfig` they ran with (`yarn golden:update` derives it from the sketch).


`demo_sketches/*.ino` holds sample sketches that users copy into the editor by hand. The app does not load them.
