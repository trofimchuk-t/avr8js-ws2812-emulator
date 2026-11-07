import { useRef } from "react";
import type { ProjectSummary } from "../lib/api";
import { BLANK_DRAFT, TEMPLATES } from "../lib/templates";
import type { ProjectDraft } from "../lib/project-io";

export function ProjectList({
  projects,
  selectedId,
  onSelect,
  onCreate,
  onImport,
  onDuplicate,
  onExport,
  onDelete,
}: {
  projects: ProjectSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: (draft: ProjectDraft) => void;
  onImport: (file: File) => void;
  onDuplicate: (id: string) => void;
  onExport: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const selected = projects.find((p) => p.id === selectedId);

  return (
    <aside className="sidebar">
      <h2>Projects</h2>
      <select
        aria-label="New project"
        value=""
        onChange={(e) => {
          const id = e.target.value;
          const draft = id === "blank" ? BLANK_DRAFT : TEMPLATES.find((t) => t.id === id)?.draft;
          if (draft) onCreate(draft);
        }}
      >
        <option value="">New project…</option>
        <option value="blank">Blank sketch</option>
        <optgroup label="From example">
          {TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </optgroup>
      </select>
      <button onClick={() => fileInput.current?.click()}>Import .ino / .zip</button>
      <input
        ref={fileInput}
        type="file"
        accept=".ino,.zip"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onImport(file);
        }}
      />

      <ul className="project-list">
        {projects.map((p) => (
          <li key={p.id}>
            <button
              className={p.id === selectedId ? "project active" : "project"}
              onClick={() => onSelect(p.id)}
            >
              {p.name}
            </button>
          </li>
        ))}
      </ul>

      {selected && (
        <div className="project-actions">
          <button className="link" onClick={() => onDuplicate(selected.id)}>
            Duplicate
          </button>
          <button className="link" onClick={() => onExport(selected.id)}>
            Export
          </button>
          <button
            className="link danger"
            onClick={() =>
              window.confirm(`Delete "${selected.name}"? This cannot be undone.`) &&
              onDelete(selected.id)
            }
          >
            Delete
          </button>
        </div>
      )}
    </aside>
  );
}
