import type { LedConfig, SketchFile } from "@avr8js-ws2812/engine";
import { useCallback, useEffect, useRef, useState } from "react";
import { getProject, updateProject, type ProjectSummary } from "../lib/api";
import { errorText } from "../lib/errors";

const SAVE_DELAY_MS = 800;

export interface Draft {
  name: string;
  led: LedConfig;
  files: SketchFile[];
  main: string;
}

export type SaveState = "saved" | "dirty" | "saving" | "error";

/** What is sent to the server; also what "unsaved" is measured against. */
function payloadOf(draft: Draft) {
  return {
    name: draft.name.trim() || "Untitled",
    led: draft.led,
    files: draft.files,
    main: draft.main,
  };
}

/**
 * Loads a project and keeps a local draft of it, saved 800 ms after the last edit. Saves are
 * serialised; pending changes are written when the project is left, and closing the tab warns.
 */
export function useProjectDraft(id: string | null, onSaved: (project: ProjectSummary) => void) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState("");

  const draftRef = useRef<Draft | null>(null);
  draftRef.current = draft;
  const savedJson = useRef("");
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getProject(id).then(
      (project) => {
        if (cancelled) return;
        const loaded = {
          name: project.name,
          led: project.led,
          files: project.files,
          main: project.mainFile,
        };
        savedJson.current = JSON.stringify(payloadOf(loaded));
        setDraft(loaded);
      },
      (err) => !cancelled && setLoadError(errorText(err)),
    );
    return () => {
      cancelled = true;
    };
  }, [id]);

  /** Saves the latest draft after any save already in flight. */
  const save = useCallback(() => {
    saveChain.current = saveChain.current.then(async () => {
      const current = draftRef.current;
      if (!current || !id) return;
      const payload = payloadOf(current);
      const json = JSON.stringify(payload);
      if (json === savedJson.current) return;
      setSaveState("saving");
      try {
        const project = await updateProject(id, payload);
        savedJson.current = json;
        onSavedRef.current(project);
        setSaveError("");
        const latest = draftRef.current;
        setSaveState(latest && JSON.stringify(payloadOf(latest)) !== json ? "dirty" : "saved");
      } catch (err) {
        setSaveError(errorText(err));
        setSaveState("error");
      }
    });
    return saveChain.current;
  }, [id]);

  useEffect(() => {
    if (!draft || JSON.stringify(payloadOf(draft)) === savedJson.current) return;
    setSaveState("dirty");
    const timer = setTimeout(() => void save(), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft, save]);

  // Switching projects or leaving: write out what is pending.
  useEffect(() => () => void save(), [save]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      const current = draftRef.current;
      if (current && JSON.stringify(payloadOf(current)) !== savedJson.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const update = useCallback(
    (patch: Partial<Draft>) => setDraft((d) => d && { ...d, ...patch }),
    [],
  );
  const editFile = useCallback(
    (name: string, content: string) =>
      setDraft(
        (d) => d && { ...d, files: d.files.map((f) => (f.name === name ? { ...f, content } : f)) },
      ),
    [],
  );

  return { draft, loadError, saveState, saveError, save, update, editFile };
}
