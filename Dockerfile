# Compile server with a pinned, reproducible toolchain.
# Keep the versions in sync with packages/server/config.ts (the server refuses to start on a mismatch).
FROM node:24-slim

ARG ARDUINO_CLI_VERSION=1.5.1
ARG AVR_CORE_VERSION=1.8.8
ARG FASTLED_VERSION=3.6.0

# curl also serves the compose healthcheck.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh \
    | BINDIR=/usr/local/bin sh -s ${ARDUINO_CLI_VERSION} \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

# Run as an unprivileged user; the toolchain lives in its home directory.
RUN useradd --create-home --shell /usr/sbin/nologin builder
USER builder
WORKDIR /home/builder/app

RUN arduino-cli core update-index \
    && arduino-cli core install arduino:avr@${AVR_CORE_VERSION} \
    && arduino-cli lib install FastLED@${FASTLED_VERSION} \
    && rm -rf ~/.arduino15/staging ~/.arduino15/library_index.json*

# Workspaces: every workspace's package.json must be present for a frozen-lockfile install.
COPY --chown=builder package.json yarn.lock ./
COPY --chown=builder packages/engine/package.json ./packages/engine/
COPY --chown=builder packages/server/package.json ./packages/server/
# The web app's dependencies (Monaco, icons, React: ~200 MB) are not needed by the server,
# so its manifest is a stub without dependencies. The cache would only duplicate node_modules.
RUN mkdir -p packages/web \
    && echo '{"name":"@avr8js-ws2812/web","version":"0.0.0","private":true}' > packages/web/package.json \
    && yarn install --frozen-lockfile --production \
    && yarn cache clean
COPY --chown=builder packages/engine ./packages/engine
COPY --chown=builder packages/server ./packages/server

# Projects (SQLite + sketch files) live here; mount a volume to keep them.
# Created here so the volume is owned by builder, not root.
RUN mkdir -p /home/builder/data
ENV HOST=0.0.0.0 PORT=3001 DATA_DIR=/home/builder/data
VOLUME /home/builder/data
EXPOSE 3001
WORKDIR /home/builder/app/packages/server
CMD ["node", "main.ts"]
