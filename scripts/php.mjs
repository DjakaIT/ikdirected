// PHP binary for local runs and tests: $PHP_BIN, else the portable PHP in .tools/php (Windows, see
// docs/TESTING.md §3), else `php` on PATH (CI: ubuntu has PHP 8.3). Its php.ini enables the extensions
// Hostinger needs (gd with WebP, mbstring, curl, zip, intl, fileinfo).
import { existsSync } from "node:fs";
import { join } from "node:path";

export const ROOT = join(import.meta.dirname, "..");

export function phpCommand() {
  if (process.env.PHP_BIN) return { bin: process.env.PHP_BIN, args: [] };
  const portable = join(ROOT, ".tools", "php", process.platform === "win32" ? "php.exe" : "php");
  if (existsSync(portable)) return { bin: portable, args: ["-c", join(ROOT, ".tools", "php", "php.ini")] };
  return { bin: "php", args: [] };
}
