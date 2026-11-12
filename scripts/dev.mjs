// `npm run dev`: Astro dev server (public pages + admin, hot reload) on :4321 and the PHP admin API on
// :8787 (astro.config proxies /api and /media to it). Admin data lives in .local/ (git-ignored).
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT, phpCommand } from "./php.mjs";

const data = join(ROOT, ".local");
for (const d of ["podaci", "media"]) mkdirSync(join(data, d), { recursive: true });
const { bin, args } = phpCommand();
const env = { ...process.env, IK_DIST: join(ROOT, "public"), IK_MEDIA: join(data, "media"), IK_PODACI: join(data, "podaci"), IK_JAVNO: join(data, "javno"), IK_LOKALNO: "1" };
const php = spawn(bin, [...args, "-S", "127.0.0.1:8787", join(ROOT, "scripts", "dev-router.php")], { stdio: "inherit", env });
const astro = spawn(process.execPath, [join(ROOT, "node_modules", "astro", "bin", "astro.mjs"), "dev", ...process.argv.slice(2)], { stdio: "inherit", env: process.env });
const stop = () => { php.kill(); astro.kill(); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
astro.on("exit", (code) => { php.kill(); process.exit(code ?? 0); });
