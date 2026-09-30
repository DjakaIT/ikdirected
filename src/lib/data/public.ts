// Public read API. Currently backed by the in-memory mock; the backend phase swaps the bodies for
// D1 queries (ARCHITECTURE §12) without changing these signatures. Every query here must only
// ever see published, non-deleted content (SECURITY T8).
import type { CategorySlug } from "../../content/site";
import { mockDb, type MockAlbumRow, type MockPhotoRow } from "./mock";
import type {
  AlbumCardData,
  AlbumPageData,
  ArchivePageData,
  CategoryCounts,
  HomeData,
  Neighbours,
  PublicPhoto,
  TrackItem,
} from "./types";

export const PER_PAGE = 24;
const TRACK_MAX = 12;
const TRACK_MIN = 4;
/** When fewer than TRACK_MIN photos are featured, fill with newest covers up to this many. */
const TRACK_FILL = 8;

/** Base URL for photo variants. Mock mode serves placeholders from /public. */
export function mediaBase(): string {
  return "/placeholder";
}

const isLive = (a: MockAlbumRow): boolean => a.status === "published" && a.deleted_at === null;

function toPhoto(row: MockPhotoRow): PublicPhoto {
  return { id: row.id, mediaId: row.media_id, width: row.width, height: row.height, alt: row.alt, lqip: row.lqip };
}

function livePhotos(albumId: string): MockPhotoRow[] {
  return mockDb.photos
    .filter((p) => p.album_id === albumId && p.deleted_at === null)
    .sort((a, b) => a.position - b.position);
}

function publishedAlbums(category?: CategorySlug): MockAlbumRow[] {
  return mockDb.albums
    .filter((a) => isLive(a) && (!category || a.category === category))
    .sort((a, b) => b.event_date.localeCompare(a.event_date) || b.created_at.localeCompare(a.created_at));
}

function toCard(a: MockAlbumRow): AlbumCardData | null {
  const photos = livePhotos(a.id);
  const cover = photos.find((p) => p.id === a.cover_photo_id) ?? photos[0];
  if (!cover || !a.slug) return null;
  const second = photos.find((p) => p.id !== cover.id) ?? null;
  return {
    id: a.id,
    slug: a.slug,
    title: a.title,
    category: a.category,
    place: a.place,
    eventDate: a.event_date,
    photoCount: photos.length,
    cover: toPhoto(cover),
    second: second ? toPhoto(second) : null,
  };
}

const cards = (rows: MockAlbumRow[]): AlbumCardData[] =>
  rows.map(toCard).filter((c): c is AlbumCardData => c !== null);

export async function getHomeData(): Promise<HomeData> {
  const live = new Map(mockDb.albums.filter(isLive).map((a) => [a.id, a]));
  const featured = mockDb.photos
    .filter((p) => p.featured === 1 && p.deleted_at === null && live.has(p.album_id))
    .sort((a, b) => (a.featured_position ?? 0) - (b.featured_position ?? 0))
    .slice(0, TRACK_MAX);

  const toItem = (p: MockPhotoRow): TrackItem => {
    const a = live.get(p.album_id)!;
    return {
      photo: toPhoto(p),
      album: { slug: a.slug!, title: a.title, category: a.category, place: a.place, eventDate: a.event_date },
    };
  };
  const track = featured.map(toItem);

  const published = cards(publishedAlbums());
  if (track.length < TRACK_MIN) {
    const used = new Set(track.map((t) => t.photo.id));
    for (const c of published) {
      if (track.length >= TRACK_FILL) break;
      if (used.has(c.cover.id)) continue;
      track.push({ photo: c.cover, album: c });
    }
  }

  const categoryCovers: HomeData["categoryCovers"] = {};
  for (const c of published) categoryCovers[c.category] ??= c.cover;

  return { hero: track[0] ?? null, track, publishedCount: published.length, categoryCovers };
}

export async function getCategoryCounts(): Promise<CategoryCounts> {
  const all = publishedAlbums();
  const bySlug: CategoryCounts["bySlug"] = { vjencanja: 0, eventi: 0, portreti: 0, "iz-zraka": 0 };
  for (const a of all) bySlug[a.category]++;
  const years = all.map((a) => Number(a.event_date.slice(0, 4)));
  return {
    all: all.length,
    bySlug,
    years: years.length ? { from: Math.min(...years), to: Math.max(...years) } : null,
  };
}

/** One archive page, newest first. Returns null for an out-of-range page (caller renders 404). */
export async function listAlbums(opts: { category?: CategorySlug | undefined; page: number }): Promise<ArchivePageData | null> {
  const all = cards(publishedAlbums(opts.category));
  const totalPages = Math.max(1, Math.ceil(all.length / PER_PAGE));
  if (!Number.isInteger(opts.page) || opts.page < 1 || opts.page > totalPages) return null;
  const start = (opts.page - 1) * PER_PAGE;
  return { albums: all.slice(start, start + PER_PAGE), page: opts.page, totalPages, total: all.length };
}

export async function getAlbumBySlug(slug: string): Promise<AlbumPageData | null> {
  const a = mockDb.albums.find((x) => x.slug === slug);
  if (!a || !isLive(a)) return null;
  const card = toCard(a);
  if (!card) return null;
  return { ...card, story: a.story, photos: livePhotos(a.id).map(toPhoto), updatedAt: a.updated_at };
}

/** Neighbours in archive order (newest first) within the same category. */
export async function getNeighbours(album: AlbumCardData): Promise<Neighbours> {
  const list = cards(publishedAlbums(album.category));
  const i = list.findIndex((c) => c.id === album.id);
  return { prev: i > 0 ? list[i - 1]! : null, next: i >= 0 && i < list.length - 1 ? list[i + 1]! : null };
}

/** Every published album for the sitemap. */
export async function listSitemapAlbums(): Promise<Array<{ slug: string; updatedAt: string }>> {
  return publishedAlbums()
    .filter((a) => a.slug)
    .map((a) => ({ slug: a.slug!, updatedAt: a.updated_at }));
}
