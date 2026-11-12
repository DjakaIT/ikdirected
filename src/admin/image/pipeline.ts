// Client image pipeline entry (ARCHITECTURE §8.1): early type/size checks, then processing in a
// Web Worker when OffscreenCanvas is available, else on the main thread.
import { PipelineError, processWith, type CanvasFactory, type Processed } from "./encode";
import type { WorkerRequest, WorkerResponse } from "./worker";

export { PipelineError, type Processed };

export const MAX_FILE_BYTES = 60 * 1024 * 1024;
export const MAX_BATCH = 200;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const ALLOWED_EXT = /\.(jpe?g|png|webp|heic|heif)$/i;

export type RejectKind = "type" | "size";

/** Step 1: reject by MIME (or extension, since HEIC often has an empty type) and size. */
export function precheck(file: File): RejectKind | null {
  const typeOk = file.type ? ALLOWED_TYPES.has(file.type) : ALLOWED_EXT.test(file.name);
  if (!typeOk) return "type";
  if (file.size > MAX_FILE_BYTES) return "size";
  return null;
}

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (p: Processed) => void; reject: (e: unknown) => void }>();

function getWorker(): Worker | null {
  if (typeof OffscreenCanvas === "undefined" || typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.addEventListener("message", (e: MessageEvent<WorkerResponse>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.result);
      else p.reject(new PipelineError(e.data.kind));
    });
    worker.addEventListener("error", () => {
      for (const p of pending.values()) p.reject(new PipelineError("decode"));
      pending.clear();
      worker = null;
    });
    return worker;
  } catch {
    return null;
  }
}

const domFactory: CanvasFactory = {
  create: (w, h) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  },
  toBlob: (canvas, quality) =>
    new Promise((resolve, reject) =>
      (canvas as HTMLCanvasElement).toBlob((b) => (b ? resolve(b) : reject(new PipelineError("decode"))), "image/webp", quality),
    ),
};

/** Steps 2–4 for one file. Processing concurrency is 1 — callers queue. */
export function processImage(file: File): Promise<Processed> {
  const w = getWorker();
  if (!w) return processWith(domFactory, file);
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    w.postMessage({ id, file } satisfies WorkerRequest);
  });
}
