import { LINE_ENDINGS, type LineEnding } from "@avr8js-ws2812/engine";
import { CornerDownLeft } from "lucide-react";
import { memo, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { formatStamp, type SerialLine, type SerialLog } from "../lib/serial";
import { IconButton } from "./ui";

const LINE_ENDING_LABELS: Record<LineEnding, string> = {
  none: "No line ending",
  lf: "LF",
  cr: "CR",
  crlf: "CR + LF",
};

const Line = memo(function Line({ line, timestamps }: { line: SerialLine; timestamps: boolean }) {
  return (
    <div className={line.kind === "in" ? "serial-line serial-in" : "serial-line"}>
      {timestamps && <span className="serial-stamp">{formatStamp(line.nanos)} </span>}
      {line.kind === "in" && <span aria-hidden>&gt; </span>}
      {line.text.replace(/\r/g, "") || " "}
    </div>
  );
});

/**
 * Serial Monitor: the sketch's output with sent commands echoed in a muted color, and an input
 * line. Enter sends; ↑/↓ walk through the command history.
 */
export function SerialTerminal({
  log,
  canSend,
  onSend,
  lineEnding,
  onLineEndingChange,
  history,
  timestamps,
  autoscroll,
  inputRef,
}: {
  log: SerialLog;
  canSend: boolean;
  /** Returns false when nothing was sent (the simulation stopped meanwhile). */
  onSend: (command: string) => boolean;
  lineEnding: LineEnding;
  onLineEndingChange?: (ending: LineEnding) => void;
  /** Oldest first. */
  history: string[];
  timestamps: boolean;
  autoscroll: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const [value, setValue] = useState("");
  /** Position in `history` counted from the newest entry; -1 while editing a new command. */
  const [historyIndex, setHistoryIndex] = useState(-1);
  const pendingDraft = useRef("");

  // Follow new output while autoscroll is on and the view is at the bottom.
  const view = useRef<HTMLPreElement>(null);
  const atBottom = useRef(true);
  useLayoutEffect(() => {
    const el = view.current;
    if (el && autoscroll && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [log, autoscroll, timestamps]);
  const onScroll = () => {
    const el = view.current;
    if (el) atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };

  const recall = (index: number) => {
    if (historyIndex === -1) pendingDraft.current = value;
    setHistoryIndex(index);
    setValue(index === -1 ? pendingDraft.current : history[history.length - 1 - index]);
  };

  const send = () => {
    if (!canSend) return;
    // An empty line still sends the line ending, like the Arduino IDE.
    if (!value && lineEnding === "none") return;
    if (!onSend(value)) return;
    setValue("");
    setHistoryIndex(-1);
    atBottom.current = true;
  };

  return (
    <div className="terminal">
      <pre
        ref={view}
        onScroll={onScroll}
        className="console-text serial"
        role="log"
        aria-label="Serial output"
      >
        {log.lines.length === 0 ? (
          <span className="muted">
            Serial output from the sketch appears here. Type below to send to the sketch.
          </span>
        ) : (
          log.lines.map((line) => <Line key={line.id} line={line} timestamps={timestamps} />)
        )}
      </pre>
      <form
        className="terminal-input"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <span className="terminal-prompt" aria-hidden>
          &gt;
        </span>
        <input
          ref={inputRef}
          className="terminal-field"
          value={value}
          disabled={!canSend}
          placeholder={
            canSend ? "Send to the sketch (Enter, ↑/↓ for history)" : "Run the sketch to send data"
          }
          aria-label="Send to Serial"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setValue(e.target.value);
            setHistoryIndex(-1);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" && historyIndex < history.length - 1) {
              e.preventDefault();
              recall(historyIndex + 1);
            } else if (e.key === "ArrowDown" && historyIndex >= 0) {
              e.preventDefault();
              recall(historyIndex - 1);
            }
          }}
        />
        <select
          className="select terminal-ending"
          aria-label="Line ending"
          title="Appended to every line you send"
          value={lineEnding}
          disabled={!onLineEndingChange}
          onChange={(e) => onLineEndingChange?.(e.target.value as LineEnding)}
        >
          {LINE_ENDINGS.map((ending) => (
            <option key={ending} value={ending}>
              {LINE_ENDING_LABELS[ending]}
            </option>
          ))}
        </select>
        <IconButton label="Send" type="submit" disabled={!canSend}>
          <CornerDownLeft size={15} />
        </IconButton>
      </form>
    </div>
  );
}
