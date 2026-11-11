import { Tooltip } from "radix-ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  type ProjectSummary,
} from "../lib/api";
import { errorText } from "../lib/errors";
import { exportProject, importProject, type ProjectDraft } from "../lib/project-io";
import { DEFAULT_TEMPLATE } from "../lib/templates";
import { SettingsProvider } from "../lib/settings";
import { ThemeProvider } from "../lib/theme";
import { ConfirmProvider, useConfirm } from "./ConfirmDialog";
import { NewProjectDialog } from "./NewProjectDialog";
import { ProjectActionsContext, type ProjectActions } from "./ProjectActions";
import { ProjectEditor } from "./ProjectEditor";

function useHashId() {
  const read = () => location.hash.replace(/^#\/?/, "") || null;
  const [id, setId] = useState(read);
  useEffect(() => {
    const onChange = () => setId(read());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const select = useCallback((next: string | null) => {
    location.hash = next ? `/${next}` : "";
  }, []);
  return [id, select] as const;
}

function download(file: { filename: string; mime: string; data: Uint8Array }) {
  const url = URL.createObjectURL(new Blob([file.data as BlobPart], { type: file.mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = file.filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function App() {
  return (
    <ThemeProvider>
      <SettingsProvider>
        <Tooltip.Provider delayDuration={400}>
          <ConfirmProvider>
            <Projects />
          </ConfirmProvider>
        </Tooltip.Provider>
      </SettingsProvider>
    </ThemeProvider>
  );
}

function Projects() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [hashId, selectId] = useHashId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [newOpen, setNewOpen] = useState(false);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    setLoadError("");
    try {
      let list = await listProjects();
      if (list.length === 0) {
        // First start: begin with an example.
        list = [await createProject(DEFAULT_TEMPLATE.draft)];
      }
      setProjects(list);
    } catch (err) {
      setLoadError(errorText(err));
    }
  }, []);

  // StrictMode runs effects twice in development; a second load on an empty database would
  // create a second starter project.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void load();
  }, [load]);

  const selectedId =
    projects && (projects.some((p) => p.id === hashId) ? hashId : (projects[0]?.id ?? null));

  const onSaved = useCallback((saved: ProjectSummary) => {
    setProjects((list) => list && [saved, ...list.filter((p) => p.id !== saved.id)]);
  }, []);

  const actions = useMemo<ProjectActions | null>(() => {
    if (!projects) return null;
    const run = async (action: () => Promise<void>) => {
      setMessage("");
      try {
        await action();
      } catch (err) {
        setMessage(errorText(err));
      }
    };
    const add = async (draft: ProjectDraft) => {
      const project = await createProject(draft);
      setProjects((list) => [project, ...(list ?? [])]);
      selectId(project.id);
    };
    return {
      projects,
      selectedId,
      select: selectId,
      create: (draft) => void run(() => add(draft)),
      openNewProject: () => setNewOpen(true),
      importFile: () => fileInput.current?.click(),
      duplicate: (id) =>
        void run(async () => {
          const source = await getProject(id);
          await add({
            name: `${source.name} (copy)`.slice(0, 100),
            led: source.led,
            serial: source.serial,
            files: source.files,
            main: source.mainFile,
          });
        }),
      exportProject: (id) =>
        void run(async () => {
          const source = await getProject(id);
          download(
            exportProject({
              name: source.name,
              led: source.led,
              serial: source.serial,
              files: source.files,
              main: source.mainFile,
            }),
          );
        }),
      remove: (id) =>
        void run(async () => {
          const target = projects.find((p) => p.id === id);
          if (!target) return;
          const ok = await confirm({
            title: `Delete "${target.name}"?`,
            description: "The project and all its files are deleted. This cannot be undone.",
            confirmLabel: "Delete project",
            danger: true,
          });
          if (!ok) return;
          await deleteProject(id);
          setProjects((list) => list && list.filter((p) => p.id !== id));
          if (id === selectedId) selectId(projects.find((p) => p.id !== id)?.id ?? null);
        }),
    };
  }, [projects, selectedId, selectId, confirm]);

  if (loadError) {
    return (
      <div className="startup-state">
        <p>{loadError}</p>
        <button className="button primary" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }
  if (!actions) return <div className="startup-state muted">Loading…</div>;

  return (
    <ProjectActionsContext value={actions}>
      <input
        ref={fileInput}
        type="file"
        accept=".ino,.zip"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setMessage("");
          void (async () => {
            try {
              const imported = importProject(file.name, new Uint8Array(await file.arrayBuffer()));
              const project = await createProject(imported);
              setProjects((list) => [project, ...(list ?? [])]);
              selectId(project.id);
              if (imported.warnings.length) setMessage(imported.warnings.join("; "));
            } catch (err) {
              setMessage(errorText(err));
            }
          })();
        }}
      />
      <NewProjectDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreate={(draft) => actions.create(draft)}
      />
      <ProjectEditor
        key={selectedId ?? "none"}
        id={selectedId}
        onSaved={onSaved}
        message={message}
        onDismissMessage={() => setMessage("")}
      />
    </ProjectActionsContext>
  );
}
