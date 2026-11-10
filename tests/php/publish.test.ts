// Publishing from the hosting (api/lib/publish.php + install.php) against a fake GitHub API: edit → export commit on
// the content branch → build request → finished build → package downloaded and installed into public_html; pages
// that are gone are removed, uploads in media/ are never touched.
import { createServer, type Server } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, startPhp, type PhpServer } from "./harness";
import { published, state } from "./state";
import { parseExport } from "../../src/lib/data/source";
import { zipEntries } from "../../scripts/zip.mjs";

interface Run { id: number; run_number: number; display_title: string; status: string; conclusion: string | null; event: string; head_branch: string; head_sha: string; path: string; head_repository: { full_name: string }; created_at: string; html_url: string }
const gh = { blobs: new Map<string, string>(), refs: new Map<string, string>(), commits: [] as Array<{ sha: string; tree: string; message: string }>, trees: new Map<string, Record<string, string>>(), runs: [] as Run[], dispatches: 0, pkg: Buffer.alloc(0), auth: "" };
let fake: Server;
let fakeBase = "";
let n = 0;
const sha = () => (++n).toString(16).padStart(40, "0");

beforeAll(async () => {
  fake = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      gh.auth = String(req.headers.authorization ?? "");
      const url = new URL(req.url!, fakeBase);
      const p = url.pathname.replace(/^\/repos\/ik\/site/, "");
      const json = (status: number, v: unknown) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(v)); };
      const b = body ? JSON.parse(body) : {};
      if (req.method === "GET" && p === "") return json(200, { full_name: "ik/site" });
      if (req.method === "GET" && p.startsWith("/git/ref/heads/")) {
        const r = gh.refs.get(p.slice("/git/ref/heads/".length));
        return r ? json(200, { object: { sha: r } }) : json(404, { message: "Not Found" });
      }
      if (req.method === "GET" && p.startsWith("/git/commits/")) return json(200, { tree: { sha: gh.commits.find((c) => c.sha === p.slice(13))?.tree } });
      if (req.method === "POST" && p === "/git/blobs") { const s = sha(); gh.blobs.set(s, b.content); return json(201, { sha: s }); }
      if (req.method === "POST" && p === "/git/trees") {
        const s = sha();
        gh.trees.set(s, { ...(b.base_tree ? gh.trees.get(b.base_tree) : {}), ...Object.fromEntries(b.tree.map((t: { path: string; sha: string }) => [t.path, t.sha])) });
        return json(201, { sha: s });
      }
      if (req.method === "POST" && p === "/git/commits") { const s = sha(); gh.commits.push({ sha: s, tree: b.tree, message: b.message }); return json(201, { sha: s }); }
      if (req.method === "POST" && p === "/git/refs") { gh.refs.set(b.ref.replace("refs/heads/", ""), b.sha); return json(201, {}); }
      if (req.method === "PATCH" && p.startsWith("/git/refs/heads/")) { gh.refs.set(p.slice(16), b.sha); return json(200, {}); }
      if (req.method === "POST" && p === "/dispatches") {
        gh.dispatches++;
        const id = 1000 + gh.runs.length;
        gh.runs.unshift({ id, run_number: gh.runs.length + 1, display_title: `Objava ${b.client_payload.sha}`, status: "completed", conclusion: "success",
          event: "repository_dispatch", head_branch: "main", head_sha: "c0de", path: ".github/workflows/objava.yml", head_repository: { full_name: "ik/site" },
          created_at: new Date().toISOString(), html_url: "https://github.com/ik/site/actions" });
        res.writeHead(204); return res.end();
      }
      if (req.method === "GET" && p === "/actions/runs") return json(200, { workflow_runs: gh.runs });
      const art = /^\/actions\/runs\/(\d+)\/artifacts$/.exec(p);
      if (req.method === "GET" && art) return json(200, { artifacts: [{ name: "hosting", expired: false, archive_download_url: `${fakeBase}/repos/ik/site/actions/artifacts/${art[1]}/zip` }] });
      if (req.method === "GET" && /^\/actions\/artifacts\/\d+\/zip$/.test(p)) { res.writeHead(302, { Location: `${fakeBase}/storage/paket.zip` }); return res.end(); }
      if (req.method === "GET" && url.pathname === "/storage/paket.zip") {
        if (req.headers.authorization) { res.writeHead(400); return res.end("token must not reach storage"); }
        res.writeHead(200, { "Content-Type": "application/zip" }); return res.end(gh.pkg);
      }
      json(404, { message: `fake: ${req.method} ${p}` });
    });
  });
  await new Promise<void>((r) => fake.listen(0, "127.0.0.1", () => r()));
  const a = fake.address();
  fakeBase = `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`;
  php = await startPhp({ IK_GITHUB_API: fakeBase });
});
let php: PhpServer;
afterAll(() => { php.stop(); fake.close(); });

const pkg = (files: Record<string, string>) =>
  zipEntries([...Object.entries(files), [".ik-paket.json", JSON.stringify({ files: [...Object.keys(files), ".ik-paket.json"] })]].map(([name, d]) => ({ name, data: Buffer.from(d) })));

