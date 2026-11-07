import {
  createSimulation,
  formatTime,
  parseSketchConfig,
  type LedConfig,
  type Simulation,
  type SketchFile,
} from "@avr8js-ws2812/engine";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildHex } from "../compile";
import { getProject, updateProject, type ProjectSummary } from "../lib/api";
import { joinSources } from "../lib/sketch-files";
import { CodeEditor } from "./CodeEditor";
import { FileTabs } from "./FileTabs";
import { LedSettings } from "./LedSettings";
import { Matrix, type MatrixHandle } from "./Matrix";

const SAVE_DELAY_MS = 800;
const MAX_SERIAL_CHARS = 20_000;

interface Draft {
  name: string;
  led: LedConfig;
  files: SketchFile[];
  main: string;
}

type SaveState = "saved" | "dirty" | "saving" | "error";
type RunState = "idle" | "compiling" | "running";

/** What is sent to the server; also what "unsaved" is measured against. */
function payloadOf(draft: Draft) {
  return {
    name: draft.name.trim() || "Untitled",
    led: draft.led,
    files: draft.files,
    main: draft.main,
  };
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function ProjectEditor({
  id,
  onSaved,
}: {
  id: string;
  onSaved: (project: ProjectSummary) => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState("");
  const [active, setActive] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState("");

  const draftRef = useRef<Draft | null>(null);
  draftRef.current = draft;
  const savedJson = useRef("");
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  useEffect(() => {
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
        setActive(
          loaded.files.find((f) => f.name === loaded.main)?.name ?? loaded.files[0]?.name ?? "",
        );
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
      if (!current) return;
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

  // --- simulation ---
  const matrix = useRef<MatrixHandle>(null);
  const simulation = useRef<Simulation | null>(null);
  const alive = useRef(true);
  const [runState, setRunState] = useState<RunState>("idle");
  const [runningLed, setRunningLed] = useState<LedConfig | null>(null);
  const [compilerOutput, setCompilerOutput] = useState("");
  const [serial, setSerial] = useState("");
  const serialBuffer = useRef<string | null>(null);
  const [simTime, setSimTime] = useState("");

  const stop = useCallback(() => {
    simulation.current?.stop();
    simulation.current = null;
    setRunState("idle");
    setSimTime("");
  }, []);

  useEffect(() => {
    alive.current = true;
    const timer = setInterval(() => {
      if (serialBuffer.current === null) return;
      const text = serialBuffer.current;
      serialBuffer.current = null;
      setSerial((prev) => (prev + text).slice(-MAX_SERIAL_CHARS));
    }, 100);
    return () => {
      alive.current = false;
      clearInterval(timer);
      simulation.current?.stop();
      simulation.current = null;
    };
  }, []);

  async function run() {
    if (!draft) return;
    stop();
    setSerial("");
    serialBuffer.current = null;
    matrix.current?.clear();
    setRunState("compiling");
    const { files, main, led } = draft;
    try {
      const result = await buildHex(files, main);
      if (!alive.current) return;
      setCompilerOutput(result.stderr || result.stdout);
      if (!result.hex) {
        setRunState("idle");
        return;
      }
      setRunningLed(led);
      simulation.current = createSimulation({
        hex: result.hex,
        led,
        onSerial: (char) => {
          serialBuffer.current = (serialBuffer.current ?? "") + char;
        },
        onProgress: (nanos) => setSimTime("Simulation time: " + formatTime(nanos / 1e9)),
        onFrame: (pixels) => matrix.current?.setPixels(pixels),
      });
      simulation.current.start();
      setRunState("running");
    } catch (err) {
      if (!alive.current) return;
      setCompilerOutput(errorText(err));
      setRunState("idle");
    }
  }

  // --- editing ---
  const update = (patch: Partial<Draft>) => setDraft((d) => d && { ...d, ...patch });
  const editFile = useCallback(
    (name: string, content: string) =>
      setDraft(
        (d) => d && { ...d, files: d.files.map((f) => (f.name === name ? { ...f, content } : f)) },
      ),
    [],
  );

  // What the sketch itself says about the strip, compared with the project settings.
  const sketchConfig = useMemo(
    () => (draft ? parseSketchConfig(joinSources(draft.files, draft.main)) : null),
    [draft?.files, draft?.main],
  );

  if (loadError) return <div className="error">Cannot open the project: {loadError}</div>;
  if (!draft || !sketchConfig) return <div className="muted">Loading…</div>;

  const mismatches: string[] = [];
  const { found, config } = sketchConfig;
  if (found.dataPin && config.dataPin !== draft.led.dataPin) {
    mismatches.push(`pin D${config.dataPin} (settings: D${draft.led.dataPin})`);
  }
  if (found.count && config.count !== draft.led.count) {
    mismatches.push(`${config.count} LEDs (settings: ${draft.led.count})`);
  }
  if (found.colorOrder && config.colorOrder !== draft.led.colorOrder) {
    mismatches.push(`color order ${config.colorOrder} (settings: ${draft.led.colorOrder})`);
  }
  const shown = runningLed ?? draft.led;
  const cols = shown.layout.kind === "matrix" ? shown.layout.cols : shown.count;
  const rows = shown.layout.kind === "matrix" ? shown.layout.rows : 1;

  return (
    <div className="editor">
      <div className="project-header">
        <input
          className="project-name"
          aria-label="Project name"
          value={draft.name}
          maxLength={100}
          onChange={(e) => update({ name: e.target.value })}
        />
        <span className={`save-state ${saveState}`}>
          {
            { saved: "Saved", dirty: "Unsaved changes", saving: "Saving…", error: "Not saved" }[
              saveState
            ]
          }
        </span>
        {saveState === "error" && (
          <button className="link" onClick={() => void save()}>
            Retry
          </button>
        )}
      </div>
      {saveError && <div className="error">{saveError}</div>}

      <Matrix ref={matrix} cols={cols} rows={rows} />

      <div className="toolbar">
        <button onClick={run} disabled={runState !== "idle"}>
          Run
        </button>
        <button onClick={stop} disabled={runState !== "running"}>
          Stop
        </button>
        <div className="spacer" />
        <div>{runState === "compiling" ? "Compiling..." : simTime}</div>
      </div>

      <LedSettings led={draft.led} onChange={(led) => update({ led })} />
      {(mismatches.length > 0 || sketchConfig.warnings.length > 0) && (
        <div className="hint">
          {mismatches.length > 0 && (
            <div>
              The sketch says {mismatches.join(", ")}.{" "}
              <button
                className="link"
                onClick={() =>
                  update({
                    led: {
                      ...draft.led,
                      ...(found.dataPin && { dataPin: config.dataPin }),
                      ...(found.count && { count: config.count, layout: { kind: "strip" } }),
                      ...(found.colorOrder && { colorOrder: config.colorOrder }),
                    },
                  })
                }
              >
                Use the sketch values
              </button>
            </div>
          )}
          {sketchConfig.warnings.map((warning) => (
            <div key={warning}>{warning}</div>
          ))}
        </div>
      )}

      <FileTabs
        files={draft.files}
        active={active}
        main={draft.main}
        onSelect={setActive}
        onAdd={(name) => {
          update({ files: [...draft.files, { name, content: "" }] });
          setActive(name);
        }}
        onRename={(from, to) => {
          update({
            files: draft.files.map((f) => (f.name === from ? { ...f, name: to } : f)),
            main: draft.main === from ? to : draft.main,
          });
          setActive(to);
        }}
        onDelete={(name) => {
          update({ files: draft.files.filter((f) => f.name !== name) });
          setActive(draft.main);
        }}
        onSetMain={(name) => update({ main: name })}
      />
      <CodeEditor files={draft.files} active={active} onChange={editFile} />

      <div className="compiler-output">
        <pre>{compilerOutput}</pre>
        <pre className="serial">{serial}</pre>
      </div>
    </div>
  );
}
