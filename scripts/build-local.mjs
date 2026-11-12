// Builds the public site from the local admin data (npm run dev writes .local/podaci/izvoz.json on every change),
// so `npm run preview` shows what would go live. Without that file: the demo content.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./php.mjs";

const file = join(ROOT, ".local", "podaci", "izvoz.json");
const env = { ...process.env, ...(existsSync(file) ? { IK_SADRZAJ: file } : {}) };
console.log(existsSync(file) ? `[build:local] content from ${file}` : "[build:local] no local export yet — demo content");
const r = spawnSync(process.execPath, [join(ROOT, "node_modules", "astro", "bin", "astro.mjs"), "build"], { stdio: "inherit", env });
process.exit(r.status ?? 1);
