import { FolderOpen, Plus, Search, Upload, X } from "lucide-react";
import { useState } from "react";
import { useProjectActions } from "./ProjectActions";
import { IconButton, RowContextMenu, RowMenu, type RowAction } from "./ui";

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

function ago(iso: string) {
  const seconds = (Date.parse(iso) - Date.now()) / 1000;
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["day", 86_400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

export function ProjectsPanel() {
  const {
    projects,
    selectedId,
    select,
    openNewProject,
    importFile,
    duplicate,
    exportProject,
    remove,
  } = useProjectActions();
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  const shown = needle ? projects.filter((p) => p.name.toLowerCase().includes(needle)) : projects;

  return (
    <section className="side-panel" aria-label="Projects">
      <div className="panel-header">
        <h2>Projects</h2>
        <IconButton label="Import .ino / .zip" onClick={importFile}>
          <Upload size={15} />
        </IconButton>
        <IconButton label="New project" onClick={openNewProject}>
          <Plus size={16} />
        </IconButton>
      </div>
      <div className="search">
        <Search size={14} aria-hidden />
        <input
          type="search"
          aria-label="Search projects"
          placeholder="Search projects"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQuery("")}
        />
        {query && (
          <button className="search-clear" aria-label="Clear search" onClick={() => setQuery("")}>
            <X size={13} />
          </button>
        )}
      </div>
      {projects.length === 0 ? (
        <p className="panel-empty">No projects yet. Create one with +.</p>
      ) : shown.length === 0 ? (
        <p className="panel-empty">No projects match “{query.trim()}”.</p>
      ) : (
        <ul className="tree" aria-label="Projects">
          {shown.map((p) => {
            const actions: RowAction[] = [
              { label: "Duplicate", onSelect: () => duplicate(p.id) },
              { label: "Export", onSelect: () => exportProject(p.id) },
              { label: "Delete…", danger: true, onSelect: () => remove(p.id) },
            ];
            return (
              <RowContextMenu key={p.id} actions={actions}>
                <li
                  aria-current={p.id === selectedId || undefined}
                  className={p.id === selectedId ? "tree-row active" : "tree-row"}
                >
                  <button className="tree-label two-line" onClick={() => select(p.id)}>
                    <FolderOpen size={15} aria-hidden />
                    <span className="tree-text">
                      <span className="truncate">{p.name}</span>
                      <span className="tree-meta">
                        {p.led.count} LEDs · D{p.led.dataPin} · {ago(p.updatedAt)}
                      </span>
                    </span>
                  </button>
                  <RowMenu label={`Actions for ${p.name}`} actions={actions} />
                </li>
              </RowContextMenu>
            );
          })}
        </ul>
      )}
    </section>
  );
}
