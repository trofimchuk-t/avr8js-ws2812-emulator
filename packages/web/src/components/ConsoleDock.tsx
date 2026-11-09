import { ChevronDown, ChevronUp, Eraser } from "lucide-react";
import { Tabs } from "radix-ui";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CompileOutput } from "../hooks/useSimulation";
import type { Diagnostic } from "../lib/diagnostics";
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

/** Keeps a scrolled-to-bottom <pre> pinned to the bottom as text arrives. */
function useStickToBottom(text: string) {
  const ref = useRef<HTMLPreElement>(null);
  const stick = useRef(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [text]);
  const onScroll = () => {
    const el = ref.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };
  return { ref, onScroll };
}

export function ConsoleDock({
  compileOutput,
  diagnostics,
  onJump,
  serial,
  onClearCompiler,
  onClearSerial,
  collapsed,
  onToggleCollapsed,
}: {
  compileOutput: CompileOutput | null;
  diagnostics: Diagnostic[];
  onJump: (d: Diagnostic) => void;
  serial: string;
  onClearCompiler: () => void;
  onClearSerial: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const [tab, setTab] = useState<ConsoleTab>("compiler");
  const [serialUnread, setSerialUnread] = useState(false);

  // A failed build shows the compiler; a successful one switches to the sketch's output.
  useEffect(() => {
    if (compileOutput) setTab(compileOutput.failed ? "compiler" : "serial");
  }, [compileOutput]);

  useEffect(() => {
    if (serial && (tab !== "serial" || collapsed)) setSerialUnread(true);
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
  const serialView = useStickToBottom(serial);

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
        <pre ref={serialView.ref} onScroll={serialView.onScroll} className="console-text serial">
          {serial || <span className="muted">Serial output from the sketch appears here.</span>}
        </pre>
      </Tabs.Content>
    </Tabs.Root>
  );
}
