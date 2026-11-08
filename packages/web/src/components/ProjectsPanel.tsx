import { FolderOpen, MoreHorizontal, Plus, Upload } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { BLANK_DRAFT, TEMPLATES } from "../lib/templates";
import { useProjectActions } from "./ProjectActions";
import { IconButton, Menu, MenuItem } from "./ui";

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
  const { projects, selectedId, select, create, importFile, duplicate, exportProject, remove } =
    useProjectActions();

  return (
    <section className="side-panel" aria-label="Projects">
      <div className="panel-header">
        <h2>Projects</h2>
        <IconButton label="Import .ino / .zip" onClick={importFile}>
          <Upload size={15} />
        </IconButton>
        <Menu
          align="end"
          trigger={
            <button className="icon-button" aria-label="New project">
              <Plus size={16} />
            </button>
          }
        >
          <MenuItem onSelect={() => create(BLANK_DRAFT)}>Blank sketch</MenuItem>
          <DropdownMenu.Separator className="menu-separator" />
          <DropdownMenu.Label className="menu-label">From example</DropdownMenu.Label>
          {TEMPLATES.map((t) => (
            <MenuItem key={t.id} onSelect={() => create(t.draft)}>
              {t.title}
            </MenuItem>
          ))}
        </Menu>
      </div>
      {projects.length === 0 ? (
        <p className="panel-empty">No projects yet. Create one with +.</p>
      ) : (
        <ul className="tree" aria-label="Projects">
          {projects.map((p) => (
            <li
              key={p.id}
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
              <Menu
                align="end"
                trigger={
                  <button className="row-menu" aria-label={`Actions for ${p.name}`}>
                    <MoreHorizontal size={15} />
                  </button>
                }
              >
                <MenuItem onSelect={() => duplicate(p.id)}>Duplicate</MenuItem>
                <MenuItem onSelect={() => exportProject(p.id)}>Export</MenuItem>
                <MenuItem danger onSelect={() => remove(p.id)}>
                  Delete…
                </MenuItem>
              </Menu>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
