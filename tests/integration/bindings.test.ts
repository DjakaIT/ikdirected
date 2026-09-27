import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("bindings smoke", () => {
  it("D1 answers SELECT 1", async () => {
    const row = await env.DB.prepare("SELECT 1 AS one").first<{ one: number }>();
    expect(row?.one).toBe(1);
  });

  it("R2 put/get round-trips bytes", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    await env.MEDIA.put("smoke/test.bin", bytes, { httpMetadata: { contentType: "application/octet-stream" } });
    const obj = await env.MEDIA.get("smoke/test.bin");
    expect(obj).not.toBeNull();
    expect(new Uint8Array(await obj!.arrayBuffer())).toEqual(bytes);
    expect(obj!.httpMetadata?.contentType).toBe("application/octet-stream");
    await env.MEDIA.delete("smoke/test.bin");
  });

  it("vars are bound", () => {
    expect(env.SITE_ORIGIN).toBe("http://localhost:4321");
  });
});
