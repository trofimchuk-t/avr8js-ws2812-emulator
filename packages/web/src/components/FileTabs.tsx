import type { SketchFile } from "@avr8js-ws2812/engine";
import { checkNewFileName } from "../lib/sketch-files";

export function FileTabs({
  files,
  active,
  main,
  onSelect,
  onAdd,
  onRename,
  onDelete,
  onSetMain,
}: {
  files: SketchFile[];
  active: string;
  main: string;
  onSelect: (name: string) => void;
  onAdd: (name: string) => void;
  onRename: (from: string, to: string) => void;
  onDelete: (name: string) => void;
  onSetMain: (name: string) => void;
}) {
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

  return (
    <div className="file-tabs" role="tablist">
      {files.map((file) => (
        <button
          key={file.name}
          role="tab"
          aria-selected={file.name === active}
          className={file.name === active ? "tab active" : "tab"}
          onClick={() => onSelect(file.name)}
        >
          {file.name === main ? "★ " : ""}
          {file.name}
        </button>
      ))}
      <button
        className="tab add"
        title="New file"
        onClick={() => {
          const name = ask("New file name (.ino .h .hpp .c .cpp)", "file.h");
          if (name) onAdd(name);
        }}
      >
        +
      </button>
      <div className="spacer" />
      <button
        className="link"
        onClick={() => {
          const name = ask("Rename file", active, active);
          if (!name || name === active) return;
          if (active === main && !name.endsWith(".ino")) {
            window.alert("The main file must stay a .ino file");
            return;
          }
          onRename(active, name);
        }}
      >
        Rename
      </button>
      {active !== main && active.endsWith(".ino") && (
        <button className="link" onClick={() => onSetMain(active)}>
          Make main
        </button>
      )}
      {active !== main && (
        <button
          className="link danger"
          onClick={() => window.confirm(`Delete ${active}?`) && onDelete(active)}
        >
          Delete
        </button>
      )}
    </div>
  );
}
