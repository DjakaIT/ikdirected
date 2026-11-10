// Small content states for the API tests (store format of api/lib/store.php).
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FIX } from "./harness";

export const LQIP = readFileSync(join(FIX, "lqip.txt"), "utf8").trim();
export const iso = (msAgo = 0): string => new Date(Date.now() - msAgo).toISOString();
export const DAY = 24 * 3600 * 1000;

export interface AlbumRow {
  id: string;
  slug: string | null;
  title: string;
  category: string;
  place: string;
  event_date: string;
  story: string;
  cover_photo_id: string | null;
  status: "draft" | "published";
  published_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
export interface PhotoRow {
  id: string;
  album_id: string;
  position: number;
  width: number;
  height: number;
  alt: string;
  lqip: string;
  featured: boolean;
  featured_position: number | null;
  created_at: string;
  deleted_at: string | null;
}

export function album(over: Partial<AlbumRow> = {}): AlbumRow {
  return {
    id: randomUUID(), slug: null, title: "Testni album", category: "vjencanja", place: "Mjesto A", event_date: "2026-05-01", story: "",
    cover_photo_id: null, status: "draft", published_at: null, created_at: iso(), updated_at: iso(), deleted_at: null, ...over,
  };
}
export function photo(albumId: string, position: number, over: Partial<PhotoRow> = {}): PhotoRow {
  return {
    id: randomUUID(), album_id: albumId, position, width: 2400, height: 1600, alt: "", lqip: LQIP, featured: false, featured_position: null,
    created_at: iso(), deleted_at: null, ...over,
  };
}
export function state(albums: AlbumRow[], photos: PhotoRow[] = []) {
  return { format: 1, version: 1, updated_at: iso(), albums, photos };
}
/** one published album with n photos (first is the cover) */
export function published(n = 3, over: Partial<AlbumRow> = {}) {
  const a = album({ status: "published", slug: "testni-album", published_at: iso(), ...over });
  const ps = Array.from({ length: n }, (_, i) => photo(a.id, i + 1));
  a.cover_photo_id = ps[0]?.id ?? null;
  return { a, ps };
}
