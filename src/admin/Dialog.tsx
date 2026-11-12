// Native modal <dialog> (DESIGN §6): focus lands on the safest button, Esc cancels, focus returns
// to whatever opened it, and the page behind is inert while it is open.
import type { ComponentChildren } from "preact";
import { useEffect, useId, useRef } from "preact/hooks";

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  /** Buttons row; mark the safest one with `autofocus`. */
  actions: ComponentChildren;
}

export default function Dialog({ open, title, onClose, children, actions }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement as HTMLElement | null;
      d.showModal();
      d.querySelector<HTMLElement>("[autofocus]")?.focus();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      class="dlg"
      aria-labelledby={titleId}
      onClose={() => {
        opener.current?.focus();
        if (open) onClose();
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <h2 id={titleId} class="dlg__title">
        {title}
      </h2>
      <div class="dlg__body">{children}</div>
      <div class="dlg__actions">{actions}</div>
    </dialog>
  );
}
