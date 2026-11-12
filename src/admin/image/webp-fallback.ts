// Lazy-loaded only when the browser cannot encode WebP itself (ARCHITECTURE §8.1 step 3).
import encode from "@jsquash/webp/encode";

export async function encodeWithWasm(data: ImageData, opts: { quality: number }): Promise<ArrayBuffer> {
  return encode(data, { quality: opts.quality });
}
