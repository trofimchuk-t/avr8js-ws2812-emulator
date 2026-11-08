import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import { useEffect, useRef } from "react";
import type { SketchFile } from "@avr8js-ws2812/engine";

// C++ only needs the generic editor worker (no language-service worker).
self.MonacoEnvironment = { getWorker: () => new EditorWorker() };

const uriOf = (name: string) => monaco.Uri.parse(`inmemory://project/${name}`);

/** One editor with a model per file. The parent owns the text; edits are reported through `onChange`. */
export function CodeEditor({
  files,
  active,
  theme,
  onChange,
}: {
  files: SketchFile[];
  active: string;
  theme: "light" | "dark";
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
      fontSize: 13,
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

  // The Monaco theme is global; it follows the app theme.
  useEffect(() => monaco.editor.setTheme(theme === "dark" ? "vs-dark" : "vs"), [theme]);

  return <div className="code-editor" ref={container} />;
}
