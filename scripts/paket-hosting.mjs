// Hosting package (Hostinger: LiteSpeed/Apache + PHP) = the content of public_html. Model: CamelliaSinensis.
//   hosting/                 built site (dist/, with .htaccess) + the admin API + the photo route
//   hosting/api/             index.php, .htaccess, lib/*.php, konfiguracija.json (public address)
//   hosting/media/           index.php, .htaccess (serves the photos from ikdirected-podaci/media)
//   hosting/.ik-paket.json   build time, code commit and the content commit it was built from: the admin knows a
//                            publish is live when public_html holds the package of the content it sent
//   hosting.zip              the same in one file (for a manual upload, if ever needed)
// GitHub Actions (objava.yml) commits hosting/ to branch "hosting"; hPanel → Deploy from Git pulls that branch into
// public_html. Admin data and uploaded photos are NOT in the package: they live outside public_html
// (ikdirected-podaci/), so a deploy never touches them.
//   npm run build && npm run paket
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./php.mjs";
import { zipFolder } from "./zip.mjs";

const DIST = join(ROOT, "dist");
const OUT = join(ROOT, "hosting");
if (!existsSync(join(DIST, "index.html")) || !existsSync(join(DIST, ".htaccess"))) {
  console.error("No dist/ (with .htaccess) — run npm run build first.");
  process.exit(1);
}
const origin = (process.env.SITE_ORIGIN || "https://ikdirected.com").replace(/\/+$/, "");

rmSync(OUT, { recursive: true, force: true });
cpSync(DIST, OUT, { recursive: true });

const API = join(OUT, "api");
mkdirSync(join(API, "lib"), { recursive: true });
for (const f of ["index.php", ".htaccess"]) copyFileSync(join(ROOT, "api", f), join(API, f));
for (const f of readdirSync(join(ROOT, "api", "lib"))) if (f.endsWith(".php")) copyFileSync(join(ROOT, "api", "lib", f), join(API, "lib", f));
writeFileSync(join(API, "konfiguracija.json"), JSON.stringify({ origin }, null, 1) + "\n");

mkdirSync(join(OUT, "media"), { recursive: true });
for (const f of ["index.php", ".htaccess"]) copyFileSync(join(ROOT, "media", f), join(OUT, "media", f));

const manifest = {
  built: new Date().toISOString(),
  sha: process.env.GITHUB_SHA ?? null,
  content: process.env.IK_SADRZAJ_SHA || null,
  origin,
};
writeFileSync(join(OUT, ".ik-paket.json"), JSON.stringify(manifest, null, 1) + "\n");

const { data, count } = zipFolder(OUT);
writeFileSync(join(ROOT, "hosting.zip"), data);
console.log(`[paket] hosting/ and hosting.zip (${count} files, ${(data.length / 1024 / 1024).toFixed(1)} MB) for ${origin} — content of public_html`);
