import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./Button.js";
import { Icon } from "./Icon.js";

export interface ModalProps { open: boolean; onClose: () => void; title: string; children: ReactNode; variant?: "modal" | "sheet"; }
/** Native dialog provides focus containment, inert background and Escape semantics. */
export function Modal({ open, onClose, title, children, variant = "modal" }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    return () => { dialog.close(); if (trigger?.isConnected) trigger.focus(); };
  }, [open]);
  return <dialog ref={ref} className={`oq-kit-dialog oq-kit-dialog--${variant}`} aria-labelledby={id}
    onKeyDown={event => {
      if (event.key !== "Tab") return;
      const items = [...event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])',
      )].filter(el => el.getClientRects().length > 0);
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="oq-kit-dialog__header"><h2 id={id}>{title}</h2>
      <Button variant="ghost" aria-label={`Close ${title}`} onClick={onClose}><Icon name="close" /></Button>
    </div><div className="oq-kit-stack">{children}</div>
  </dialog>;
}
export function Sheet(props: Omit<ModalProps, "variant">) { return <Modal {...props} variant="sheet" />; }
