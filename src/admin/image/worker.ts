// Decode + resize + encode off the main thread when OffscreenCanvas exists (ARCHITECTURE §8.1).
import { offscreenFactory, PipelineError, processWith } from "./encode";

export interface WorkerRequest {
  id: number;
  file: Blob;
}
export type WorkerResponse =
  | { id: number; ok: true; result: Awaited<ReturnType<typeof processWith>> }
  | { id: number; ok: false; kind: "decode" | "server" };

self.addEventListener("message", async (e: MessageEvent<WorkerRequest>) => {
  const { id, file } = e.data;
  try {
    const result = await processWith(offscreenFactory, file);
    (self as unknown as Worker).postMessage({ id, ok: true, result } satisfies WorkerResponse);
  } catch (err) {
    const kind = err instanceof PipelineError ? err.kind : "decode";
    (self as unknown as Worker).postMessage({ id, ok: false, kind } satisfies WorkerResponse);
  }
});
