// Runs the real PHP admin API (api/index.php behind scripts/dev-router.php) for API tests: one PHP built-in server
// per test file on a free port, its own temp data/media folders, IK_TEST=1 (test seed route + namespaces).
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ROOT, phpCommand } from "../../scripts/php.mjs";

export const FIX = join(ROOT as string, "tests", "fixtures");
export const fixture = (name: string): Buffer => readFileSync(join(FIX, name));

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const a = s.address();
      s.close(() => (typeof a === "object" && a ? resolve(a.port) : reject(new Error("no port"))));
    });
  });
}

export interface PhpServer {
  base: string;
  data: string;
  media: string;
  stop: () => void;
}

export async function startPhp(extraEnv: Record<string, string> = {}): Promise<PhpServer> {
  const port = await freePort();
  const tmp = mkdtempSync(join(tmpdir(), "ik-php-"));
  const data = join(tmp, "podaci");
  const media = join(tmp, "media");
  const { bin, args } = phpCommand() as { bin: string; args: string[] };
  const child: ChildProcess = spawn(bin, [...args, "-S", `127.0.0.1:${port}`, join(ROOT as string, "scripts", "dev-router.php")], {
    stdio: "ignore",
    env: {
      ...process.env,
      IK_DIST: join(ROOT as string, "dist"),
      IK_MEDIA: media,
      IK_PODACI: data,
      IK_JAVNO: join(tmp, "javno"),
      IK_LOKALNO: "1",
      IK_TEST: "1",
      IK_OSVJEZI_MS: "0",
      ...extraEnv,
    },
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(`${base}/api/admin/auth/state`);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  return {
    base,
    data,
    media,
    stop: () => {
      child.kill();
      try {
        rmSync(tmp, { recursive: true, force: true });
      } catch {
        /* Windows may still hold a file for a moment */
      }
    },
  };
}

export interface Res<T = any> {
  status: number;
  body: T;
  headers: Headers;
}

/** A browser-like client: cookie jar, same-origin Origin header, X-CSRF once signed in. */
export class Client {
  cookies = new Map<string, string>();
  csrf: string | null = null;
  origin: string;
  readonly ns = randomUUID();

  constructor(readonly server: PhpServer) {
    this.origin = server.base;
    this.cookies.set("ik-test-ns", this.ns);
  }

  /** this client's data folder (namespace) on disk */
  get dataDir(): string {
    return join(this.server.data, "ns", this.ns);
  }
  get mediaDir(): string {
    return join(this.server.media, "ns", this.ns);
  }

  async req<T = any>(
    method: string,
    path: string,
    opts: { json?: unknown; form?: FormData; raw?: { body: BodyInit; type: string }; headers?: Record<string, string>; csrf?: boolean; origin?: string | null } = {},
  ): Promise<Res<T>> {
    const headers: Record<string, string> = { ...opts.headers };
    if (this.cookies.size) headers.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    if (method !== "GET" && method !== "HEAD" && opts.origin !== null) headers.Origin = opts.origin ?? this.origin;
    if (this.csrf && opts.csrf !== false) headers["X-CSRF"] = this.csrf;
    let body: BodyInit | undefined;
    if (opts.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.json);
    } else if (opts.form) body = opts.form;
    else if (opts.raw) {
      headers["Content-Type"] = opts.raw.type;
      body = opts.raw.body;
    }
    const res = await fetch(this.server.base + path, { method, headers, body, redirect: "manual" });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair!.indexOf("=");
      const k = pair!.slice(0, i);
      const v = pair!.slice(i + 1);
      if (v === "" || /Max-Age=0/i.test(c)) this.cookies.delete(k);
      else this.cookies.set(k, v);
    }
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* not JSON */
    }
    const out = { status: res.status, body: parsed as T, headers: res.headers };
    const csrf = (out.body as { csrf?: unknown } | null)?.csrf;
    if (typeof csrf === "string") this.csrf = csrf;
    return out;
  }

  /** fresh namespace, optional content state, signed in as admin "test" (unless user: false) */
  async seed(opts: { state?: unknown; user?: boolean } = {}): Promise<this> {
    const r = await this.req("POST", "/api/admin/__test/seed", { json: { ...(opts.state ? { state: opts.state } : {}), user: opts.user ?? true } });
    if (r.status !== 200) throw new Error(`seed failed: ${r.status} ${JSON.stringify(r.body)}`);
    return this;
  }
}

/** Same TOTP as api/lib/passwords.php (RFC 6238, SHA-1, 6 digits, 30 s). */
export async function totp(secretB32: string, stepOffset = 0): Promise<string> {
  const { createHmac } = await import("node:crypto");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secretB32.replace(/[^A-Z2-7]/g, "")) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const step = Math.floor(Date.now() / 30000) + stepOffset;
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", key).update(msg).digest();
  const o = h[19]! & 15;
  const n = ((h[o]! & 127) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(n % 1_000_000).padStart(6, "0");
}

export const TEST_TOTP = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
export const TEST_PASSWORD = "test-lozinka-dovoljno-duga";
