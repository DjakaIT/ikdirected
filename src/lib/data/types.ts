import type { CategorySlug } from "../../content/site";

/** A photo as public pages render it. */
export interface PublicPhoto {
  id: string;
  /** Media key segment: the photo id in production, a placeholder id in mock mode. */
  mediaId: string;
  /** Dimensions of the 2400 variant. */
  width: number;
  height: number;
  alt: string;
  /** data:image/webp;base64,… (≤ 2000 chars) */
  lqip: string;
  /** Overrides the media base, for static placeholders served from the app origin. */
  base?: string;
}

export interface AlbumRef {
  slug: string;
  title: string;
  category: CategorySlug;
  place: string;
  /** YYYY-MM-DD */
  eventDate: string;
}

export interface AlbumCardData extends AlbumRef {
  id: string;
  photoCount: number;
  cover: PublicPhoto;
  /** Second photo, cross-faded in on hover (AC-ARC-05). */
  second: PublicPhoto | null;
}

export interface AlbumPageData extends AlbumCardData {
  story: string;
  photos: PublicPhoto[];
  /** ISO timestamp, sitemap lastmod. */
  updatedAt: string;
}

export interface TrackItem {
  photo: PublicPhoto;
  album: AlbumRef;
}

export interface HomeData {
  /** First track item, or null when nothing is published (static placeholder then). */
  hero: TrackItem | null;
  track: TrackItem[];
  publishedCount: number;
  /** Cover of the newest published album per category (PD-14). */
  categoryCovers: Partial<Record<CategorySlug, PublicPhoto>>;
}

export interface CategoryCounts {
  all: number;
  bySlug: Record<CategorySlug, number>;
  /** Oldest and newest event year among published albums, null when empty. */
  years: { from: number; to: number } | null;
}

export interface ArchivePageData {
  albums: AlbumCardData[];
  page: number;
  totalPages: number;
  total: number;
  /** Year span of the whole listing (not just this page), null when empty. */
  years: { from: number; to: number } | null;
}

export interface Neighbours {
  prev: AlbumCardData | null;
  next: AlbumCardData | null;
}
