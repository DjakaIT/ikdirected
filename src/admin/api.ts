// Typed admin API client (ARCHITECTURE §6) for the PHP backend at /api/admin. Screens only talk to this module.
// JSON via fetch; uploads via XMLHttpRequest (fetch has no upload progress). Every mutating request carries the
// session's CSRF token (X-CSRF); a 401 signs the page out so AuthGate can show sign-in again.
import type {
  Album,
  AlbumCard,
  AlbumDetail,
  AlbumPatch,
  ApiErrorBody,
  ErrorCode,
  FeaturedPhoto,
  Photo,
  PhotoPatch,
  PublishBlockReason,
  UploadParts,
} from "../lib/db/types";
import type { CategorySlug } from "../content/site";
import { csrfToken, signedOut, type Role } from "./session";

const BASE = "/api/admin";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    readonly reason?: PublishBlockReason,
    /** Croatian text from the server (sign-in screens show it as is) */
    readonly text?: string,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

export const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === "AbortError";

/** Croatian copy for an error (DESIGN §9). */
export function errorCopy(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case "PUBLISH_BLOCKED":
        return e.reason === "noTitle"
          ? "Upiši naziv albuma prije objave."
          : "Dodaj barem jednu fotografiju prije objave.";
      case "FEATURED_FULL":
        return "Naslovnica ima najviše 12 fotografija. Makni jednu pa dodaj novu.";
      case "ALBUM_FULL":
        return "Album može imati najviše 400 fotografija.";
      case "UNSUPPORTED_MEDIA":
      case "TOO_LARGE":
      case "DIMENSION_MISMATCH":
        return "Poslužitelj je odbio fotografiju. Pokušaj ponovno.";
      case "UNAUTHORIZED":
        return "Prijava je istekla. Prijavi se ponovno.";
      case "FORBIDDEN":
      case "ORIGIN":
        return "Ovaj račun nema pristup administraciji.";
      case "RATE_LIMITED":
        return e.text ?? "Previše zahtjeva. Pokušaj ponovno za minutu.";
    }
  }
  return "Nešto je pošlo po zlu. Pokušaj ponovno za minutu.";
}

/** auth-screen copy: the server's sentence when it has one */
export const authCopy = (e: unknown): string =>
  e instanceof ApiError && e.text && e.text !== e.code ? e.text : errorCopy(e);

interface Req {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  signal?: AbortSignal | undefined;
  /** automatic polls do not count as activity (the session still ends after 30 idle minutes) */
  background?: boolean;
  /** sign-in endpoints: a 401 is an answer, not an expired session */
  auth?: boolean;
}

function toError(status: number, body: unknown, auth: boolean): ApiError {
  const err = (body as ApiErrorBody | null)?.error as (ApiErrorBody["error"] & { reason?: string }) | undefined;
  if (status === 401 && !auth) signedOut(typeof err?.reason === "string" ? err.reason : null);
  return new ApiError(status, err?.code ?? "INTERNAL", err?.reason as PublishBlockReason | undefined, err?.message);
}

async function send<T>({ method, path, body, signal, background, auth = false }: Req): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const csrf = csrfToken();
  if (csrf && method !== "GET") headers["X-CSRF"] = csrf;
  if (background) headers["X-Background"] = "1";
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      credentials: "same-origin",
      cache: "no-store",
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {}),
    });
  } catch (e) {
    if (isAbort(e)) throw e;
    throw new ApiError(0, "INTERNAL");
  }
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON: an error page from the host */
  }
  if (!res.ok) throw toError(res.status, parsed, auth);
  return parsed as T;
}

/** multipart upload with progress (ARCHITECTURE §8.3) */
function upload(albumId: string, parts: UploadParts, onProgress: (f: number) => void, signal?: AbortSignal): Promise<Photo> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("meta", JSON.stringify(parts.meta));
    form.append("v2400", parts.v2400, "2400.webp");
    form.append("v1280", parts.v1280, "1280.webp");
    form.append("v640", parts.v640, "640.webp");
    xhr.open("POST", `${BASE}/albums/${albumId}/photos`);
    const csrf = csrfToken();
    if (csrf) xhr.setRequestHeader("X-CSRF", csrf);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.min(1, e.loaded / e.total));
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        /* host error page */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve(body as Photo);
      } else reject(toError(xhr.status, body, false));
    };
    xhr.onerror = () => reject(new ApiError(0, "INTERNAL"));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

