import { ChevronDown, ChevronUp, Eraser } from "lucide-react";
import { Tabs } from "radix-ui";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CompileOutput } from "../hooks/useSimulation";
import { IconButton } from "./ui";

type ConsoleTab = "compiler" | "serial";

const countErrors = (text: string) => text.match(/\berror:/g)?.length ?? 0;

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
  serial,
  onClearCompiler,
  onClearSerial,
  collapsed,
  onToggleCollapsed,
}: {
  compileOutput: CompileOutput | null;
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
  const errors = countErrors(compilerText);
  const compilerView = useStickToBottom(compilerText);
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
            {errors > 0 && <span className="badge danger">{errors}</span>}
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
          ref={compilerView.ref}
          onScroll={compilerView.onScroll}
          className={compileOutput?.failed ? "console-text failed" : "console-text"}
        >
          {compilerText || <span className="muted">Press Run to compile the sketch.</span>}
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
