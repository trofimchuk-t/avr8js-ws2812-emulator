import { createLedConfig, parseSketchConfig } from "@avr8js-ws2812/engine";
import { Files, FolderKanban, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
  type PanelImperativeHandle,
} from "react-resizable-panels";
import { useProjectDraft } from "../hooks/useProjectDraft";
import { useSimulation } from "../hooks/useSimulation";
import type { ProjectSummary } from "../lib/api";
import { parseDiagnostics, type Diagnostic } from "../lib/diagnostics";
import { useSettings } from "../lib/settings";
import { matchShortcut, type ShortcutId } from "../lib/shortcuts";
import { joinSources } from "../lib/sketch-files";
import { layoutStorage, usePref } from "../lib/storage";
import { useTheme } from "../lib/theme";
import { CodeEditor, type JumpTarget } from "./CodeEditor";
import { ConsoleDock } from "./ConsoleDock";
import { FileTabs } from "./FileTabs";
import { FilesPanel } from "./FilesPanel";
import { HardwarePanel } from "./HardwarePanel";
import { Header } from "./Header";
import type { MatrixHandle } from "./Matrix";
import { PreviewPanel } from "./PreviewPanel";
import { ProjectsPanel } from "./ProjectsPanel";
import { SettingsDialog, ShortcutsDialog } from "./SettingsDialogs";
import { Toolbar } from "./Toolbar";
import { IconButton } from "./ui";

type SideTab = "files" | "projects";

/** Height of the console tab bar; the console collapses to it rather than disappearing. */
const CONSOLE_BAR_PX = 34;
const PLACEHOLDER_LED = createLedConfig({ count: 8 });

