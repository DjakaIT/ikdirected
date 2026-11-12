// Who is signed in (page-wide; every admin island reads the same module). The PHP API is the authority:
// GET /api/admin/auth/state on load, and any 401 from the API signs the page out (AuthGate shows sign-in).
import { signal } from "@preact/signals";

export type Role = "admin" | "urednik";
export interface SignedIn {
  name: string;
  role: Role;
  csrf: string;
}
export type Session =
  | { kind: "loading" }
  | { kind: "out"; firstSetup: boolean; codeRequired: boolean; step: "2fa" | "setup-2fa" | null; reason: string | null }
  | ({ kind: "in" } & SignedIn);

export const session = signal<Session>({ kind: "loading" });

export const csrfToken = (): string | null => (session.value.kind === "in" ? session.value.csrf : null);

export function signedIn(s: SignedIn): void {
  session.value = { kind: "in", ...s };
}

/** the API said 401: the page shows sign-in again (work in progress stays in the form fields) */
export function signedOut(reason: string | null = null): void {
  if (session.value.kind === "out") return;
  session.value = { kind: "out", firstSetup: false, codeRequired: false, step: null, reason };
}
