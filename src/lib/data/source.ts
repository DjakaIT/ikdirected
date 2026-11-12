// Where public pages get their content at build time (the site is static HTML, ARCHITECTURE §1).
//  - IK_SADRZAJ=<path>  the public export written by the admin backend (api/lib/izvoz.php): CI build
//                       from the `sadrzaj` branch, or a local full-stack run (scripts/dev.mjs)
//  - otherwise          demo content (mock.ts) on the placeholder photos in /public/placeholder
// The export holds only published, non-deleted albums and their live photos (SECURITY T8); it is
// validated here so a malformed file fails the build instead of producing a broken site.
import { readFileSync } from "node:fs";
import { isCategorySlug, type CategorySlug } from "../../content/site";
import { mockDb } from "./mock";

export const EXPORT_FORMAT = 1;

export interface SourceAlbum {
  id: string;
  slug: string;
  title: string;
  category: CategorySlug;
  place: string;
  event_date: string;
  story: string;
  cover_photo_id: string | null;
  published_at: string;
  updated_at: string;
}

export interface SourcePhoto {
  id: string;
  album_id: string;
  position: number;
  width: number;
  height: number;
  alt: string;
  lqip: string;
  /** 1-based homepage position, null when not featured. */
  featured_position: number | null;
  /** Media key segment (photo id in real content, placeholder id in demo content). */
  media_id: string;
}

export interface Source {
  albums: SourceAlbum[];
  photos: SourcePhoto[];
  /** Base URL of the photo variants: /media (uploads) or /placeholder (demo). */
  mediaBase: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const int = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/** Validates the export written by the admin backend. Throws with every problem listed. */
export function parseExport(raw: unknown): Pick<Source, "albums" | "photos"> {
  const errors: string[] = [];
  const err = (where: string, what: string) => errors.push(`${where}: ${what}`);
  if (!isObj(raw)) throw new Error("content export: not an object");
  if (raw.format !== EXPORT_FORMAT) err("format", `expected ${EXPORT_FORMAT}`);
  const albumsIn = Array.isArray(raw.albums) ? raw.albums : (err("albums", "not a list"), []);
  const photosIn = Array.isArray(raw.photos) ? raw.photos : (err("photos", "not a list"), []);

  const albums: SourceAlbum[] = [];
  const slugs = new Set<string>();
  albumsIn.forEach((a: unknown, i) => {
    const w = `albums[${i}]`;
    if (!isObj(a)) return err(w, "not an object");
    if (typeof a.id !== "string" || !UUID.test(a.id)) err(`${w}.id`, "not a UUID");
    if (typeof a.slug !== "string" || !SLUG.test(a.slug) || a.slug.length > 80) err(`${w}.slug`, "invalid");
    else if (slugs.has(a.slug)) err(`${w}.slug`, "duplicate");
    else if (isCategorySlug(a.slug)) err(`${w}.slug`, "reserved (category)");
    else slugs.add(a.slug);
    if (!str(a.title, 120) || a.title.trim() === "") err(`${w}.title`, "invalid");
    if (typeof a.category !== "string" || !isCategorySlug(a.category)) err(`${w}.category`, "unknown");
    if (!str(a.place, 80)) err(`${w}.place`, "invalid");
    if (typeof a.event_date !== "string" || !DATE.test(a.event_date)) err(`${w}.event_date`, "invalid");
    if (!str(a.story, 600)) err(`${w}.story`, "invalid");
    if (!(a.cover_photo_id === null || (typeof a.cover_photo_id === "string" && UUID.test(a.cover_photo_id)))) err(`${w}.cover_photo_id`, "invalid");
    if (typeof a.published_at !== "string" || !ISO.test(a.published_at)) err(`${w}.published_at`, "invalid");
    if (typeof a.updated_at !== "string" || !ISO.test(a.updated_at)) err(`${w}.updated_at`, "invalid");
    albums.push(a as unknown as SourceAlbum);
  });

  const albumIds = new Set(albums.map((a) => a.id));
  const photoIds = new Set<string>();
  const photos: SourcePhoto[] = [];
  photosIn.forEach((p: unknown, i) => {
    const w = `photos[${i}]`;
    if (!isObj(p)) return err(w, "not an object");
    if (typeof p.id !== "string" || !UUID.test(p.id) || photoIds.has(p.id)) err(`${w}.id`, "invalid or duplicate");
    else photoIds.add(p.id);
    if (typeof p.album_id !== "string" || !albumIds.has(p.album_id)) err(`${w}.album_id`, "unknown album");
    if (!int(p.position, 1, 100000)) err(`${w}.position`, "invalid");
    if (!int(p.width, 1, 2400) || !int(p.height, 1, 2400)) err(`${w}.size`, "invalid");
    if (!str(p.alt, 200)) err(`${w}.alt`, "invalid");
    if (typeof p.lqip !== "string" || !p.lqip.startsWith("data:image/webp;base64,") || p.lqip.length > 2000) err(`${w}.lqip`, "invalid");
    if (!(p.featured_position === null || int(p.featured_position, 1, 12))) err(`${w}.featured_position`, "invalid");
    photos.push({ ...(p as unknown as Omit<SourcePhoto, "media_id">), media_id: p.id as string });
  });

  if (errors.length) throw new Error(`content export is invalid:\n  ${errors.slice(0, 20).join("\n  ")}`);
  return { albums, photos };
}

function demo(): Source {
  const live = mockDb.albums.filter((a) => a.status === "published" && a.deleted_at === null && a.slug);
  const ids = new Set(live.map((a) => a.id));
  return {
    albums: live.map((a) => ({
      id: a.id,
      slug: a.slug!,
      title: a.title,
      category: a.category,
      place: a.place,
      event_date: a.event_date,
      story: a.story,
      cover_photo_id: a.cover_photo_id,
      published_at: a.published_at!,
      updated_at: a.updated_at,
    })),
    photos: mockDb.photos
      .filter((p) => ids.has(p.album_id) && p.deleted_at === null)
      .map((p) => ({
        id: p.id,
        album_id: p.album_id,
        position: p.position,
        width: p.width,
        height: p.height,
        alt: p.alt,
        lqip: p.lqip,
        featured_position: p.featured === 1 ? p.featured_position : null,
        media_id: p.media_id,
      })),
    mediaBase: "/placeholder",
  };
}

let cached: Source | undefined;

export function source(): Source {
  if (cached) return cached;
  const file = process.env.IK_SADRZAJ;
  cached = file
    ? { ...parseExport(JSON.parse(readFileSync(file, "utf8"))), mediaBase: process.env.PUBLIC_MEDIA_BASE || "/media" }
    : demo();
  return cached;
}
