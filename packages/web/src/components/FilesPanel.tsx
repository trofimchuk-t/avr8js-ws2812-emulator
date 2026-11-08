import type { SketchFile } from "@avr8js-ws2812/engine";
import { FileCode2, Plus, Star } from "lucide-react";
import { useState } from "react";
import { checkNewFileName, suggestFileName } from "../lib/sketch-files";
import { useConfirm } from "./ConfirmDialog";
import { IconButton, RowContextMenu, RowMenu, type RowAction } from "./ui";

export interface FileActions {
  onSelect: (name: string) => void;
  onAdd: (name: string) => void;
  onRename: (from: string, to: string) => void;
  onDelete: (name: string) => void;
  onSetMain: (name: string) => void;
}

type Editing = { mode: "new" } | { mode: "rename"; file: string } | null;

/**
 * Text field for a file name inside the tree. Enter or leaving the field commits a valid name,
 * Escape cancels; a problem with the name is shown under the field.
 */
function NameInput({
  initial,
  isNew,
  label,
  validate,
  onCommit,
  onCancel,
}: {
  initial: string;
  /** A new file: the suggested name is a valid answer, not "unchanged". */
  isNew?: boolean;
  label: string;
  validate: (name: string) => string | null;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [touched, setTouched] = useState(false);
  const name = value.trim();
  const unchanged = !isNew && name === initial;
  const problem = unchanged || !name ? null : validate(name);

  const commit = () => {
    if (!name || unchanged) onCancel();
    else if (!problem) onCommit(name);
  };

  return (
    <div className="name-input">
      <input
        className="mono"
        aria-label={label}
        aria-invalid={touched && !!problem}
        value={value}
        autoFocus
        spellCheck={false}
        onFocus={(e) => {
          // Select the base name so typing replaces it and keeps the extension.
          const dot = e.target.value.lastIndexOf(".");
          e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length);
        }}
        onChange={(e) => {
          setValue(e.target.value);
          setTouched(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            setTouched(true);
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        onBlur={() => (problem ? onCancel() : commit())}
      />
      {touched && problem && (
        <div className="name-input-error" role="alert">
          {problem}
        </div>
      )}
    </div>
  );
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
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Editing>(null);

  const validateNew = (name: string) => checkNewFileName(name, files);
  const validateRename = (file: string) => (name: string) =>
    file === main && !name.endsWith(".ino")
      ? "The main file must stay a .ino file"
      : checkNewFileName(name, files, file);

  const remove = async (file: string) => {
    const ok = await confirm({
      title: `Delete ${file}?`,
      description: "The file is removed from the project. This cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (ok) onDelete(file);
  };

  const actionsFor = (file: string): RowAction[] => {
    const isMain = file === main;
    return [
      { label: "Rename…", hint: "F2", onSelect: () => setEditing({ mode: "rename", file }) },
      {
        label: "Make main file",
        disabled: isMain || !file.endsWith(".ino"),
        onSelect: () => onSetMain(file),
      },
      { label: "Delete", danger: true, disabled: isMain, onSelect: () => void remove(file) },
    ];
  };

  return (
    <section className="side-panel" aria-label="Files">
      <div className="panel-header">
        <h2>Files</h2>
        <IconButton label="New file" onClick={() => setEditing({ mode: "new" })}>
          <Plus size={16} />
        </IconButton>
      </div>
      <ul className="tree" aria-label="Sketch files">
        {files.map((file) => {
          const isMain = file.name === main;
          if (editing?.mode === "rename" && editing.file === file.name) {
            return (
              <li key={file.name} className="tree-row editing">
                <FileCode2 size={15} aria-hidden />
                <NameInput
                  initial={file.name}
                  label={`New name for ${file.name}`}
                  validate={validateRename(file.name)}
                  onCommit={(to) => {
                    setEditing(null);
                    onRename(file.name, to);
                  }}
                  onCancel={() => setEditing(null)}
                />
              </li>
            );
          }
          const actions = actionsFor(file.name);
          return (
            <RowContextMenu key={file.name} actions={actions}>
              <li
                aria-current={file.name === active || undefined}
                className={file.name === active ? "tree-row active" : "tree-row"}
              >
                <button
                  className="tree-label"
                  onClick={() => onSelect(file.name)}
                  onDoubleClick={() => setEditing({ mode: "rename", file: file.name })}
                  onKeyDown={(e) => {
                    if (e.key === "F2") {
                      e.preventDefault();
                      setEditing({ mode: "rename", file: file.name });
                    } else if (e.key === "Delete" && !isMain) {
                      e.preventDefault();
                      void remove(file.name);
                    }
                  }}
                >
                  <FileCode2 size={15} aria-hidden />
                  <span className="mono truncate">{file.name}</span>
                  {isMain && (
                    <Star size={12} className="main-star" aria-label="main file">
                      <title>Main file</title>
                    </Star>
                  )}
                </button>
                <RowMenu label={`Actions for ${file.name}`} actions={actions} />
              </li>
            </RowContextMenu>
          );
        })}
        {editing?.mode === "new" && (
          <li className="tree-row editing">
            <FileCode2 size={15} aria-hidden />
            <NameInput
              initial={suggestFileName(files)}
              isNew
              label="New file name"
              validate={validateNew}
              onCommit={(name) => {
                setEditing(null);
                onAdd(name);
              }}
              onCancel={() => setEditing(null)}
            />
          </li>
        )}
      </ul>
      {editing && <p className="panel-hint">Letters, digits, _ or -; .ino .h .hpp .c .cpp</p>}
    </section>
  );
}
