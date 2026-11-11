import type { LineEnding } from "@avr8js-ws2812/engine";
import { ArrowDownToLine, ChevronDown, ChevronUp, Clock, Download, Eraser } from "lucide-react";
import { Tabs } from "radix-ui";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CompileOutput } from "../hooks/useSimulation";
import type { Diagnostic } from "../lib/diagnostics";
import { logToText, type SerialLog } from "../lib/serial";
import { sanitizeBaseName } from "../lib/sketch-files";
import { usePref } from "../lib/storage";
import { SerialTerminal } from "./SerialTerminal";
import { IconButton } from "./ui";

type ConsoleTab = "compiler" | "serial";

/** Compiler output with diagnostic lines as buttons that jump to the code. */
function CompilerText({
  text,
  diagnostics,
  onJump,
}: {
  text: string;
  diagnostics: Diagnostic[];
  onJump: (d: Diagnostic) => void;
}) {
  const byLine = new Map(diagnostics.map((d) => [d.outputLine, d]));
  return text.split("\n").map((line, i) => {
    const d = byLine.get(i);
    if (!d) return <div key={i}>{line || "\u00a0"}</div>;
    const where = `${d.file}:${d.line}${d.column ? `:${d.column}` : ""}`;
    return (
      <button
        key={i}
        className={`diag ${d.severity}`}
        title={`Go to ${where}`}
        onClick={() => onJump(d)}
      >
        <span className="diag-where">{where}</span> {d.severity}: {d.message}
      </button>
    );
  });
}

/** What the Serial tab needs besides the log. */
export interface TerminalProps {
  canSend: boolean;
  onSend: (command: string) => boolean;
  lineEnding: LineEnding;
  onLineEndingChange?: (ending: LineEnding) => void;
  history: string[];
  /** Used for the file name of a saved log. */
  projectName: string;
  /** Incremented to switch to the Serial tab and focus its input. */
  focusRequest: number;
}

function saveText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ConsoleDock({
  compileOutput,
  diagnostics,
  onJump,
  serial,
  terminal,
  onClearCompiler,
  onClearSerial,
  collapsed,
  onToggleCollapsed,
}: {
  compileOutput: CompileOutput | null;
  diagnostics: Diagnostic[];
  onJump: (d: Diagnostic) => void;
  serial: SerialLog;
  terminal: TerminalProps;
  onClearCompiler: () => void;
  onClearSerial: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const [tab, setTab] = useState<ConsoleTab>("compiler");
  const [serialUnread, setSerialUnread] = useState(false);
  const [timestamps, setTimestamps] = usePref("serial.timestamps", false);
  const [autoscroll, setAutoscroll] = usePref("serial.autoscroll", true);
  const inputRef = useRef<HTMLInputElement>(null);

  // Ctrl+`: show the terminal and put the cursor in its input once it is visible.
  useEffect(() => {
    if (terminal.focusRequest === 0) return;
    setTab("serial");
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [terminal.focusRequest]);

  // A failed build shows the compiler; a successful one switches to the sketch's output.
  useEffect(() => {
    if (compileOutput) setTab(compileOutput.failed ? "compiler" : "serial");
  }, [compileOutput]);

  useEffect(() => {
    if (serial.lines.length && (tab !== "serial" || collapsed)) setSerialUnread(true);
  }, [serial]);

  useEffect(() => {
    if (tab === "serial" && !collapsed) setSerialUnread(false);
  }, [tab, collapsed]);

  const compilerText = compileOutput?.text ?? "";
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const warnings = diagnostics.length - errors;
  // New compiler output starts at the top: the first error matters most.
  const compilerRef = useRef<HTMLPreElement>(null);
  useLayoutEffect(() => {
    if (compilerRef.current) compilerRef.current.scrollTop = 0;
  }, [compilerText]);

  return (
    <Tabs.Root
      className="console"
      value={tab}
      onValueChange={(value) => {
        setTab(value as ConsoleTab);
        if (collapsed) onToggleCollapsed();
      }}
    >
      <div className="console-bar">
        <Tabs.List className="console-tabs" aria-label="Output">
          <Tabs.Trigger value="compiler" className="console-tab">
            Compiler
            {errors > 0 && (
              <span className="badge danger" title={`${errors} errors`}>
                {errors}
              </span>
            )}
            {warnings > 0 && (
              <span className="badge warn" title={`${warnings} warnings`}>
                {warnings}
              </span>
            )}
            {errors === 0 && compileOutput?.failed && <span className="badge danger">!</span>}
          </Tabs.Trigger>
          <Tabs.Trigger value="serial" className="console-tab">
            Serial
            {serialUnread && <span className="unread-dot" aria-label="new output" />}
          </Tabs.Trigger>
        </Tabs.List>
        <div className="spacer" />
        {tab === "serial" && !collapsed && (
          <>
            <IconButton
              label="Timestamps (simulated time)"
              aria-pressed={timestamps}
              onClick={() => setTimestamps(!timestamps)}
            >
              <Clock size={15} />
            </IconButton>
            <IconButton
              label="Autoscroll"
              aria-pressed={autoscroll}
              onClick={() => setAutoscroll(!autoscroll)}
            >
              <ArrowDownToLine size={15} />
            </IconButton>
            <IconButton
              label="Save log as .txt"
              disabled={serial.lines.length === 0}
              onClick={() =>
                saveText(
                  `${sanitizeBaseName(terminal.projectName, "serial")}-serial.txt`,
                  logToText(serial, timestamps) + "\n",
                )
              }
            >
              <Download size={15} />
            </IconButton>
          </>
        )}
        <IconButton
          label={tab === "serial" ? "Clear serial output" : "Clear compiler output"}
          onClick={tab === "serial" ? onClearSerial : onClearCompiler}
        >
          <Eraser size={15} />
        </IconButton>
        <IconButton label={collapsed ? "Show console" : "Hide console"} onClick={onToggleCollapsed}>
          {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </IconButton>
      </div>
      <Tabs.Content
        value="compiler"
        className="console-body"
        forceMount
        hidden={tab !== "compiler"}
      >
        <pre
          ref={compilerRef}
          className={
            compileOutput?.failed && diagnostics.length === 0
              ? "console-text failed"
              : "console-text"
          }
        >
          {compileOutput === null ? (
            <span className="muted">Press Run to compile the sketch.</span>
          ) : compilerText ? (
            <CompilerText text={compilerText} diagnostics={diagnostics} onJump={onJump} />
          ) : (
            <span className="muted">Compiled without messages.</span>
          )}
        </pre>
      </Tabs.Content>
      <Tabs.Content value="serial" className="console-body" forceMount hidden={tab !== "serial"}>
        <SerialTerminal
          log={serial}
          canSend={terminal.canSend}
          onSend={terminal.onSend}
          lineEnding={terminal.lineEnding}
          onLineEndingChange={terminal.onLineEndingChange}
          history={terminal.history}
          timestamps={timestamps}
          autoscroll={autoscroll}
          inputRef={inputRef}
        />
      </Tabs.Content>
    </Tabs.Root>
  );
}
