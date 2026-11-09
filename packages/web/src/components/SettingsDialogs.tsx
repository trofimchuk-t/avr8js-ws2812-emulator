import { Monitor, Moon, Sun, X } from "lucide-react";
import { Dialog } from "radix-ui";
import type { ReactNode } from "react";
import { FONT_SIZES, useSettings } from "../lib/settings";
import { SHORTCUTS, shortcutKeys } from "../lib/shortcuts";
import { useTheme, type ThemePref } from "../lib/theme";

function DialogFrame({
  title,
  open,
  onOpenChange,
  children,
}: {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog small" aria-describedby={undefined}>
          <div className="dialog-header">
            <Dialog.Title className="dialog-title">{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="Close">
              <X size={16} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const THEMES: { value: ThemePref; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { pref, setPref } = useTheme();
  const { settings, update } = useSettings();
  return (
    <DialogFrame title="Settings" open={open} onOpenChange={onOpenChange}>
      <div className="settings">
        <div className="setting">
          <span className="setting-label" id="setting-theme">
            Theme
          </span>
          <div className="segmented" role="group" aria-labelledby="setting-theme">
            {THEMES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                className="segment"
                aria-pressed={pref === value}
                onClick={() => setPref(value)}
              >
                <Icon size={13} aria-hidden /> {label}
              </button>
            ))}
          </div>
        </div>
        <label className="setting">
          <span className="setting-label">Editor font size</span>
          <select
            className="select"
            value={settings.fontSize}
            onChange={(e) => update({ fontSize: Number(e.target.value) })}
          >
            {FONT_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} px
              </option>
            ))}
          </select>
        </label>
        <label className="setting">
          <span className="setting-label">Wrap long lines</span>
          <input
            type="checkbox"
            className="switch"
            role="switch"
            checked={settings.wordWrap}
            onChange={(e) => update({ wordWrap: e.target.checked })}
          />
        </label>
      </div>
      <p className="dialog-note">Settings are stored in this browser.</p>
    </DialogFrame>
  );
}

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <DialogFrame title="Keyboard shortcuts" open={open} onOpenChange={onOpenChange}>
      <table className="shortcuts">
        <tbody>
          {SHORTCUTS.map((s) => (
            <tr key={s.id}>
              <td>{s.label}</td>
              <td>
                {shortcutKeys(s.id).map((key) => (
                  <kbd key={key}>{key}</kbd>
                ))}
              </td>
            </tr>
          ))}
          <tr>
            <td>Rename the selected file</td>
            <td>
              <kbd>F2</kbd>
            </td>
          </tr>
        </tbody>
      </table>
    </DialogFrame>
  );
}
