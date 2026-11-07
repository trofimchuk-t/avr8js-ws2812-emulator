# Compile server with a pinned, reproducible toolchain.
# Keep the versions in sync with packages/server/config.ts (the server refuses to start on a mismatch).
FROM node:24-slim

ARG ARDUINO_CLI_VERSION=1.5.1
ARG AVR_CORE_VERSION=1.8.8
ARG FASTLED_VERSION=3.6.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh \
    | BINDIR=/usr/local/bin sh -s ${ARDUINO_CLI_VERSION}

# Run as an unprivileged user; the toolchain lives in its home directory.
RUN useradd --create-home --shell /usr/sbin/nologin builder
USER builder
WORKDIR /home/builder/app

RUN arduino-cli core update-index \
    && arduino-cli core install arduino:avr@${AVR_CORE_VERSION} \
    && arduino-cli lib install FastLED@${FASTLED_VERSION}

# Workspaces: all package.json files must be present for a frozen-lockfile install.
COPY --chown=builder package.json yarn.lock ./
COPY --chown=builder packages/engine/package.json ./packages/engine/
COPY --chown=builder packages/web/package.json ./packages/web/
COPY --chown=builder packages/server/package.json ./packages/server/
RUN corepack enable && yarn install --frozen-lockfile --production
COPY --chown=builder packages/engine ./packages/engine
COPY --chown=builder packages/server ./packages/server

# Projects (SQLite + sketch files) live here; mount a volume to keep them.
ENV HOST=0.0.0.0 PORT=3001 DATA_DIR=/home/builder/data
VOLUME /home/builder/data
EXPOSE 3001
WORKDIR /home/builder/app/packages/server
CMD ["node", "main.ts"]
