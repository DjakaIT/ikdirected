export const VARIANTS = [640, 1280, 2400] as const;
export type Variant = (typeof VARIANTS)[number];

export interface MediaRef {
  mediaId: string;
  /** Dimensions of the 2400 variant. */
  width: number;
  height: number;
}

/** `${base}/p/${id}/${variant}.webp` — keys per ARCHITECTURE §9. */
export function mediaUrl(base: string, mediaId: string, variant: Variant): string {
  return `${base.replace(/\/+$/, "")}/p/${mediaId}/${variant}.webp`;
}

/** Intrinsic width of a variant: long edge is min(variant, stored long edge), never upscaled. */
export function variantWidth(photo: Pick<MediaRef, "width" | "height">, variant: Variant): number {
  const long = Math.max(photo.width, photo.height);
  const edge = Math.min(variant, long);
  return Math.round((photo.width * edge) / long);
}

/** srcset with real intrinsic widths, so portrait images are not over-fetched. */
export function srcset(base: string, photo: MediaRef): string {
  const seen = new Set<number>();
  return VARIANTS.map((v) => ({ v, w: variantWidth(photo, v) }))
    .filter(({ w }) => (seen.has(w) ? false : (seen.add(w), true)))
    .map(({ v, w }) => `${mediaUrl(base, photo.mediaId, v)} ${w}w`)
    .join(", ");
}
