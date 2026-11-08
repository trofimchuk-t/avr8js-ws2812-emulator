import type { LedConfig } from "@avr8js-ws2812/engine";
import { FilePlus2, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useState } from "react";
import type { ProjectDraft } from "../lib/project-io";
import { BLANK_DRAFT, TEMPLATES } from "../lib/templates";

interface Choice {
  id: string;
  title: string;
  subtitle: string;
  draft: ProjectDraft;
}

const describe = (led: LedConfig) =>
  [
    led.layout.kind === "matrix"
      ? `${led.layout.cols}×${led.layout.rows} matrix`
      : `${led.count} LEDs`,
    `D${led.dataPin}`,
    led.colorOrder,
  ].join(" · ");

const CHOICES: Choice[] = [
  { id: "blank", title: "Blank sketch", subtitle: describe(BLANK_DRAFT.led), draft: BLANK_DRAFT },
  ...TEMPLATES.map((t) => ({
    id: t.id,
    title: t.title,
    subtitle: describe(t.draft.led),
    draft: t.draft,
  })),
];

/** A few decorative LEDs per card; the hue is derived from the card so each looks different. */
function Swatch({ seed }: { seed: number }) {
  return (
    <div className="card-swatch" aria-hidden>
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} style={{ background: `hsl(${(seed * 67 + i * 22) % 360} 90% 60%)` }} />
      ))}
    </div>
  );
}

export function NewProjectDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (draft: ProjectDraft) => void;
}) {
  const [selected, setSelected] = useState("blank");
  const [name, setName] = useState("");
  // Start fresh every time the dialog opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSelected("blank");
      setName("");
    }
  }
  const choice = CHOICES.find((c) => c.id === selected) ?? CHOICES[0];

  const create = (target = choice) => {
    const projectName = name.trim() || (target.id === "blank" ? "Untitled" : target.title);
    onCreate({ ...target.draft, name: projectName.slice(0, 100) });
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog">
          <div className="dialog-header">
            <Dialog.Title className="dialog-title">New project</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="Close">
              <X size={16} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="dialog-description">
            Start from an empty sketch or copy one of the examples. LED settings are read from the
            sketch.
          </Dialog.Description>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <label className="field">
              Name
              <input
                value={name}
                maxLength={100}
                placeholder={choice.id === "blank" ? "Untitled" : choice.title}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div className="card-grid" role="group" aria-label="Start from">
              {CHOICES.map((c, index) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={c.id === selected}
                  className="card"
                  onClick={() => setSelected(c.id)}
                  onDoubleClick={() => create(c)}
                >
                  {c.id === "blank" ? (
                    <div className="card-swatch blank" aria-hidden>
                      <FilePlus2 size={20} />
                    </div>
                  ) : (
                    <Swatch seed={index} />
                  )}
                  <span className="card-title">{c.title}</span>
                  <span className="card-subtitle">{c.subtitle}</span>
                </button>
              ))}
            </div>
            <div className="dialog-actions">
              <Dialog.Close className="button" type="button">
                Cancel
              </Dialog.Close>
              <button className="button primary" type="submit">
                Create
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
