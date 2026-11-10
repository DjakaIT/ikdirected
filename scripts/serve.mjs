// The built site exactly as on Hostinger: static dist/ + PHP admin API + uploaded media, behind
// scripts/dev-router.php (emulates the .htaccess files). Used by the e2e tests and `npm run preview`.
//   node scripts/serve.mjs [--port 4329] [--data .local] [--fresh]
// --fresh empties the data folder first (tests start from nothing). Data never lives in the repo.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { ROOT, phpCommand } from "./php.mjs";

const { values } = parseArgs({
  options: { port: { type: "string", default: "4329" }, data: { type: "string", default: ".local" }, fresh: { type: "boolean", default: false } },
});
const dist = join(ROOT, "dist");
if (!existsSync(join(dist, "index.html"))) {
  console.error("No dist/ — run npm run build first.");
  process.exit(1);
}
const data = resolve(ROOT, values.data);
if (values.fresh) rmSync(data, { recursive: true, force: true });
for (const d of ["podaci", "media"]) mkdirSync(join(data, d), { recursive: true });

const { bin, args } = phpCommand();
const child = spawn(bin, [...args, "-S", `127.0.0.1:${values.port}`, "-t", dist, join(ROOT, "scripts", "dev-router.php")], {
  stdio: "inherit",
  env: {
    ...process.env,
    IK_DIST: dist,
    IK_MEDIA: join(data, "media"),
    IK_PODACI: join(data, "podaci"),
    IK_JAVNO: dist,
    IK_LOKALNO: "1",
    PHP_CLI_SERVER_WORKERS: process.platform === "win32" ? "" : "4",
  },
});
const stop = () => child.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => process.exit(code ?? 0));
