// Page-wide admin state shared between islands (ES modules are singletons per page).
import { signal } from "@preact/signals";

export interface ToastData {
  id: number;
  message: string;
  action?: { label: string; run: () => void | Promise<void> };
}

/** DESIGN §6: at most one toast; a newer one replaces the older. */
export const toast = signal<ToastData | null>(null);
let seq = 0;

export function showToast(message: string, action?: ToastData["action"]): void {
  toast.value = { id: ++seq, message, ...(action ? { action } : {}) };
}

export function dismissToast(id?: number): void {
  if (id === undefined || toast.value?.id === id) toast.value = null;
}

/** Number of uploads in flight on this page (drives the beforeunload warning, AC-UP-04). */
export const uploadsInFlight = signal(0);

/** Hand-over between pages: e.g. "album deleted" → the Albumi screen shows an undo toast. */
const FLASH_KEY = "ik-admin-flash";
export interface Flash {
  kind: "album-deleted";
  albumId: string;
}
export function setFlash(f: Flash): void {
  try {
    sessionStorage.setItem(FLASH_KEY, JSON.stringify(f));
  } catch {
    /* ignore */
  }
}
export function takeFlash(): Flash | null {
  try {
    const raw = sessionStorage.getItem(FLASH_KEY);
    sessionStorage.removeItem(FLASH_KEY);
    return raw ? (JSON.parse(raw) as Flash) : null;
  } catch {
    return null;
  }
}
