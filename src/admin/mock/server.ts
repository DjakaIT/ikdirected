// FRONT-END PHASE ONLY: an in-browser stand-in for /api/admin (ARCHITECTURE §6) so the admin UI
// can be built and tried before the backend exists. Same routes, status codes, error codes and
// business rules; state persists in localStorage. Replaced by real fetch/XHR calls in the backend
// phase — nothing outside src/admin/api.ts imports this module.
import { mockDb } from "../../lib/data/mock";
import placeholders from "../../lib/data/placeholders.json";
import {
  ALBUM_PHOTO_CAP,
  FEATURED_CAP,
  NEW_ALBUM_TITLE,
  type Album,
  type AlbumCard,
  type AlbumDetail,
  type ApiErrorBody,
  type ErrorCode,
  type FeaturedPhoto,
  type Photo,
  type PublishBlockReason,
  type UploadParts,
} from "../../lib/db/types";
import { uniqueSlug } from "../../lib/text/slug";

const KEY = "ik-admin-mock-v1";
/** Test hook: set to "PATCH", "PUT", "DELETE", "POST" or "UPLOAD" to fail the next such request once. */
export const FAIL_KEY = "ik-mock-fail";
const WEEK_MS = 7 * 24 * 3600 * 1000;
const CATEGORIES = ["vjencanja", "eventi", "portreti", "iz-zraka"] as const;

interface StoredPhoto extends Omit<Photo, "thumb"> {
  deleted_at: string | null;
  /** Placeholder standing in for the R2 objects. */
  media_id: string;
}
interface State {
  albums: Album[];
  photos: StoredPhoto[];
}

export interface MockResponse {
  status: number;
  body: unknown;
}

export interface MockRequest {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  upload?: UploadParts;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

// Session-only thumbnails for photos "uploaded" in this tab (object URLs of the real 640 variant).
const sessionThumbs = new Map<string, string>();

const now = (): string => new Date().toISOString();
const today = (): string => now().slice(0, 10);

function seed(): State {
  const albums: Album[] = mockDb.albums.map((a) => ({ ...a }));
  const photos: StoredPhoto[] = mockDb.photos.map((p) => ({
    id: p.id,
    album_id: p.album_id,
    position: p.position,
    width: p.width,
    height: p.height,
    alt: p.alt,
    lqip: p.lqip,
    featured: p.featured === 1,
    featured_position: p.featured_position,
    created_at: p.created_at,
    deleted_at: p.deleted_at,
    media_id: p.media_id,
  }));
  return { albums, photos };
}

let state: State | null = null;
function db(): State {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? (JSON.parse(raw) as State) : seed();
  } catch {
    state = seed();
  }
  return state;
}
function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(db()));
  } catch {
    /* quota or privacy mode: the session still works in memory */
  }
}

/** Resets the simulation to its seed (dev helper). */
export function resetMock(): void {
  state = seed();
  persist();
}

const thumbOf = (p: StoredPhoto): string =>
  sessionThumbs.get(p.id) ?? `/placeholder/p/${p.media_id}/640.webp`;

function toPhoto(p: StoredPhoto): Photo {
  const { deleted_at: _deleted, media_id: _media, ...rest } = p;
  return { ...rest, thumb: thumbOf(p) };
}

const livePhotos = (albumId: string): StoredPhoto[] =>
  db()
    .photos.filter((p) => p.album_id === albumId && p.deleted_at === null)
    .sort((a, b) => a.position - b.position);

function toCard(a: Album): AlbumCard {
  const photos = livePhotos(a.id);
  const cover = photos.find((p) => p.id === a.cover_photo_id) ?? photos[0] ?? null;
  return {
    id: a.id,
    slug: a.slug,
    title: a.title,
    category: a.category,
    status: a.status,
    event_date: a.event_date,
    photo_count: photos.length,
    cover: cover ? { id: cover.id, thumb: thumbOf(cover), lqip: cover.lqip, width: cover.width, height: cover.height } : null,
    updated_at: a.updated_at,
    deleted_at: a.deleted_at,
  };
}

