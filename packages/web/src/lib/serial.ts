import { formatTime } from "@avr8js-ws2812/engine";

/** One line of the serial terminal: output of the sketch or a command the user sent. */
export interface SerialLine {
  /** Stable React key. */
  id: number;
  kind: "out" | "in";
  text: string;
  /** Simulated time at which the line started. */
  nanos: number;
}

export interface SerialLog {
  lines: SerialLine[];
  /** The last line is sketch output that has not ended with a newline yet. */
  open: boolean;
  nextId: number;
}

/** Output that starts at `nanos`; it continues the open line, if any. */
export interface SerialChunk {
  text: string;
  nanos: number;
}

export const MAX_LINES = 5000;
/** A sketch that never prints a newline still gets its output wrapped into lines. */
export const MAX_LINE_CHARS = 4000;

export const EMPTY_LOG: SerialLog = { lines: [], open: false, nextId: 0 };

function trim(lines: SerialLine[]) {
  return lines.length > MAX_LINES ? lines.slice(lines.length - MAX_LINES) : lines;
}

/** Appends sketch output. "\n" ends a line; a "\r" right before it is dropped. */
export function appendOutput(log: SerialLog, chunks: SerialChunk[]): SerialLog {
  if (chunks.length === 0) return log;
  const lines = log.lines.slice();
  let { open, nextId } = log;
  for (const { text, nanos } of chunks) {
    const parts = text.split("\n");
    parts.forEach((part, i) => {
      if (i > 0) {
        // The previous part ended with "\n".
        const last = lines[lines.length - 1];
        if (open && last) lines[lines.length - 1] = { ...last, text: last.text.replace(/\r$/, "") };
        else lines.push({ id: nextId++, kind: "out", text: "", nanos });
        open = false;
      }
      if (part === "" && i === parts.length - 1 && i > 0) return;
      for (let rest = part; ;) {
        const last = lines[lines.length - 1];
        if (!open || !last) {
          lines.push({ id: nextId++, kind: "out", text: "", nanos });
          open = true;
        }
        const line = lines[lines.length - 1];
        const room = MAX_LINE_CHARS - line.text.length;
        lines[lines.length - 1] = { ...line, text: line.text + rest.slice(0, room) };
        rest = rest.slice(room);
        if (!rest) break;
        open = false;
      }
    });
  }
  return { lines: trim(lines), open, nextId };
}

/** Records a command the user sent. Output that follows starts on a new line. */
export function appendInput(log: SerialLog, text: string, nanos: number): SerialLog {
  const lines = [...log.lines, { id: log.nextId, kind: "in" as const, text, nanos }];
  return { lines: trim(lines), open: false, nextId: log.nextId + 1 };
}

export const formatStamp = (nanos: number) => formatTime(nanos / 1e9);

/** Plain text for saving: commands start with "> ", timestamps are optional. */
export function logToText(log: SerialLog, timestamps: boolean) {
  return log.lines
    .map(
      (line) =>
        (timestamps ? `[${formatStamp(line.nanos)}] ` : "") +
        (line.kind === "in" ? "> " : "") +
        line.text.replace(/\r/g, ""),
    )
    .join("\n");
}

export const MAX_HISTORY = 50;

/** Newest last; repeating the previous command does not add it again. */
export function pushHistory(history: string[], command: string): string[] {
  if (!command || history[history.length - 1] === command) return history;
  return [...history, command].slice(-MAX_HISTORY);
}
