import { useCallback, useEffect, useRef, useState } from "react";
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  type ProjectSummary,
} from "../lib/api";
import { exportProject, importProject, type ProjectDraft } from "../lib/project-io";
import { DEFAULT_TEMPLATE } from "../lib/templates";
import { ProjectEditor } from "./ProjectEditor";
import { ProjectList } from "./ProjectList";

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

function useHashId() {
  const read = () => location.hash.replace(/^#\/?/, "") || null;
  const [id, setId] = useState(read);
  useEffect(() => {
    const onChange = () => setId(read());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return [id, (next: string | null) => (location.hash = next ? `/${next}` : "")] as const;
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
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [hashId, selectId] = useHashId();

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

  const run = async (action: () => Promise<void>) => {
    setMessage("");
    try {
      await action();
    } catch (err) {
      setMessage(errorText(err));
    }
  };

  const create = (draft: ProjectDraft) =>
    run(async () => {
      const project = await createProject(draft);
      setProjects((list) => [project, ...(list ?? [])]);
      selectId(project.id);
    });

  const onSaved = useCallback((saved: ProjectSummary) => {
    setProjects((list) => list && [saved, ...list.filter((p) => p.id !== saved.id)]);
  }, []);

  if (loadError) {
    return (
      <div className="startup-error">
        <p>{loadError}</p>
        <button onClick={() => void load()}>Retry</button>
      </div>
    );
  }
  if (!projects) return <div className="muted">Loading…</div>;

  return (
    <div className="layout">
      <ProjectList
        projects={projects}
        selectedId={selectedId}
        onSelect={selectId}
        onCreate={create}
        onImport={(file) =>
          run(async () => {
            const imported = importProject(file.name, new Uint8Array(await file.arrayBuffer()));
            await create(imported);
            if (imported.warnings.length) setMessage(imported.warnings.join("; "));
          })
        }
        onDuplicate={(id) =>
          run(async () => {
            const source = await getProject(id);
            await create({
              name: `${source.name} (copy)`.slice(0, 100),
              led: source.led,
              files: source.files,
              main: source.mainFile,
            });
          })
        }
        onExport={(id) =>
          run(async () => {
            const source = await getProject(id);
            download(
              exportProject({
                name: source.name,
                led: source.led,
                files: source.files,
                main: source.mainFile,
              }),
            );
          })
        }
        onDelete={(id) =>
          run(async () => {
            await deleteProject(id);
            const rest = projects.filter((p) => p.id !== id);
            setProjects(rest);
            selectId(rest[0]?.id ?? null);
          })
        }
      />
      <main className="main">
        {message && <div className="error">{message}</div>}
        {selectedId ? (
          <ProjectEditor key={selectedId} id={selectedId} onSaved={onSaved} />
        ) : (
          <div className="muted">Create a project to start.</div>
        )}
      </main>
    </div>
  );
}