const ok = (status: number, body: unknown = null): MockResponse => ({ status, body });
function fail(status: number, code: ErrorCode, reason?: PublishBlockReason): MockResponse {
  const body: ApiErrorBody = { error: { code, message: code, ...(reason ? { reason } : {}) } };
  return { status, body };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

function takeFailure(kind: string): boolean {
  try {
    if (localStorage.getItem(FAIL_KEY) === kind) {
      localStorage.removeItem(FAIL_KEY);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL = /[\u0000-\u0009\u000B-\u001F\u007F]/;

function validDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return false;
  const max = new Date();
  max.setUTCFullYear(max.getUTCFullYear() + 2);
  return s >= "2000-01-01" && d <= max;
}

const cleanLine = (s: string): string => s.trim().replace(/\s+/g, " ");

function album(id: string): Album | undefined {
  return db().albums.find((a) => a.id === id);
}

function touch(a: Album): void {
  a.updated_at = now();
}

function patchAlbum(a: Album, body: Record<string, unknown>): MockResponse {
  const allowed = new Set(["title", "category", "place", "event_date", "story", "status", "cover_photo_id"]);
  if (Object.keys(body).some((k) => !allowed.has(k))) return fail(400, "VALIDATION");
  const next = { ...a };
  if ("title" in body) {
    if (typeof body.title !== "string" || CONTROL.test(body.title)) return fail(400, "VALIDATION");
    const t = cleanLine(body.title);
    if (t.length < 1 || t.length > 120) return fail(400, "VALIDATION");
    next.title = t;
  }
  if ("category" in body) {
    if (!CATEGORIES.includes(body.category as (typeof CATEGORIES)[number])) return fail(400, "VALIDATION");
    next.category = body.category as Album["category"];
  }
  if ("place" in body) {
    if (typeof body.place !== "string" || CONTROL.test(body.place)) return fail(400, "VALIDATION");
    const p = cleanLine(body.place);
    if (p.length > 80) return fail(400, "VALIDATION");
    next.place = p;
  }
  if ("event_date" in body) {
    if (!validDate(body.event_date)) return fail(400, "VALIDATION");
    next.event_date = body.event_date;
  }
  if ("story" in body) {
    if (typeof body.story !== "string" || CONTROL.test(body.story)) return fail(400, "VALIDATION");
    const s = body.story.trim();
    if (s.length > 600) return fail(400, "VALIDATION");
    next.story = s;
  }
  if ("cover_photo_id" in body) {
    const pid = body.cover_photo_id;
    if (typeof pid !== "string" || !livePhotos(a.id).some((p) => p.id === pid)) return fail(400, "VALIDATION");
    next.cover_photo_id = pid;
  }
  if ("status" in body) {
    if (body.status !== "draft" && body.status !== "published") return fail(400, "VALIDATION");
    if (body.status === "published" && a.status !== "published") {
      if (livePhotos(a.id).length === 0) return fail(409, "PUBLISH_BLOCKED", "noPhotos");
      if (next.title === NEW_ALBUM_TITLE) return fail(409, "PUBLISH_BLOCKED", "noTitle");
      if (!next.slug) {
        const taken = new Set(db().albums.map((x) => x.slug).filter((s): s is string => !!s));
        next.slug = uniqueSlug(next.title, taken);
      }
      next.published_at = now();
    }
    next.status = body.status;
  }
  Object.assign(a, next);
  touch(a);
  persist();
  return ok(200, a);
}

function reassignCover(a: Album): void {
  if (a.cover_photo_id && livePhotos(a.id).some((p) => p.id === a.cover_photo_id)) return;
  a.cover_photo_id = livePhotos(a.id)[0]?.id ?? null;
}

function compactFeatured(): void {
  db()
    .photos.filter((p) => p.featured && p.deleted_at === null)
    .sort((a, b) => (a.featured_position ?? 0) - (b.featured_position ?? 0))
    .forEach((p, i) => (p.featured_position = i + 1));
}

async function upload(a: Album, parts: UploadParts, onProgress?: (f: number) => void, signal?: AbortSignal): Promise<MockResponse> {
  if (livePhotos(a.id).length >= ALBUM_PHOTO_CAP) return fail(409, "ALBUM_FULL");
  // Simulated network: progress in steps proportional to the payload size.
  const bytes = parts.v2400.size + parts.v1280.size + parts.v640.size;
  const steps = 8;
  const stepMs = Math.min(220, 60 + bytes / 40000);
  for (let i = 1; i <= steps; i++) {
    await sleep(stepMs, signal);
    onProgress?.(i / steps);
  }
  if (takeFailure("UPLOAD")) return fail(500, "INTERNAL");
  // Dev-only test hook (AC-UP-03 privacy test inspects the exact bytes that would reach R2).
  if (import.meta.env.DEV) (globalThis as { __ikLastUpload?: UploadParts }).__ikLastUpload = parts;
  const id = crypto.randomUUID();
  const position = Math.max(0, ...livePhotos(a.id).map((p) => p.position), ...db().photos.filter((p) => p.album_id === a.id).map((p) => p.position)) + 1;
  const media = placeholders[Math.abs(hash(id)) % placeholders.length]!;
  const photo: StoredPhoto = {
    id,
    album_id: a.id,
    position,
    width: parts.meta.w,
    height: parts.meta.h,
    alt: [a.title, a.place].filter(Boolean).join(", "), // AC-UP-07
    lqip: parts.meta.lqip,
    featured: false,
    featured_position: null,
    created_at: now(),
    deleted_at: null,
    media_id: media.id,
  };
  sessionThumbs.set(id, URL.createObjectURL(parts.v640));
  db().photos.push(photo);
  if (!a.cover_photo_id) a.cover_photo_id = id; // AC-ALBED-07
  touch(a);
  persist();
  return ok(201, toPhoto(photo));
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

export async function mockRequest(req: MockRequest): Promise<MockResponse> {
  if (!req.upload) await sleep(120 + Math.random() * 180, req.signal);
  if (!req.upload && takeFailure(req.method)) return fail(500, "INTERNAL");
  const { method, path } = req;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const seg = path.replace(/^\/api\/admin/, "").split("/").filter(Boolean);
  const id = seg[1];
  if ((seg[0] === "albums" || seg[0] === "photos") && id && !UUID.test(id)) return fail(400, "VALIDATION");

  // /albums
  if (seg[0] === "albums" && seg.length === 1) {
    if (method === "GET") {
      const live = db()
        .albums.filter((a) => !a.deleted_at)
        .sort((a, b) => b.event_date.localeCompare(a.event_date) || b.created_at.localeCompare(a.created_at));
      const cutoff = Date.now() - WEEK_MS;
      const trash = db()
        .albums.filter((a) => a.deleted_at && Date.parse(a.deleted_at) > cutoff)
        .sort((a, b) => (b.deleted_at ?? "").localeCompare(a.deleted_at ?? ""));
      return ok(200, { albums: live.map(toCard), trash: trash.map(toCard) });
    }
    if (method === "POST") {
      if (Object.keys(body).some((k) => k !== "category")) return fail(400, "VALIDATION");
      const category = body.category ?? "vjencanja";
      if (!CATEGORIES.includes(category as (typeof CATEGORIES)[number])) return fail(400, "VALIDATION");
      const stamp = now();
      const a: Album = {
        id: crypto.randomUUID(),
        slug: null,
        title: NEW_ALBUM_TITLE,
        category: category as Album["category"],
        place: "",
        event_date: today(),
        story: "",
        cover_photo_id: null,
        status: "draft",
        published_at: null,
        created_at: stamp,
        updated_at: stamp,
        deleted_at: null,
      };
      db().albums.push(a);
      persist();
      return ok(201, a);
    }
  }

  // /albums/:id…
  if (seg[0] === "albums" && id) {
    const a = album(id);
    const sub = seg[2];
    if (!sub) {
      if (!a || a.deleted_at) return fail(404, "NOT_FOUND");
      if (method === "GET") return ok(200, { ...a, photos: livePhotos(a.id).map(toPhoto) } satisfies AlbumDetail);
      if (method === "PATCH") return patchAlbum(a, body);
      if (method === "DELETE") {
        a.deleted_at = now();
        touch(a);
        persist();
        return ok(204);
      }
    }
    if (sub === "restore" && method === "POST") {
      if (!a) return fail(404, "NOT_FOUND");
      if (!a.deleted_at) return ok(200, a);
      if (Date.parse(a.deleted_at) < Date.now() - WEEK_MS) return fail(409, "CONFLICT");
      a.deleted_at = null;
      touch(a);
      persist();
      return ok(200, a);
    }
    if (sub === "photos" && method === "POST") {
      if (!a || a.deleted_at) return fail(404, "NOT_FOUND");
      if (!req.upload) return fail(400, "VALIDATION");
      return upload(a, req.upload, req.onProgress, req.signal);
    }
    if (sub === "order" && method === "PUT") {
      if (!a || a.deleted_at) return fail(404, "NOT_FOUND");
      const ids = body.ids;
      const live = livePhotos(a.id);
      if (!Array.isArray(ids) || ids.length !== live.length || new Set(ids).size !== ids.length) return fail(400, "VALIDATION");
      if (!ids.every((x) => live.some((p) => p.id === x))) return fail(400, "VALIDATION"); // SEC-IDOR-01
      const byId = new Map(live.map((p) => [p.id, p]));
      ids.forEach((pid, i) => (byId.get(pid as string)!.position = i + 1));
      // Deleted photos keep slots after the live ones so a restore never collides.
      db()
        .photos.filter((p) => p.album_id === a.id && p.deleted_at)
        .forEach((p, i) => (p.position = live.length + i + 1));
      touch(a);
      persist();
      return ok(204);
    }
  }

  // /photos/:id…
  if (seg[0] === "photos" && id) {
    const p = db().photos.find((x) => x.id === id);
    const a = p ? album(p.album_id) : undefined;
    const sub = seg[2];
    if (!sub) {
      if (!p || p.deleted_at || !a || a.deleted_at) return fail(404, "NOT_FOUND");
      if (method === "PATCH") {
        if (Object.keys(body).some((k) => k !== "alt" && k !== "featured")) return fail(400, "VALIDATION");
        if ("alt" in body) {
          if (typeof body.alt !== "string" || CONTROL.test(body.alt) || body.alt.trim().length > 200) return fail(400, "VALIDATION");
          p.alt = body.alt.trim();
        }
        if ("featured" in body) {
          if (typeof body.featured !== "boolean") return fail(400, "VALIDATION");
          if (body.featured && !p.featured) {
            const count = db().photos.filter((x) => x.featured && x.deleted_at === null).length;
            if (count >= FEATURED_CAP) return fail(409, "FEATURED_FULL");
            p.featured = true;
            p.featured_position = count + 1;
          } else if (!body.featured && p.featured) {
            p.featured = false;
            p.featured_position = null;
            compactFeatured();
          }
        }
        touch(a);
        persist();
        return ok(200, toPhoto(p));
      }
      if (method === "DELETE") {
        p.deleted_at = now();
        if (p.featured) {
          p.featured = false; // AC-DEL-03
          p.featured_position = null;
          compactFeatured();
        }
        reassignCover(a); // AC-DEL-03
        touch(a);
        persist();
        return ok(204);
      }
    }
    if (sub === "restore" && method === "POST") {
      if (!p || !a || a.deleted_at) return fail(404, "NOT_FOUND");
      if (p.deleted_at) {
        // Back to its original slot; photos at or after it shift right.
        for (const other of livePhotos(a.id)) if (other.position >= p.position) other.position++;
        p.deleted_at = null;
        if (!a.cover_photo_id) a.cover_photo_id = p.id;
        touch(a);
        persist();
      }
      return ok(200, toPhoto(p));
    }
  }

  // /featured
  if (seg[0] === "featured") {
    const featured = (): FeaturedPhoto[] =>
      db()
        .photos.filter((p) => p.featured && p.deleted_at === null)
        .map((p) => ({ p, a: album(p.album_id) }))
        .filter((x): x is { p: StoredPhoto; a: Album } => !!x.a && !x.a.deleted_at)
        .sort((x, y) => (x.p.featured_position ?? 0) - (y.p.featured_position ?? 0))
        .map(({ p, a }) => ({ ...toPhoto(p), album_title: a.title, album_status: a.status, album_slug: a.slug }));
    if (seg.length === 1 && method === "GET") return ok(200, { photos: featured() });
    if (seg[1] === "order" && method === "PUT") {
      const ids = body.ids;
      const current = featured();
      if (!Array.isArray(ids) || ids.length !== current.length || new Set(ids).size !== ids.length) return fail(400, "VALIDATION");
      if (!ids.every((x) => current.some((p) => p.id === x))) return fail(400, "VALIDATION");
      ids.forEach((pid, i) => {
        const row = db().photos.find((x) => x.id === pid)!;
        row.featured_position = i + 1;
      });
      persist();
      return ok(204);
    }
  }

  return fail(404, "NOT_FOUND");
}
