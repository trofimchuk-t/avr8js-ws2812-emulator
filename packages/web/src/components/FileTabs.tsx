import type { SketchFile } from "@avr8js-ws2812/engine";
import { Star } from "lucide-react";

/** Editor tabs: one per file. File actions live in the Files panel. */
export function FileTabs({
  files,
  active,
  main,
  onSelect,
}: {
  files: SketchFile[];
  active: string;
  main: string;
  onSelect: (name: string) => void;
}) {
  return (
    <div className="file-tabs" role="tablist" aria-label="Open files">
      {files.map((file) => (
        <button
          key={file.name}
          role="tab"
          aria-selected={file.name === active}
          className="file-tab"
          onClick={() => onSelect(file.name)}
        >
          {file.name === main && <Star size={11} className="main-star" aria-label="main file" />}
          <span className="mono">{file.name}</span>
        </button>
      ))}
    </div>
  );
}
