import { MoreHorizontal } from "lucide-react";
import { ContextMenu, DropdownMenu, Tooltip } from "radix-ui";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Square icon button with an accessible name and a tooltip. */
export function IconButton({
  label,
  children,
  className,
  ...rest
}: { label: string; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          className={className ? `icon-button ${className}` : "icon-button"}
          {...rest}
        >
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" sideOffset={6}>
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** Dropdown menu with the shared styling. Items are `MenuItem`s or other `DropdownMenu` parts. */
export function Menu({
  trigger,
  children,
  align = "start",
  keepFocus,
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "end";
  /** Do not move focus back to the trigger on close (an item opened an input that needs it). */
  keepFocus?: boolean;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="menu"
          align={align}
          sideOffset={4}
          onCloseAutoFocus={keepFocus ? (e) => e.preventDefault() : undefined}
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function MenuItem({
  children,
  onSelect,
  danger,
  disabled,
}: {
  children: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu.Item
      className={danger ? "menu-item danger" : "menu-item"}
      onSelect={onSelect}
      disabled={disabled}
    >
      {children}
    </DropdownMenu.Item>
  );
}

/** One entry of a row's action list, shown both in its "⋯" menu and its right-click menu. */
export interface RowAction {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Shortcut hint shown on the right, e.g. "F2". */
  hint?: string;
}

function ActionLabel({ action }: { action: RowAction }) {
  return (
    <>
      {action.label}
      {action.hint && <span className="menu-item-end menu-hint">{action.hint}</span>}
    </>
  );
}

/** "⋯" dropdown for a list row. */
export function RowMenu({ label, actions }: { label: string; actions: RowAction[] }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="row-menu" aria-label={label}>
          <MoreHorizontal size={15} aria-hidden />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="menu"
          align="end"
          sideOffset={4}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {actions.map((action) => (
            <DropdownMenu.Item
              key={action.label}
              className={action.danger ? "menu-item danger" : "menu-item"}
              disabled={action.disabled}
              onSelect={action.onSelect}
            >
              <ActionLabel action={action} />
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Right-click menu around a list row with the same actions as its `RowMenu`. */
export function RowContextMenu({
  actions,
  children,
}: {
  actions: RowAction[];
  children: ReactNode;
}) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="menu" onCloseAutoFocus={(e) => e.preventDefault()}>
          {actions.map((action) => (
            <ContextMenu.Item
              key={action.label}
              className={action.danger ? "menu-item danger" : "menu-item"}
              disabled={action.disabled}
              onSelect={action.onSelect}
            >
              <ActionLabel action={action} />
            </ContextMenu.Item>
          ))}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
