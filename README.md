# AVR8js NeoPixels + FastLED Demo

This project demonstrates the use of [avr8js](https://github.com/wokwi/avr8js) library to simulate NeoPixels (ws2812 LEDs) with the [FastLED](https://github.com/FastLED/FastLED) library. You can paste your own Arduino sketch into the editor, and see how it would run on a real AVR microcontroller.

![Screenshot of the AVR8js NeoPixels + FastLED Demo](screenshot.png)

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

The server is configured through environment variables (see `packages/server/config.ts`):

| Variable | Default | Meaning |
| --- | --- | --- |
| `MAX_SKETCH_FILES` | `64` | Files in one project |
| `MAX_SKETCH_BYTES` | `1048576` (1 MiB) | Total size of a project's files, in UTF-8 bytes |
| `BUILD_TIMEOUT_MS` | `60000` | Time limit of one build |
| `MAX_CONCURRENT_BUILDS` | `2` | Builds that run at once |
| `MAX_QUEUED_BUILDS` | `8` | Builds waiting in the queue, more get HTTP 503 |
| `CACHE_ENTRIES` | `200` | Cached build results |
| `DATA_DIR` | `./data` | Projects database and sketch files |
| `ARDUINO_CLI` | `arduino-cli` | Path to the CLI |

The request body limit follows from `MAX_SKETCH_BYTES` and `MAX_SKETCH_FILES`. Behind nginx, `client_max_body_size` in `deploy/nginx.conf` (16 MB) must stay above it.

It will run a local development server, and you can access the project at [http://localhost:3000/](http://localhost:3000/) (the default port is 3000 unless otherwise configured).

### App version

The Help menu shows the app version and the build date. The version is `git describe --tags --always --dirty`, taken when the web app is built (`packages/web/vite.config.ts`):

| State of the checkout | Version shown |
| --- | --- |
| Exactly on tag `v1.2.0` | `v1.2.0` |
| 3 commits after `v1.2.0` | `v1.2.0-3-g96d2177` (`g` + short commit hash) |
| Uncommitted changes | the above plus `-dirty` |
| No tags yet | short commit hash, e.g. `96d2177` |
| No git (and no `APP_VERSION`) | `dev` |

To release a version, tag the commit and push the tag:

```sh
git tag -a v1.2.0 -m "v1.2.0"   # annotated tag on the current commit
git push origin v1.2.0          # or: git push --tags
git tag                         # list tags
git describe --tags             # what the app will show
```

Docker builds cannot run git, because `.git` is not in the build context. Pass the version in as `APP_VERSION` (the commands below do), otherwise the app shows `dev`.

### Docker deployment

`compose.yaml` runs the whole app: `server` (the `Dockerfile`, compile server with the pinned toolchain) and `web` (`Dockerfile.web`, the built frontend served by nginx, which proxies `/api` to `server`). Projects are kept in the `projects` volume.

```sh
APP_VERSION=$(git describe --tags --always --dirty) docker compose up -d --build   # http://<host>:8080
WEB_PORT=80 docker compose up -d      # another port
MAX_SKETCH_FILES=128 MAX_SKETCH_BYTES=2097152 docker compose up -d   # other project limits
```

Update with `git pull && APP_VERSION=$(git describe --tags --always --dirty) docker compose up -d --build`. Back up the projects with `docker compose run --rm --user root -v "$PWD":/backup server tar czf /backup/projects.tgz -C /home/builder/data .`.

### Building on a Mac for Docker on Windows (x64)

A Mac with Apple Silicon builds `arm64` images by default, which do not run on an x64 Windows machine. Build `linux/amd64` images instead (Docker Desktop emulates x64, so the build is slower), save them to a file and load that file on Windows. The target machine needs neither the source code nor Node.

On the Mac, in the repository:

```sh
export APP_VERSION=$(git describe --tags --always --dirty)
DOCKER_DEFAULT_PLATFORM=linux/amd64 docker compose build
docker image inspect --format '{{.Architecture}}' ledsim-server:latest ledsim-web:latest   # both: amd64
docker save -o ledsim-images.tar ledsim-server:latest ledsim-web:latest
```

Copy `ledsim-images.tar` and `deploy/compose.yaml` (it uses the prebuilt images and builds nothing) into one folder on the Windows machine. There, in PowerShell with Docker Desktop running (Linux containers):

```powershell
docker load -i ledsim-images.tar
docker compose up -d                       # http://localhost:8080
$env:WEB_PORT=80; docker compose up -d     # another port
```

To update, build and save new images on the Mac, then on Windows run `docker load -i ledsim-images.tar` and `docker compose up -d` again. Projects stay in the `projects` volume.