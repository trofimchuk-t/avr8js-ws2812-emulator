# Compile server with a pinned, reproducible toolchain.
# Keep the versions in sync with server/config.ts (the server refuses to start on a mismatch).
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

COPY --chown=builder package.json yarn.lock ./
RUN corepack enable && yarn install --frozen-lockfile --production
COPY --chown=builder server ./server

ENV HOST=0.0.0.0 PORT=3001
EXPOSE 3001
CMD ["node", "server/main.ts"]
