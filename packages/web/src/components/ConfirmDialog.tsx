import { AlertDialog } from "radix-ui";
import { createContext, use, useCallback, useState, type ReactNode } from "react";

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  /** Styles the confirm button as destructive. */
  danger?: boolean;
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

/** Replaces `window.confirm`: `await confirm({ title })` resolves to the user's answer. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{
    options: ConfirmOptions;
    resolve: (ok: boolean) => void;
  } | null>(null);

  const confirm = useCallback<Confirm>(
    (options) =>
      new Promise((resolve) => {
        setPending((previous) => {
          previous?.resolve(false);
          return { options, resolve };
        });
      }),
    [],
  );

  const close = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  const options = pending?.options;
  return (
    <ConfirmContext value={confirm}>
      {children}
      <AlertDialog.Root open={!!pending} onOpenChange={(open) => !open && close(false)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="dialog-overlay" />
          <AlertDialog.Content className="dialog small">
            <AlertDialog.Title className="dialog-title">{options?.title}</AlertDialog.Title>
            {options?.description && (
              <AlertDialog.Description className="dialog-description">
                {options.description}
              </AlertDialog.Description>
            )}
            <div className="dialog-actions">
              <AlertDialog.Cancel className="button">Cancel</AlertDialog.Cancel>
              <AlertDialog.Action
                className={options?.danger ? "button danger" : "button primary"}
                onClick={() => close(true)}
              >
                {options?.confirmLabel ?? "OK"}
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </ConfirmContext>
  );
}

export function useConfirm() {
  const confirm = use(ConfirmContext);
  if (!confirm) throw new Error("useConfirm outside ConfirmProvider");
  return confirm;
}
