// Admin API contract (ARCHITECTURE §6). Row shapes follow the D1 schema (§3); zod schemas in
// src/lib/validation/schemas.ts will become the single source once the backend lands (P2.3).
import type { CategorySlug } from "../../content/site";

export type AlbumStatus = "draft" | "published";

export interface Album {
  id: string;
  /** NULL until first publish, then frozen. */
  slug: string | null;
  title: string;
  category: CategorySlug;
  place: string;
  /** YYYY-MM-DD */
  event_date: string;
  story: string;
  cover_photo_id: string | null;
  status: AlbumStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Photo {
  id: string;
  album_id: string;
  position: number;
  /** Dimensions of the 2400 variant. */
  width: number;
  height: number;
  alt: string;
  lqip: string;
  featured: boolean;
  featured_position: number | null;
  created_at: string;
  /** 640 variant URL for admin thumbnails (built server-side from PUBLIC_MEDIA_BASE). */
  thumb: string;
}

export interface AlbumCard {
  id: string;
  slug: string | null;
  title: string;
  category: CategorySlug;
  status: AlbumStatus;
  event_date: string;
  photo_count: number;
  cover: Pick<Photo, "id" | "thumb" | "lqip" | "width" | "height"> | null;
  updated_at: string;
  deleted_at: string | null;
}

export interface AlbumDetail extends Album {
  photos: Photo[];
}

export interface FeaturedPhoto extends Photo {
  album_title: string;
  album_status: AlbumStatus;
  album_slug: string | null;
}

export type AlbumPatch = Partial<Pick<Album, "title" | "category" | "place" | "event_date" | "story" | "status" | "cover_photo_id">>;
export type PhotoPatch = Partial<{ alt: string; featured: boolean }>;

export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "ORIGIN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PUBLISH_BLOCKED"
  | "FEATURED_FULL"
  | "ALBUM_FULL"
  | "UNSUPPORTED_MEDIA"
  | "TOO_LARGE"
  | "DIMENSION_MISMATCH"
  | "RATE_LIMITED"
  | "INTERNAL";

/** Why a publish was refused (AC-ALBED-03). */
export type PublishBlockReason = "noPhotos" | "noTitle";

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; reason?: PublishBlockReason };
}

/** Multipart upload (ARCHITECTURE §8.3). */
export interface UploadParts {
  meta: { w: number; h: number; lqip: string };
  v2400: Blob;
  v1280: Blob;
  v640: Blob;
}

export const ALBUM_PHOTO_CAP = 400;
export const FEATURED_CAP = 12;
export const NEW_ALBUM_TITLE = "Novi album";
