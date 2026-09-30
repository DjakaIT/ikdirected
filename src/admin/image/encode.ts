// Shared by the worker and the main-thread fallback (ARCHITECTURE §8.1 steps 2–4).
// Decoding with imageOrientation "from-image" applies EXIF rotation; drawing to a canvas and
// re-encoding drops every metadata chunk (EXIF, GPS, XMP) — the original never leaves the device.

export const TARGETS = [2400, 1280, 640] as const;
/** Server byte caps per variant (ARCHITECTURE §8.2). */
export const BYTE_CAPS: Record<(typeof TARGETS)[number], number> = { 2400: 2_000_000, 1280: 700_000, 640: 220_000 };
const START_Q: Record<(typeof TARGETS)[number], number> = { 2400: 0.86, 1280: 0.86, 640: 0.8 };
const LQIP_EDGE = 16;
const LQIP_MAX = 2000;

export type PipelineErrorKind = "decode" | "server";
export class PipelineError extends Error {
  constructor(readonly kind: PipelineErrorKind) {
    super(kind);
    this.name = "PipelineError";
  }
}

export interface Processed {
  v2400: Blob;
  v1280: Blob;
  v640: Blob;
  /** Dimensions of the 2400 variant. */
  w: number;
  h: number;
  lqip: string;
}

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
type Ctx2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

export interface CanvasFactory {
  create(w: number, h: number): AnyCanvas;
  toBlob(canvas: AnyCanvas, quality: number): Promise<Blob>;
}

/** Long edge `edge`, never upscaled. */
export function fit(w: number, h: number, edge: number): { w: number; h: number } {
  const long = Math.max(w, h);
  if (long <= edge) return { w, h };
  const k = edge / long;
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

function draw(factory: CanvasFactory, src: CanvasImageSource, w: number, h: number): AnyCanvas {
  const canvas = factory.create(w, h);
  const ctx = canvas.getContext("2d") as Ctx2D | null;
  if (!ctx) throw new PipelineError("decode");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, h);
  return canvas;
}

let wasmEncode: ((data: ImageData, opts: { quality: number }) => Promise<ArrayBuffer>) | null = null;

/** Older Safari returns PNG from a "image/webp" request — encode with WASM instead (admin only). */
async function encodeWebp(factory: CanvasFactory, canvas: AnyCanvas, quality: number): Promise<Blob> {
  const blob = await factory.toBlob(canvas, quality);
  if (blob.type === "image/webp") return blob;
  if (!wasmEncode) {
    const mod = await import("./webp-fallback");
    wasmEncode = mod.encodeWithWasm;
  }
  const ctx = canvas.getContext("2d") as Ctx2D;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const buf = await wasmEncode(data, { quality: Math.round(quality * 100) });
  return new Blob([buf], { type: "image/webp" });
}

async function variant(factory: CanvasFactory, bitmap: ImageBitmap, target: (typeof TARGETS)[number]): Promise<{ blob: Blob; w: number; h: number }> {
  const size = fit(bitmap.width, bitmap.height, target);
  const canvas = draw(factory, bitmap, size.w, size.h);
  let q = START_Q[target];
  for (let attempt = 0; attempt <= 3; attempt++) {
    const blob = await encodeWebp(factory, canvas, q);
    if (blob.size <= BYTE_CAPS[target]) return { blob, ...size };
    q -= 0.06;
  }
  throw new PipelineError("server");
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return `data:image/webp;base64,${btoa(bin)}`;
}

export async function processWith(factory: CanvasFactory, file: Blob): Promise<Processed> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new PipelineError("decode");
  }
  try {
    const [a, b, c] = [await variant(factory, bitmap, 2400), await variant(factory, bitmap, 1280), await variant(factory, bitmap, 640)];
    const tiny = fit(bitmap.width, bitmap.height, LQIP_EDGE);
    const lqipCanvas = draw(factory, bitmap, tiny.w, tiny.h);
    let lqip = await blobToDataUrl(await encodeWebp(factory, lqipCanvas, 0.5));
    if (lqip.length > LQIP_MAX) lqip = await blobToDataUrl(await encodeWebp(factory, lqipCanvas, 0.2));
    if (lqip.length > LQIP_MAX) throw new PipelineError("server");
    return { v2400: a.blob, v1280: b.blob, v640: c.blob, w: a.w, h: a.h, lqip };
  } finally {
    bitmap.close();
  }
}

export const offscreenFactory: CanvasFactory = {
  create: (w, h) => new OffscreenCanvas(w, h),
  toBlob: (canvas, quality) => (canvas as OffscreenCanvas).convertToBlob({ type: "image/webp", quality }),
};
