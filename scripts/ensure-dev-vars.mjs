// Copies .dev.vars.example → .dev.vars when missing (TESTING §5). Never reads or prints .dev.vars.
import { copyFileSync, existsSync } from "node:fs";

if (!existsSync(".dev.vars")) {
  copyFileSync(".dev.vars.example", ".dev.vars");
  console.log("Created .dev.vars from .dev.vars.example");
}
