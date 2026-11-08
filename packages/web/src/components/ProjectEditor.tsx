import { createLedConfig, parseSketchConfig } from "@avr8js-ws2812/engine";
import { Files, FolderKanban, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
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
import { joinSources } from "../lib/sketch-files";
import { layoutStorage, usePref } from "../lib/storage";
import { useTheme } from "../lib/theme";
import { CodeEditor } from "./CodeEditor";
import { ConsoleDock } from "./ConsoleDock";
import { FileTabs } from "./FileTabs";
import { FilesPanel } from "./FilesPanel";
import { HardwarePanel } from "./HardwarePanel";
import { Header } from "./Header";
import type { MatrixHandle } from "./Matrix";
import { PreviewPanel } from "./PreviewPanel";
import { ProjectsPanel } from "./ProjectsPanel";
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

  const activeFile = draft?.files.some((f) => f.name === active) ? active : (draft?.main ?? "");
  const shownLed = sim.runningLed ?? draft?.led ?? PLACEHOLDER_LED;

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
      />
      <Toolbar
        runState={sim.runState}
        nanos={sim.nanos}
        speed={sim.speed}
        disabled={!draft}
        onRun={() => draft && void sim.run(draft)}
        onStop={sim.stop}
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

      <div className="workspace">
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
                  serial={sim.serial}
                  onClearCompiler={sim.clearCompileOutput}
                  onClearSerial={sim.clearSerial}
                  collapsed={consoleCollapsed}
                  onToggleCollapsed={() =>
                    consoleCollapsed
                      ? consolePanel.current?.expand()
                      : consolePanel.current?.collapse()
                  }
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
                <PreviewPanel led={shownLed} matrix={matrix} />
              </Panel>
              <Separator className="resize-handle" />
              <Panel id="hardware" defaultSize="40%" minSize={120} className="panel scroll">
                {draft && sketchConfig ? (
                  <HardwarePanel
                    led={draft.led}
                    sketchConfig={sketchConfig}
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
