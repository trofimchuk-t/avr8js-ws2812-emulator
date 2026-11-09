import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import { useEffect, useRef } from "react";
import type { SketchFile } from "@avr8js-ws2812/engine";
import type { Diagnostic } from "../lib/diagnostics";
import type { EditorSettings } from "../lib/settings";

// C++ only needs the generic editor worker (no language-service worker).
self.MonacoEnvironment = { getWorker: () => new EditorWorker() };

const uriOf = (name: string) => monaco.Uri.parse(`inmemory://project/${name}`);

/** A request to show a position; `seq` makes repeated jumps to the same place count. */
export interface JumpTarget {
  file: string;
  line: number;
  column?: number;
  seq: number;
}

/** One editor with a model per file. The parent owns the text; edits are reported through `onChange`. */
export function CodeEditor({
  files,
  active,
  theme,
  settings,
  diagnostics,
  jump,
  onChange,
}: {
  files: SketchFile[];
  active: string;
  theme: "light" | "dark";
  settings: EditorSettings;
  /** Shown as squiggles and in the overview ruler until the next build. */
  diagnostics: Diagnostic[];
  jump: JumpTarget | null;
  onChange: (name: string, content: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const latest = useRef({ files, onChange });
  latest.current = { files, onChange };

  useEffect(() => {
    const instance = monaco.editor.create(container.current!, {
      model: null,
      minimap: { enabled: false },
      automaticLayout: true,
      fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      fontSize: settings.fontSize,
      wordWrap: settings.wordWrap ? "on" : "off",
      scrollBeyondLastLine: false,
      padding: { top: 8 },
    });
    editor.current = instance;
    const subscription = instance.onDidChangeModelContent(() => {
      const model = instance.getModel();
      if (!model) return;
      const name = model.uri.path.slice(1);
      const current = latest.current.files.find((f) => f.name === name);
      // Ignore the echo of text we just pushed in ourselves.
      if (current && current.content !== model.getValue()) {
        latest.current.onChange(name, model.getValue());
      }
    });
    return () => {
      subscription.dispose();
      instance.dispose();
      for (const model of monaco.editor.getModels()) {
        if (model.uri.scheme === "inmemory") model.dispose();
      }
      editor.current = null;
    };
  }, []);

  useEffect(() => {
    const wanted = new Set(files.map((f) => uriOf(f.name).toString()));
    for (const model of monaco.editor.getModels()) {
      if (model.uri.scheme === "inmemory" && !wanted.has(model.uri.toString())) model.dispose();
    }
    for (const file of files) {
      const uri = uriOf(file.name);
      const model =
        monaco.editor.getModel(uri) ?? monaco.editor.createModel(file.content, "cpp", uri);
      if (model.getValue() !== file.content) model.setValue(file.content);
    }
    const model = monaco.editor.getModel(uriOf(active));
    if (model && editor.current?.getModel() !== model) editor.current?.setModel(model);
  }, [files, active]);

  useEffect(() => {
    editor.current?.updateOptions({
      fontSize: settings.fontSize,
      wordWrap: settings.wordWrap ? "on" : "off",
    });
  }, [settings.fontSize, settings.wordWrap]);

  useEffect(() => {
    for (const file of files) {
      const model = monaco.editor.getModel(uriOf(file.name));
      if (!model) continue;
      monaco.editor.setModelMarkers(
        model,
        "gcc",
        diagnostics
          .filter((d) => d.file === file.name)
          .map((d) => {
            const line = Math.min(d.line, model.getLineCount());
            const column = (d.column ?? model.getLineFirstNonWhitespaceColumn(line)) || 1;
            // Underline the word at the position, or the rest of the line without one.
            const word = model.getWordAtPosition({ lineNumber: line, column });
            return {
              severity:
                d.severity === "error"
                  ? monaco.MarkerSeverity.Error
                  : monaco.MarkerSeverity.Warning,
              message: d.message,
              startLineNumber: line,
              startColumn: word?.startColumn ?? column,
              endLineNumber: line,
              endColumn: word?.endColumn ?? model.getLineMaxColumn(line),
            };
          }),
      );
    }
  }, [diagnostics, files]);

  // Runs after the model switch above, so the target file is already shown.
  useEffect(() => {
    const instance = editor.current;
    if (!jump || !instance) return;
    const model = monaco.editor.getModel(uriOf(jump.file));
    if (!model) return;
    if (instance.getModel() !== model) instance.setModel(model);
    const position = { lineNumber: jump.line, column: jump.column ?? 1 };
    instance.setPosition(position);
    instance.revealPositionInCenterIfOutsideViewport(position);
    instance.focus();
  }, [jump]);

  // The Monaco theme is global; it follows the app theme.
  useEffect(() => monaco.editor.setTheme(theme === "dark" ? "vs-dark" : "vs"), [theme]);

  return <div className="code-editor" ref={container} />;
}
