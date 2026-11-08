import type { SketchFile } from "@avr8js-ws2812/engine";
import { FileCode2, MoreHorizontal, Plus, Star } from "lucide-react";
import { checkNewFileName } from "../lib/sketch-files";
import { IconButton, Menu, MenuItem } from "./ui";

export interface FileActions {
  onSelect: (name: string) => void;
  onAdd: (name: string) => void;
  onRename: (from: string, to: string) => void;
  onDelete: (name: string) => void;
  onSetMain: (name: string) => void;
}

export function FilesPanel({
  files,
  active,
  main,
  onSelect,
  onAdd,
  onRename,
  onDelete,
  onSetMain,
}: { files: SketchFile[]; active: string; main: string } & FileActions) {
  // TODO(R3): replace prompt/alert/confirm with dialogs and inline rename.
  function ask(label: string, initial: string, ignore?: string) {
    const name = window.prompt(label, initial)?.trim();
    if (!name) return null;
    const problem = checkNewFileName(name, files, ignore);
    if (problem) {
      window.alert(problem);
      return null;
    }
    return name;
  }

  function rename(file: string) {
    const name = ask("Rename file", file, file);
    if (!name || name === file) return;
    if (file === main && !name.endsWith(".ino")) {
      window.alert("The main file must stay a .ino file");
      return;
    }
    onRename(file, name);
  }

  return (
    <section className="side-panel" aria-label="Files">
      <div className="panel-header">
        <h2>Files</h2>
        <IconButton
          label="New file"
          onClick={() => {
            const name = ask("New file name (.ino .h .hpp .c .cpp)", "file.h");
            if (name) onAdd(name);
          }}
        >
          <Plus size={16} />
        </IconButton>
      </div>
      <ul className="tree" aria-label="Sketch files">
        {files.map((file) => {
          const isMain = file.name === main;
          return (
            <li
              key={file.name}
              aria-current={file.name === active || undefined}
              className={file.name === active ? "tree-row active" : "tree-row"}
            >
              <button className="tree-label" onClick={() => onSelect(file.name)}>
                <FileCode2 size={15} aria-hidden />
                <span className="mono truncate">{file.name}</span>
                {isMain && <Star size={12} className="main-star" aria-label="main file" />}
              </button>
              <Menu
                align="end"
                trigger={
                  <button className="row-menu" aria-label={`Actions for ${file.name}`}>
                    <MoreHorizontal size={15} />
                  </button>
                }
              >
                <MenuItem onSelect={() => rename(file.name)}>Rename…</MenuItem>
                <MenuItem
                  disabled={isMain || !file.name.endsWith(".ino")}
                  onSelect={() => onSetMain(file.name)}
                >
                  Make main file
                </MenuItem>
                <MenuItem
                  danger
                  disabled={isMain}
                  onSelect={() => window.confirm(`Delete ${file.name}?`) && onDelete(file.name)}
                >
                  Delete
                </MenuItem>
              </Menu>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
