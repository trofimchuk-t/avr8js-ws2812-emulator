# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A browser-only demo that runs Arduino sketches using FastLED on a simulated ATmega328p (via [avr8js](https://github.com/wokwi/avr8js)) and renders the WS2812/NeoPixel output on a `wokwi-neopixel-matrix` element. Users paste a sketch into the Monaco editor and press Run.

## Commands

- `yarn install`: install dependencies
- `yarn start`: Vite dev server at http://localhost:3000

The repo has no build script, tests, linter, or TypeScript compiler dependency. Vite transpiles `src/*.ts` on the fly and does not type-check.

## Architecture

Pipeline: **sketch source → remote compile → Intel HEX → AVR emulation → pin-edge decoding → pixel rendering**

- `src/compile.ts`: POSTs the sketch to Wokwi's hosted compiler (`https://hexi.wokwi.com/build`). Compilation needs network access, and the compiler supplies FastLED. Nothing is compiled locally.
- `src/intelhex.ts`: minimal Intel HEX loader that writes into the program flash buffer.
- `src/execute.ts` (`AVRRunner`): wires up the CPU, timer0, ports B/C/D, and USART0 at 16 MHz. `execute()` is a tight instruction loop that every 500,000 cycles calls the UI callback and yields to the event loop with `setTimeout(0)`. That yield is the only point where `stop()` takes effect.
- `src/ws2812.ts` (`WS2812Controller`): decodes the WS2812 bitstream from pin transitions timestamped in simulated nanoseconds (`cpu.cycles / 16 MHz`). It classifies HIGH/LOW pulse widths against the `ZERO_*`/`ONE_*` constants with a `MARGIN` tolerance tuned for FastLED's timing, assembles 24-bit pixels, and resets on a LOW of 50 µs or more. The last bit of a frame is inferred (`checkLastBit` / `update`) because the trailing LOW may never be followed by another edge.
- `src/index.ts`: UI glue. It loads Monaco from the cdnjs AMD loader (the global `window.require` set up by the script tag in `index.html`), connects the toolbar buttons, and feeds PORTD pin 3 changes into the controller. On each callback it copies pixels to the matrix. Serial output comes from `usart.onByteTransmit`.

Hardcoded assumptions that must change together:
- The LED data pin is **PORTD pin 3** (Arduino D3), so sketches must use `DATA_PIN 3`.
- The LED count comes from the `<wokwi-neopixel-matrix cols="50" rows="1">` attributes in `index.html`.
- Decoded pixel words are **GRB**: G in bits 16–23, R in bits 8–15, B in bits 0–7. `index.ts` unpacks them in that order.

The editor contents persist in `localStorage` under the key `AVRJS8_EDITOR_HISTORY` (`src/utils/editor-history.util.ts`). Revert restores `DEFAULT_CODE` in `index.ts`.

`demo_sketches/*.ino` holds sample sketches that users copy into the editor by hand. The app does not load them.
