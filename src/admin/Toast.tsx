// DESIGN §6 toast: bottom-centre, role="status", 10 s, optional underlined action, max one visible.
import { useEffect } from "preact/hooks";
import { dismissToast, toast } from "./store";

const LIFETIME_MS = 10_000;

export default function Toaster() {
  const t = toast.value;

  useEffect(() => {
    if (!t) return;
    const timer = setTimeout(() => dismissToast(t.id), LIFETIME_MS);
    return () => clearTimeout(timer);
  }, [t?.id]);

  return (
    <div class="toast-region" role="status" aria-live="polite">
      {t && (
        <div class="toast" key={t.id}>
          <span>{t.message}</span>
          {t.action && (
            <button
              type="button"
              class="toast__action"
              onClick={async () => {
                const action = t.action!;
                dismissToast(t.id);
                await action.run();
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
