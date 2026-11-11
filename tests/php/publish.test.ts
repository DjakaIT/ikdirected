// Publishing from the hosting (api/lib/publish.php) against a fake GitHub API: edit → export commit on the content
// branch → build request → the build commits branch hosting → hPanel Git deploys it (simulated here by writing
// public_html/.ik-paket.json) → the admin sees the publish as done only when that package names its content.
import { createServer, type Server } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, startPhp, type PhpServer } from "./harness";
import { published, state } from "./state";
import { parseExport } from "../../src/lib/data/source";

interface Run { id: number; display_title: string; status: string; conclusion: string | null; html_url: string }
const gh = { blobs: new Map<string, string>(), refs: new Map<string, string>(), commits: [] as Array<{ sha: string; tree: string; message: string }>,
  trees: new Map<string, Record<string, string>>(), runs: [] as Run[], dispatches: 0, auth: "", next: "success" };
let fake: Server;
let fakeBase = "";
let php: PhpServer;
let n = 0;
const sha = () => (++n).toString(16).padStart(40, "0");

beforeAll(async () => {
  fake = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      gh.auth = String(req.headers.authorization ?? "");
      const p = new URL(req.url!, fakeBase).pathname.replace(/^\/repos\/ik\/site/, "");
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
        gh.runs.unshift({ id: 1000 + gh.runs.length, display_title: `Objava ${b.client_payload.sha}`, status: "completed", conclusion: gh.next, html_url: "https://github.com/ik/site/actions/runs/1" });
        res.writeHead(204);
        return res.end();
      }
      if (req.method === "GET" && p === "/actions/runs") return json(200, { workflow_runs: gh.runs });
      json(404, { message: `fake: ${req.method} ${p}` });
    });
  });
  await new Promise<void>((r) => fake.listen(0, "127.0.0.1", () => r()));
  const a = fake.address();
  fakeBase = `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`;
  php = await startPhp({ IK_GITHUB_API: fakeBase });
});
afterAll(() => {
  php.stop();
  fake.close();
});

const TOKEN = "github_pat_" + "a".repeat(40);
const publicDir = () => join(php.data, "..", "javno");
/** what hPanel's Git deployment would put into public_html after the build of `content` */
function deploy(content: string | null): void {
  mkdirSync(publicDir(), { recursive: true });
  writeFileSync(join(publicDir(), ".ik-paket.json"), JSON.stringify({ built: new Date().toISOString(), sha: "c0de", content, origin: "https://ikdirected.com" }));
}
async function configured() {
  const { a, ps } = published(2);
  const c = await new Client(php).seed({ state: state([a], ps) });
  expect((await c.req("POST", "/api/admin/publish/settings", { json: { repo: "ik/site", token: TOKEN } })).status).toBe(200);
  return { c, a };
}
/** edit, publish now, and let the push (it runs after the answer) finish: the PHP test server handles one request at a time */
async function publishEdit(c: Client, albumId: string, place: string) {
  await c.req("PATCH", `/api/admin/albums/${albumId}`, { json: { place } });
  expect((await c.req("POST", "/api/admin/publish/now")).status).toBe(200);
  return c.req("GET", "/api/admin/publish");
}

