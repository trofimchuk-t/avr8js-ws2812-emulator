import { Check, ChevronDown, ExternalLink, Monitor, Moon, Settings, Sun, Zap } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import type { SaveState } from "../hooks/useProjectDraft";
import { useTheme, type ThemePref } from "../lib/theme";
import { useProjectActions } from "./ProjectActions";
import { shortcutText } from "../lib/shortcuts";
import { IconButton, Menu, MenuItem } from "./ui";

const SAVE_LABEL: Record<SaveState, string> = {
  saved: "Saved",
  dirty: "Unsaved changes",
  saving: "Saving…",
  error: "Not saved",
};

const THEMES: { value: ThemePref; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

export function Header({
  project,
  onOpenSettings,
  onOpenShortcuts,
}: {
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
  /** Absent while loading or when there is no project. */
  project?: {
    name: string;
    onRename: (name: string) => void;
    saveState: SaveState;
    onRetrySave: () => void;
  };
}) {
  return (
    <header className="header">
      <div className="brand">
        <Zap size={18} aria-hidden />
        <span>AVR8js NeoPixels</span>
      </div>
      <nav className="header-menus" aria-label="Main menu">
        <ProjectMenu />
        <HelpMenu onOpenShortcuts={onOpenShortcuts} />
      </nav>
      <div className="header-project">
        {project && (
          <>
            <input
              className="project-name"
              aria-label="Project name"
              value={project.name}
              maxLength={100}
              onChange={(e) => project.onRename(e.target.value)}
            />
            <span className={`save-state ${project.saveState}`} role="status">
              {SAVE_LABEL[project.saveState]}
            </span>
            {project.saveState === "error" && (
              <button className="link" onClick={project.onRetrySave}>
                Retry
              </button>
            )}
          </>
        )}
      </div>
      <ThemeMenu />
      <IconButton label={`Settings (${shortcutText("settings")})`} onClick={onOpenSettings}>
        <Settings size={17} />
      </IconButton>
    </header>
  );
}

const LINKS = [
  { label: "FastLED documentation", href: "https://fastled.io/docs/" },
  { label: "avr8js on GitHub", href: "https://github.com/wokwi/avr8js" },
];

function HelpMenu({ onOpenShortcuts }: { onOpenShortcuts: () => void }) {
  return (
    <Menu
      trigger={
        <button className="menu-trigger">
          Help <ChevronDown size={14} aria-hidden />
        </button>
      }
    >
      <MenuItem onSelect={onOpenShortcuts}>Keyboard shortcuts</MenuItem>
      <DropdownMenu.Separator className="menu-separator" />
      {LINKS.map((link) => (
        <DropdownMenu.Item key={link.href} className="menu-item" asChild>
          <a href={link.href} target="_blank" rel="noreferrer">
            {link.label}
            <ExternalLink size={13} className="menu-item-end" aria-hidden />
          </a>
        </DropdownMenu.Item>
      ))}
    </Menu>
  );
}

function ProjectMenu() {
  const { selectedId, openNewProject, importFile, duplicate, exportProject, remove } =
    useProjectActions();
  return (
    <Menu
      trigger={
        <button className="menu-trigger">
          Project <ChevronDown size={14} aria-hidden />
        </button>
      }
    >
      <MenuItem onSelect={openNewProject}>New project…</MenuItem>
      <MenuItem onSelect={importFile}>Import .ino / .zip…</MenuItem>
      <DropdownMenu.Separator className="menu-separator" />
      <MenuItem disabled={!selectedId} onSelect={() => selectedId && duplicate(selectedId)}>
        Duplicate
      </MenuItem>
      <MenuItem disabled={!selectedId} onSelect={() => selectedId && exportProject(selectedId)}>
        Export
      </MenuItem>
      <DropdownMenu.Separator className="menu-separator" />
      <MenuItem danger disabled={!selectedId} onSelect={() => selectedId && remove(selectedId)}>
        Delete project…
      </MenuItem>
    </Menu>
  );
}

function ThemeMenu() {
  const { pref, setPref } = useTheme();
  const current = THEMES.find((t) => t.value === pref) ?? THEMES[0];
  const Icon = current.icon;
  return (
    <Menu
      align="end"
      trigger={
        <button className="menu-trigger" aria-label={`Theme: ${current.label}`}>
          <Icon size={16} aria-hidden />
          <span className="menu-trigger-label">{current.label}</span>
          <ChevronDown size={14} aria-hidden />
        </button>
      }
    >
      <DropdownMenu.Label className="menu-label">Theme</DropdownMenu.Label>
      <DropdownMenu.RadioGroup value={pref} onValueChange={(v) => setPref(v as ThemePref)}>
        {THEMES.map(({ value, label, icon: ItemIcon }) => (
          <DropdownMenu.RadioItem key={value} value={value} className="menu-item">
            <ItemIcon size={15} aria-hidden />
            {label}
            <DropdownMenu.ItemIndicator className="menu-item-end">
              <Check size={14} aria-hidden />
            </DropdownMenu.ItemIndicator>
          </DropdownMenu.RadioItem>
        ))}
      </DropdownMenu.RadioGroup>
    </Menu>
  );
}
