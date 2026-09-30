// Typed admin API client (ARCHITECTURE §6). Screens only talk to this module.
// FRONT-END PHASE: requests are answered by the in-browser simulation in ./mock/server.ts.
// Backend phase: `send` becomes fetch (JSON) / XMLHttpRequest (multipart with progress) against
// /api/admin — the exported functions and their errors stay the same.
import { mockRequest, type MockRequest } from "./mock/server";
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

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    readonly reason?: PublishBlockReason,
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
      case "FORBIDDEN":
        return "Ovaj račun nema pristup administraciji.";
    }
  }
  return "Nešto je pošlo po zlu. Pokušaj ponovno za minutu.";
}

async function send<T>(req: MockRequest): Promise<T> {
  let res;
  try {
    res = await mockRequest(req);
  } catch (e) {
    if (isAbort(e)) throw e;
    throw new ApiError(0, "INTERNAL");
  }
  if (res.status >= 400) {
    const err = (res.body as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, err?.code ?? "INTERNAL", err?.reason);
  }
  return res.body as T;
}

export const api = {
  listAlbums: () => send<{ albums: AlbumCard[]; trash: AlbumCard[] }>({ method: "GET", path: "/albums" }),
  createAlbum: (category?: CategorySlug) =>
    send<Album>({ method: "POST", path: "/albums", body: category ? { category } : {} }),
  getAlbum: (id: string) => send<AlbumDetail>({ method: "GET", path: `/albums/${id}` }),
  updateAlbum: (id: string, patch: AlbumPatch, signal?: AbortSignal) =>
    send<Album>({ method: "PATCH", path: `/albums/${id}`, body: patch, ...(signal ? { signal } : {}) }),
  deleteAlbum: (id: string) => send<null>({ method: "DELETE", path: `/albums/${id}` }),
  restoreAlbum: (id: string) => send<Album>({ method: "POST", path: `/albums/${id}/restore` }),
  uploadPhoto: (albumId: string, parts: UploadParts, onProgress: (f: number) => void, signal?: AbortSignal) =>
    send<Photo>({
      method: "POST",
      path: `/albums/${albumId}/photos`,
      upload: parts,
      onProgress,
      ...(signal ? { signal } : {}),
    }),
  reorderPhotos: (albumId: string, ids: string[]) => send<null>({ method: "PUT", path: `/albums/${albumId}/order`, body: { ids } }),
  updatePhoto: (id: string, patch: PhotoPatch) => send<Photo>({ method: "PATCH", path: `/photos/${id}`, body: patch }),
  deletePhoto: (id: string) => send<null>({ method: "DELETE", path: `/photos/${id}` }),
  restorePhoto: (id: string) => send<Photo>({ method: "POST", path: `/photos/${id}/restore` }),
  listFeatured: () => send<{ photos: FeaturedPhoto[] }>({ method: "GET", path: "/featured" }),
  reorderFeatured: (ids: string[]) => send<null>({ method: "PUT", path: "/featured/order", body: { ids } }),
};
