"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./button";

export type DialogProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
};

export function Dialog({ open, title, description, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const trigger = document.activeElement;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    return () => {
      if (dialog.open) dialog.close();
      if (open && trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, [open]);

  return (
    <dialog ref={ref} className="dialog" aria-labelledby={`${id}-title`} aria-describedby={description ? `${id}-description` : undefined} onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className="dialog-header">
        <h2 id={`${id}-title`}>{title}</h2>
        <Button variant="secondary" onClick={onClose} aria-label={`Close ${title}`}>Close</Button>
      </div>
      {description ? <p id={`${id}-description`} className="page-description">{description}</p> : null}
      {children}
    </dialog>
  );
}
