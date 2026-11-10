// Hosting package (Hostinger: LiteSpeed/Apache + PHP) = the content of public_html. Model: CamelliaSinensis.
//   hosting/                 built site (dist/, with .htaccess and media/.htaccess) + the admin API in hosting/api/
//   hosting/api/             index.php, .htaccess, lib/*.php, konfiguracija.json (public address)
//   hosting/.ik-paket.json   list of every file: the next install removes what is gone (deleted albums)
//   hosting.zip              the same in one file (first time by hand: hPanel → File Manager → public_html → Upload → Extract)
// GitHub Actions keeps hosting/ as artifact "hosting"; the API on the hosting installs it (api/lib/install.php).
// Admin data and uploaded photos are NOT in the package: they live outside public_html (ikdirected-podaci/) and in
// public_html/media/, and an install never touches them.
//   npm run build && npm run paket      (.github/workflows/objava.yml does the same)
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./php.mjs";
import { filesOf, zipFolder } from "./zip.mjs";

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

const files = filesOf(OUT);
writeFileSync(
  join(OUT, ".ik-paket.json"),
  JSON.stringify({ built: new Date().toISOString(), sha: process.env.GITHUB_SHA ?? null, origin, files: [...files, ".ik-paket.json"].sort() }, null, 1) + "\n",
);
const { data, count } = zipFolder(OUT);
writeFileSync(join(ROOT, "hosting.zip"), data);
console.log(`[paket] hosting/ and hosting.zip (${count} files, ${(data.length / 1024 / 1024).toFixed(1)} MB) for ${origin} — content of public_html`);