describe("publish", () => {
  it("without GitHub settings the status is 'unconfigured' and the local export is still written", async () => {
    const { a, ps } = published(2);
    const c = await new Client(php).seed({ state: state([a], ps) });
    await c.req("PATCH", `/api/admin/albums/${a.id}`, { json: { place: "Nin" } });
    expect((await c.req("GET", "/api/admin/publish")).body).toMatchObject({ state: "unconfigured", pending: true });
    const exp = JSON.parse(readFileSync(join(c.dataDir, "izvoz.json"), "utf8"));
    // cross-language contract: the static build accepts what PHP exports
    const parsed = parseExport(exp);
    expect(parsed.albums.map((x) => x.place)).toEqual(["Nin"]);
    expect(parsed.photos).toHaveLength(2);
  });

  it("the export holds only published, live content; drafts and deleted photos stay on the hosting", async () => {
    const pub = published(3, { slug: "javni" });
    const draft = published(2, { slug: null, status: "draft", published_at: null, title: "Skica" });
    const gone = published(1, { slug: "obrisani", deleted_at: new Date().toISOString() });
    pub.ps[2]!.deleted_at = new Date().toISOString();
    pub.ps[1]!.featured = true;
    pub.ps[1]!.featured_position = 5;
    const c = await new Client(php).seed({ state: state([pub.a, draft.a, gone.a], [...pub.ps, ...draft.ps, ...gone.ps]) });
    await c.req("PATCH", `/api/admin/albums/${pub.a.id}`, { json: { story: "Priča" } });
    const exp = parseExport(JSON.parse(readFileSync(join(c.dataDir, "izvoz.json"), "utf8")));
    expect(exp.albums.map((x) => x.slug)).toEqual(["javni"]);
    expect(exp.photos.map((p) => p.id)).toEqual([pub.ps[0]!.id, pub.ps[1]!.id]);
    expect(exp.photos[1]!.featured_position).toBe(1);
  });

  it("settings → change → 'Objavi sada' → commit + build → finished build installed; stale pages removed, media kept", async () => {
    const { a, ps } = published(2);
    const c = await new Client(php).seed({ state: state([a], ps) });
    const bad = await c.req("POST", "/api/admin/publish/settings", { json: { repo: "ik/site", token: "nije-token" } });
    expect(bad.status).toBe(422);
    const ok = await c.req("POST", "/api/admin/publish/settings", { json: { repo: "ik/site", token: "github_pat_" + "a".repeat(40) } });
    expect(ok.body).toEqual({ repo: "ik/site", branch: "sadrzaj", tokenSet: true, tokenExpires: null });
    expect(JSON.stringify(ok.body)).not.toContain("github_pat_");

    // what is on the hosting before: an old album page listed by the previous package, and an uploaded photo
    const pub = join(php.data, "..", "javno");
    mkdirSync(join(pub, "radovi"), { recursive: true });
    mkdirSync(join(pub, "media", "p", ps[0]!.id), { recursive: true });
    writeFileSync(join(pub, "radovi", "stari-album.html"), "old");
    writeFileSync(join(pub, "media", "p", ps[0]!.id, "640.webp"), "photo");
    writeFileSync(join(pub, ".ik-paket.json"), JSON.stringify({ files: ["index.html", "radovi/stari-album.html", ".ik-paket.json"] }));
    gh.pkg = pkg({ "index.html": "<h1>nova</h1>", "radovi/testni-album.html": "album", ".htaccess": "# site", "media/.htaccess": "# media", "api/index.php": "<?php" });

    await c.req("PATCH", `/api/admin/albums/${a.id}`, { json: { title: "Ana i Marko" } });
    expect((await c.req("GET", "/api/admin/publish")).body).toMatchObject({ state: "ready", pending: true });
    expect((await c.req("POST", "/api/admin/publish/now")).status).toBe(200);
    // the push runs after that answer; the PHP test server handles one request at a time, so this waits for it
    const st = await c.req("GET", "/api/admin/publish");
    expect(gh.dispatches).toBe(1);
    const tree = gh.trees.get(gh.commits.at(-1)!.tree)!;
    expect(Object.keys(tree)).toEqual(["sadrzaj/sadrzaj.json"]);
    expect(JSON.parse(gh.blobs.get(tree["sadrzaj/sadrzaj.json"]!)!).albums[0].title).toBe("Ana i Marko");

    expect(st.body).toMatchObject({ state: "ready", pending: false, message: null });
    expect(st.body.published).toMatch(/^\d{4}-/);
    expect(readFileSync(join(pub, "index.html"), "utf8")).toBe("<h1>nova</h1>");
    expect(readFileSync(join(pub, "radovi", "testni-album.html"), "utf8")).toBe("album");
    expect(existsSync(join(pub, "radovi", "stari-album.html"))).toBe(false);
    expect(readFileSync(join(pub, "media", "p", ps[0]!.id, "640.webp"), "utf8")).toBe("photo");
    expect(readFileSync(join(pub, "media", ".htaccess"), "utf8")).toBe("# media");

    // the refresh route (postavi.yml) finds nothing newer
    expect((await c.req("GET", "/api/admin/osvjezi")).body).toEqual({ state: "aktualno" });
  });

  it("a package with a path escape or touching uploads is refused and nothing is installed", async () => {
    const { a, ps } = published(1);
    const c = await new Client(php).seed({ state: state([a], ps) });
    await c.req("POST", "/api/admin/publish/settings", { json: { repo: "ik/site", token: "github_pat_" + "b".repeat(40) } });
    for (const evil of ["../izvan.html", "media/p/x/640.webp"]) {
      gh.pkg = zipEntries([{ name: "index.html", data: Buffer.from("x") }, { name: evil, data: Buffer.from("x") }, { name: ".ik-paket.json", data: Buffer.from('{"files":[]}') }]);
      await c.req("PATCH", `/api/admin/albums/${a.id}`, { json: { place: evil } });
      await c.req("POST", "/api/admin/publish/now");
      const st = await c.req("GET", "/api/admin/publish");
      expect(st.body.state).toBe("error");
      expect(st.body.message).toContain("neispravno ime datoteke");
    }
  });
});