describe("publish", () => {
  it("without GitHub settings the status is 'unconfigured' and the local export is still written", async () => {
    const { a, ps } = published(2);
    const c = await new Client(php).seed({ state: state([a], ps) });
    await c.req("PATCH", `/api/admin/albums/${a.id}`, { json: { place: "Nin" } });
    expect((await c.req("GET", "/api/admin/publish")).body).toMatchObject({ state: "unconfigured", pending: true });
    // cross-language contract: the static build accepts what PHP exports
    const parsed = parseExport(JSON.parse(readFileSync(join(c.dataDir, "izvoz.json"), "utf8")));
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

  it("settings are validated, the token never comes back, main and hosting are not content branches", async () => {
    const { a, ps } = published(1);
    const c = await new Client(php).seed({ state: state([a], ps) });
    expect((await c.req("POST", "/api/admin/publish/settings", { json: { repo: "ik/site", token: "nije-token" } })).status).toBe(422);
    for (const branch of ["main", "hosting"]) {
      expect((await c.req("POST", "/api/admin/publish/settings", { json: { repo: "ik/site", branch, token: TOKEN } })).status).toBe(422);
    }
    const ok = await c.req("POST", "/api/admin/publish/settings", { json: { repo: "ik/site", token: TOKEN } });
    expect(ok.body).toMatchObject({ repo: "ik/site", branch: "sadrzaj", tokenSet: true });
    expect(JSON.stringify(ok.body)).not.toContain("github_pat_");
    expect(JSON.stringify((await c.req("GET", "/api/admin/publish/settings")).body)).not.toContain("github_pat_");
  });

  it("change → 'Objavi sada' → one commit of the export + build request → done when hPanel deployed that content", async () => {
    deploy(null);
    const { c, a } = await configured();
    await c.req("PATCH", `/api/admin/albums/${a.id}`, { json: { title: "Ana i Marko" } });
    expect((await c.req("GET", "/api/admin/publish")).body).toMatchObject({ state: "ready", pending: true });
    const before = gh.dispatches;
    expect((await c.req("POST", "/api/admin/publish/now")).status).toBe(200);
    const building = await c.req("GET", "/api/admin/publish");
    expect(gh.dispatches).toBe(before + 1);
    expect(gh.auth).toBe(`Bearer ${TOKEN}`);
    expect(building.body).toMatchObject({ state: "building", pending: false, message: null });

    const commit = gh.commits.at(-1)!;
    const tree = gh.trees.get(commit.tree)!;
    expect(Object.keys(tree)).toEqual(["sadrzaj/sadrzaj.json"]); // only the export: never photos, drafts or accounts
    expect(JSON.parse(gh.blobs.get(tree["sadrzaj/sadrzaj.json"]!)!).albums[0].title).toBe("Ana i Marko");
    expect(gh.refs.get("sadrzaj")).toBe(commit.sha);

    // the build is done on GitHub, but the hosting still serves the old package: still publishing
    deploy("starija-verzija");
    expect((await c.req("GET", "/api/admin/publish")).body.state).toBe("building");
    // hPanel pulled branch hosting with the package of this content
    deploy(commit.sha);
    const done = await c.req("GET", "/api/admin/publish");
    expect(done.body).toMatchObject({ state: "ready", pending: false, message: null });
    expect(done.body.published).toMatch(/^\d{4}-/);
    expect((await c.req("GET", "/api/admin/publish/settings")).body.deployed.content).toBe(commit.sha);
  });

  it("a failed build is reported with the link to the run, and the next change can publish again", async () => {
    const { c, a } = await configured();
    gh.next = "failure";
    const st = await publishEdit(c, a.id, "Zadar");
    gh.next = "success";
    expect(st.body.state).toBe("error");
    expect(st.body.message).toContain("Izgradnja stranice nije uspjela: https://github.com/ik/site/actions/runs/1");
    const again = await publishEdit(c, a.id, "Nin");
    expect(again.body.state).toBe("building");
  });

  it("a build that hPanel never pulls turns into an error that names the Git deployment", async () => {
    const { c, a } = await configured();
    const st = await publishEdit(c, a.id, "Pag");
    expect(st.body.state).toBe("building");
    // pretend the build finished 16 minutes ago
    const file = join(c.dataDir, "objava.json");
    const s = JSON.parse(readFileSync(file, "utf8"));
    writeFileSync(file, JSON.stringify({ ...s, checked: 0, builtAt: Date.now() - 16 * 60_000 }));
    const late = await c.req("GET", "/api/admin/publish");
    expect(late.body.state).toBe("error");
    expect(late.body.message).toContain("Hostinger još nije preuzeo novu verziju");
  });

  it("the refresh route (Cron) answers without sign-in and never needs the browser", async () => {
    const { c } = await configured();
    const anon = new Client(php);
    anon.cookies.set("ik-test-ns", c.ns);
    expect((await anon.req("GET", "/api/admin/osvjezi")).body).toEqual({ state: "aktualno" });
  });
});
