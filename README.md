# AVR8js NeoPixels + FastLED Demo

This project demonstrates the use of [avr8js](https://github.com/wokwi/avr8js) library to simulate NeoPixels (ws2812 LEDs) with the [FastLED](https://github.com/FastLED/FastLED) library. You can paste your own Arduino sketch into the editor, and see how it would run on a real AVR microcontroller.

You can find a lot of demo code in the [FastLED-Demos](https://github.com/atuline/FastLED-Demos/tree/master) repository.  
Ready-made sketches can be found in the [demo sketches](./demo_sketches) folder; they are also offered as templates when you create a project. Projects (several files each: `.ino`, `.h`, `.hpp`, `.c`, `.cpp`) are stored by the server in `DATA_DIR` (default `./data`: a SQLite database plus the sketch files) and can be imported and exported as `.ino` or `.zip`.

## Getting Started

To run this project, you need to have [Node.js](https://nodejs.org/) and [Yarn](https://yarnpkg.com/) installed on your system.

First, install the project dependencies by running:

```sh
yarn install
```

Sketches are compiled by a local server that wraps [arduino-cli](https://arduino.github.io/arduino-cli/). Install the pinned toolchain once (the server refuses to start if the versions differ, see `packages/server/config.ts`):

```sh
brew install arduino-cli   # or see the arduino-cli install docs
arduino-cli core update-index
arduino-cli core install arduino:avr@1.8.8
arduino-cli lib install FastLED@3.6.0
```

Then start the compile server and the web app in two terminals:

```sh
yarn server   # http://127.0.0.1:3001
yarn start
```

Alternatively, build the `Dockerfile`, which contains the same toolchain.

It will run a local development server, and you can access the project at [http://localhost:3000/](http://localhost:3000/) (the default port is 3000 unless otherwise configured).

![Screenshot of the AVR8js NeoPixels + FastLED Demo](screenshot.png)