export const api = {
  listAlbums: () => send<{ albums: AlbumCard[]; trash: AlbumCard[] }>({ method: "GET", path: "/albums" }),
  createAlbum: (category?: CategorySlug) =>
    send<Album>({ method: "POST", path: "/albums", body: category ? { category } : {} }),
  getAlbum: (id: string) => send<AlbumDetail>({ method: "GET", path: `/albums/${id}` }),
  updateAlbum: (id: string, patch: AlbumPatch, signal?: AbortSignal) =>
    send<Album>({ method: "PATCH", path: `/albums/${id}`, body: patch, signal }),
  deleteAlbum: (id: string) => send<null>({ method: "DELETE", path: `/albums/${id}` }),
  restoreAlbum: (id: string) => send<Album>({ method: "POST", path: `/albums/${id}/restore` }),
  uploadPhoto: (albumId: string, parts: UploadParts, onProgress: (f: number) => void, signal?: AbortSignal) =>
    upload(albumId, parts, onProgress, signal),
  reorderPhotos: (albumId: string, ids: string[]) => send<null>({ method: "PUT", path: `/albums/${albumId}/order`, body: { ids } }),
  updatePhoto: (id: string, patch: PhotoPatch) => send<Photo>({ method: "PATCH", path: `/photos/${id}`, body: patch }),
  deletePhoto: (id: string) => send<null>({ method: "DELETE", path: `/photos/${id}` }),
  restorePhoto: (id: string) => send<Photo>({ method: "POST", path: `/photos/${id}/restore` }),
  listFeatured: () => send<{ photos: FeaturedPhoto[] }>({ method: "GET", path: "/featured" }),
  reorderFeatured: (ids: string[]) => send<null>({ method: "PUT", path: "/featured/order", body: { ids } }),
};

// ---------------- sign-in, accounts, publishing ----------------
export interface AuthState {
  step: "in" | "2fa" | "setup-2fa" | null;
  name: string | null;
  role: Role | null;
  csrf: string | null;
  reason: string | null;
  firstSetup: boolean;
  codeRequired?: boolean;
}
export interface TwoFactorSetup {
  step: "setup-2fa";
  uri: string;
  key: string;
}
export interface SignedInAnswer {
  step: "in";
  name: string;
  role: Role;
  csrf: string;
  recoveryCodes?: string[];
  recoveryLeft?: number;
}
export interface UserRow {
  name: string;
  role: Role;
  state: string;
  lastLogin: string | null;
  recoveryLeft: number;
}
export interface PublishStatus {
  state: "unconfigured" | "ready" | "building" | "error";
  published: string | null;
  message: string | null;
  pending: boolean;
}
export interface PublishSettings {
  repo: string;
  branch: string;
  tokenSet: boolean;
  tokenExpires: string | null;
}

const authPost = <T>(path: string, body: unknown = {}) => send<T>({ method: "POST", path: `/auth${path}`, body, auth: true });

export const auth = {
  state: () => send<AuthState>({ method: "GET", path: "/auth/state", auth: true }),
  setup: (b: { code?: string; name: string; password: string }) => authPost<TwoFactorSetup>("/setup", b),
  checkInvite: (token: string) => authPost<{ name: string }>("/invite/check", { token }),
  acceptInvite: (token: string, password: string) => authPost<TwoFactorSetup>("/invite", { token, password }),
  confirm2fa: (code: string) => authPost<SignedInAnswer>("/2fa/confirm", { code }),
  login: (name: string, password: string) => authPost<{ step: "2fa" } | TwoFactorSetup>("/login", { name, password }),
  login2fa: (code: string) => authPost<SignedInAnswer>("/login/2fa", { code }),
  logout: () => authPost<{ ok: true }>("/logout"),
  changePassword: (old: string, next: string) => send<{ ok: true }>({ method: "POST", path: "/auth/password", body: { old, new: next } }),
};

export const accounts = {
  list: () => send<{ users: UserRow[] }>({ method: "GET", path: "/users" }),
  invite: (name: string, reset = false) => send<{ name: string; link: string }>({ method: "POST", path: "/users/invite", body: { name, reset } }),
  remove: (name: string) => send<{ ok: true }>({ method: "POST", path: "/users/remove", body: { name } }),
};

export const publishing = {
  status: (background = true) => send<PublishStatus>({ method: "GET", path: "/publish", background }),
  now: () => send<{ ok: true }>({ method: "POST", path: "/publish/now" }),
  settings: () => send<PublishSettings>({ method: "GET", path: "/publish/settings" }),
  saveSettings: (b: { repo: string; branch: string; token: string }) => send<PublishSettings>({ method: "POST", path: "/publish/settings", body: b }),
};