/** The whole workspace for one project (keyed by project id in `App`). */
export function ProjectEditor({
  id,
  onSaved,
  message,
  onDismissMessage,
}: {
  id: string | null;
  onSaved: (project: ProjectSummary) => void;
  message: string;
  onDismissMessage: () => void;
}) {
  const { theme } = useTheme();
  const { settings } = useSettings();
  const [dialog, setDialog] = useState<"settings" | "shortcuts" | null>(null);
  const { draft, loadError, saveState, saveError, save, update, editFile } = useProjectDraft(
    id,
    onSaved,
  );
  const matrix = useRef<MatrixHandle>(null);
  const sim = useSimulation(matrix);
  const [active, setActive] = useState("");
  const [sideTab, setSideTab] = usePref<SideTab>("sideTab", "files");

  // --- panel layout (remembered between reloads) ---
  const mainLayout = useDefaultLayout({ id: "layout.main", storage: layoutStorage });
  const centerLayout = useDefaultLayout({ id: "layout.center", storage: layoutStorage });
  const rightLayout = useDefaultLayout({ id: "layout.right", storage: layoutStorage });
  const sidebar = useRef<PanelImperativeHandle>(null);
  const consolePanel = useRef<PanelImperativeHandle>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [consoleCollapsed, setConsoleCollapsed] = useState(false);
  // The preview can cover the whole workspace; stopping the simulation restores it.
  const [previewMaximized, setPreviewMaximized] = useState(false);
  const stop = () => {
    setPreviewMaximized(false);
    sim.stop();
  };

  const onRail = (tab: SideTab) => {
    const panel = sidebar.current;
    if (tab === sideTab && panel && !panel.isCollapsed()) {
      panel.collapse();
    } else {
      setSideTab(tab);
      panel?.expand();
    }
  };

  // What the sketch itself says about the strip, compared with the project settings.
  const files = draft?.files;
  const main = draft?.main;
  const sketchConfig = useMemo(
    () => (files && main !== undefined ? parseSketchConfig(joinSources(files, main)) : null),
    [files, main],
  );

  // Compiler messages for files of this project, shown in the editor and the console.
  const fileNames = useMemo(() => files?.map((f) => f.name) ?? [], [files]);
  const fileKey = fileNames.join("\n");
  const diagnostics = useMemo(
    () => (sim.compileOutput ? parseDiagnostics(sim.compileOutput.text, fileKey.split("\n")) : []),
    [sim.compileOutput, fileKey],
  );
  const [jump, setJump] = useState<JumpTarget | null>(null);
  const jumpTo = (d: Diagnostic) => {
    setActive(d.file);
    setJump((prev) => ({
      file: d.file,
      line: d.line,
      column: d.column,
      seq: (prev?.seq ?? 0) + 1,
    }));
  };

  const toggleConsole = () => {
    const panel = consolePanel.current;
    if (!panel) return;
    if (panel.isCollapsed()) panel.expand();
    else panel.collapse();
  };

  // --- keyboard shortcuts (capture phase, so they win over Monaco's own bindings) ---
  const handlers: Record<ShortcutId, () => void> = {
    run: () => draft && sim.runState !== "compiling" && void sim.run(draft),
    stop,
    save: () => void save(),
    sidebar: () => onRail(sideTab),
    console: toggleConsole,
    settings: () => setDialog("settings"),
  };
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const previewMaximizedRef = useRef(previewMaximized);
  previewMaximizedRef.current = previewMaximized;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A modal dialog owns the keyboard (Enter there submits it).
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      if (e.key === "Escape" && previewMaximizedRef.current) {
        e.preventDefault();
        setPreviewMaximized(false);
        return;
      }
      const id = matchShortcut(e);
      if (!id) return;
      e.preventDefault();
      e.stopPropagation();
      handlersRef.current[id]();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const activeFile = draft?.files.some((f) => f.name === active) ? active : (draft?.main ?? "");
  const shownLed = draft?.led ?? PLACEHOLDER_LED;

  let editorPlaceholder: string | null = null;
  if (!id) editorPlaceholder = "Create a project to start.";
  else if (loadError) editorPlaceholder = `Cannot open the project: ${loadError}`;
  else if (!draft) editorPlaceholder = "Loading…";

  return (
    <div className="app">
      <Header
        project={
          draft
            ? {
                name: draft.name,
                onRename: (name) => update({ name }),
                saveState,
                onRetrySave: () => void save(),
              }
            : undefined
        }
        onOpenSettings={() => setDialog("settings")}
        onOpenShortcuts={() => setDialog("shortcuts")}
      />
      <SettingsDialog
        open={dialog === "settings"}
        onOpenChange={(open) => setDialog(open ? "settings" : null)}
      />
      <ShortcutsDialog
        open={dialog === "shortcuts"}
        onOpenChange={(open) => setDialog(open ? "shortcuts" : null)}
      />
      <Toolbar
        runState={sim.runState}
        nanos={sim.nanos}
        speed={sim.speed}
        disabled={!draft}
        onRun={() => draft && void sim.run(draft)}
        onStop={stop}
        onPause={sim.pause}
        onResume={sim.resume}
        onSpeed={sim.setSpeed}
      />
      {(message || saveError) && (
        <div className="banner danger app-banner" role="alert">
          <div>{message || `Saving failed: ${saveError}`}</div>
          {message && (
            <IconButton label="Dismiss" onClick={onDismissMessage}>
              <X size={15} />
            </IconButton>
          )}
        </div>
      )}

      <div className={`workspace${previewMaximized ? " preview-maximized" : ""}`}>
        <nav className="rail" aria-label="Sidebar">
          <IconButton
            label="Files"
            aria-pressed={sideTab === "files" && !sidebarCollapsed}
            onClick={() => onRail("files")}
          >
            <Files size={20} />
          </IconButton>
          <IconButton
            label="Projects"
            aria-pressed={sideTab === "projects" && !sidebarCollapsed}
            onClick={() => onRail("projects")}
          >
            <FolderKanban size={20} />
          </IconButton>
        </nav>

        <Group
          id="main"
          orientation="horizontal"
          className="workspace-group"
          defaultLayout={mainLayout.defaultLayout}
          onLayoutChanged={mainLayout.onLayoutChanged}
        >
          <Panel
            id="sidebar"
            panelRef={sidebar}
            defaultSize={240}
            minSize={170}
            maxSize="40%"
            collapsible
            groupResizeBehavior="preserve-pixel-size"
            onResize={() => setSidebarCollapsed(sidebar.current?.isCollapsed() ?? false)}
            className="panel sidebar"
          >
            {sideTab === "projects" ? (
              <ProjectsPanel />
            ) : draft ? (
              <FilesPanel
                files={draft.files}
                active={activeFile}
                main={draft.main}
                onSelect={setActive}
                onAdd={(name) => {
                  update({ files: [...draft.files, { name, content: "" }] });
                  setActive(name);
                }}
                onRename={(from, to) => {
                  update({
                    files: draft.files.map((f) => (f.name === from ? { ...f, name: to } : f)),
                    main: draft.main === from ? to : draft.main,
                  });
                  if (activeFile === from) setActive(to);
                }}
                onDelete={(name) => {
                  update({ files: draft.files.filter((f) => f.name !== name) });
                  if (activeFile === name) setActive(draft.main);
                }}
                onSetMain={(name) => update({ main: name })}
              />
            ) : (
              <section className="side-panel">
                <div className="panel-header">
                  <h2>Files</h2>
                </div>
              </section>
            )}
          </Panel>
          <Separator className="resize-handle" />

          <Panel id="center" minSize="25%" className="panel">
            <Group
              id="center"
              orientation="vertical"
              defaultLayout={centerLayout.defaultLayout}
              onLayoutChanged={centerLayout.onLayoutChanged}
            >
              <Panel id="editor" minSize="20%" className="panel editor-pane">
                {editorPlaceholder || !draft ? (
                  <div className="placeholder">{editorPlaceholder}</div>
                ) : (
                  <>
                    <FileTabs
                      files={draft.files}
                      active={activeFile}
                      main={draft.main}
                      onSelect={setActive}
                    />
                    <CodeEditor
                      files={draft.files}
                      active={activeFile}
                      theme={theme}
                      settings={settings}
                      diagnostics={diagnostics}
                      jump={jump}
                      onChange={editFile}
                    />
                  </>
                )}
              </Panel>
              <Separator className="resize-handle" />
              <Panel
                id="console"
                panelRef={consolePanel}
                defaultSize="30%"
                minSize={100}
                collapsible
                collapsedSize={CONSOLE_BAR_PX}
                onResize={() => setConsoleCollapsed(consolePanel.current?.isCollapsed() ?? false)}
                className="panel"
              >
                <ConsoleDock
                  compileOutput={sim.compileOutput}
                  diagnostics={diagnostics}
                  onJump={jumpTo}
                  serial={sim.serial}
                  onClearCompiler={sim.clearCompileOutput}
                  onClearSerial={sim.clearSerial}
                  collapsed={consoleCollapsed}
                  onToggleCollapsed={toggleConsole}
                />
              </Panel>
            </Group>
          </Panel>
          <Separator className="resize-handle" />

          <Panel
            id="right"
            defaultSize="32%"
            minSize={260}
            groupResizeBehavior="preserve-pixel-size"
            className="panel"
          >
            <Group
              id="right"
              orientation="vertical"
              defaultLayout={rightLayout.defaultLayout}
              onLayoutChanged={rightLayout.onLayoutChanged}
            >
              <Panel id="preview" minSize={120} className="panel">
                <PreviewPanel
                  led={shownLed}
                  matrix={matrix}
                  onChange={draft ? (led) => update({ led }) : undefined}
                  maximized={previewMaximized}
                  onToggleMaximized={() => setPreviewMaximized((m) => !m)}
                />
              </Panel>
              <Separator className="resize-handle" />
              <Panel id="hardware" defaultSize="40%" minSize={120} className="panel scroll">
                {draft && sketchConfig ? (
                  <HardwarePanel
                    led={draft.led}
                    sketchConfig={sketchConfig}
                    runningLed={
                      sim.runState === "running" || sim.runState === "paused"
                        ? sim.runningLed
                        : null
                    }
                    onRestart={() => void sim.run(draft)}
                    onChange={(led) => update({ led })}
                  />
                ) : (
                  <div className="placeholder" />
                )}
              </Panel>
            </Group>
          </Panel>
        </Group>
      </div>
    </div>
  );
}
