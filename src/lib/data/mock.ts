// Deterministic in-memory stand-in for D1 while the front-end is built (PROGRESS: front-end first).
// Shapes mirror ARCHITECTURE §3 rows. Titles and places are obviously fake on purpose — never
// realistic invented clients (ARCHITECTURE §14).
import type { CategorySlug } from "../../content/site";
import placeholders from "./placeholders.json";

export interface MockAlbumRow {
  id: string;
  slug: string | null;
  title: string;
  category: CategorySlug;
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

export interface MockPhotoRow {
  id: string;
  album_id: string;
  position: number;
  width: number;
  height: number;
  alt: string;
  lqip: string;
  featured: 0 | 1;
  featured_position: number | null;
  created_at: string;
  deleted_at: string | null;
  /** Mock only: which placeholder image stands in for the R2 objects. */
  media_id: string;
}

const PLACES = ["Mjesto A", "Mjesto B", "Mjesto C", "Mjesto D", "Mjesto E", "Mjesto F", "Mjesto G", "Mjesto H"];
const CATEGORY_CYCLE: CategorySlug[] = [
  "vjencanja", "eventi", "vjencanja", "portreti", "vjencanja", "iz-zraka", "eventi", "vjencanja",
  "portreti", "vjencanja", "eventi", "vjencanja", "iz-zraka", "vjencanja", "eventi",
];
const STORY =
  "Ovo je testni tekst priče albuma. Ovdje fotografkinja u dvije-tri rečenice opisuje dan, mjesto i atmosferu — kratko, bez nabrajanja.";

/** Deterministic UUID-shaped id so mock URLs are stable across reloads. */
function mockUuid(kind: number, n: number): string {
  const hex = (kind * 100000 + n).toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${hex}`;
}

function isoDay(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function build(): { albums: MockAlbumRow[]; photos: MockPhotoRow[] } {
  const albums: MockAlbumRow[] = [];
  const photos: MockPhotoRow[] = [];
  const total = 33; // 30 published, 2 drafts, 1 soft-deleted
  let photoSeq = 0;

  for (let n = 1; n <= total; n++) {
    const id = mockUuid(1, n);
    // Spread event dates from mid-2026 back to 2019, newest first by n.
    const monthsBack = Math.round((n - 1) * 2.6);
    const year = 2026 - Math.floor((monthsBack + 3) / 12);
    const month = 12 - ((monthsBack + 3) % 12);
    const day = 3 + ((n * 7) % 24);
    const category = CATEGORY_CYCLE[(n - 1) % CATEGORY_CYCLE.length] ?? "vjencanja";
    const status: MockAlbumRow["status"] = n === 4 || n === 17 ? "draft" : "published";
    const deleted = n === 9;
    const title = `Testni album ${n}`;
    const place = PLACES[(n * 3) % PLACES.length] ?? "Mjesto A";
    const stamp = `${isoDay(year, month, day)}T12:00:00.000Z`;
    const count = 6 + ((n * 11) % 38); // 6–43 photos

    const albumPhotos: MockPhotoRow[] = [];
    for (let p = 0; p < count; p++) {
      const ph = placeholders[(n * 5 + p * 3) % placeholders.length]!;
      photoSeq++;
      albumPhotos.push({
        id: mockUuid(2, photoSeq),
        album_id: id,
        position: p + 1,
        width: ph.width,
        height: ph.height,
        alt: `${title}, ${place}`,
        lqip: ph.lqip,
        featured: 0,
        featured_position: null,
        created_at: stamp,
        deleted_at: null,
        media_id: ph.id,
      });
    }
    photos.push(...albumPhotos);

    albums.push({
      id,
      slug: status === "published" ? `testni-album-${n}` : null,
      title,
      category,
      place,
      event_date: isoDay(year, month, day),
      story: n % 3 === 0 ? "" : STORY,
      cover_photo_id: albumPhotos[0]?.id ?? null,
      status,
      published_at: status === "published" ? stamp : null,
      created_at: stamp,
      updated_at: stamp,
      deleted_at: deleted ? stamp : null,
    });
  }

  // Feature 12 photos from published albums, alternating shapes like the reference track.
  const featurable = photos.filter((p) => {
    const a = albums.find((x) => x.id === p.album_id);
    return a?.status === "published" && !a.deleted_at;
  });
  const wanted = ["ph-01", "ph-02", "ph-03", "ph-12", "ph-07", "ph-04", "ph-05", "ph-08", "ph-10", "ph-11", "ph-13", "ph-16"];
  let pos = 0;
  const usedAlbums = new Set<string>();
  for (const mediaId of wanted) {
    const photo =
      featurable.find((p) => p.media_id === mediaId && !usedAlbums.has(p.album_id)) ??
      featurable.find((p) => p.media_id === mediaId && p.featured === 0);
    if (!photo) continue;
    usedAlbums.add(photo.album_id);
    photo.featured = 1;
    photo.featured_position = ++pos;
  }

  return { albums, photos };
}

export const mockDb = build();
