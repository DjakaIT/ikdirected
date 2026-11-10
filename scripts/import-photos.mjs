// Replaces the synthetic placeholder scenes with real photographs. Scripts only — never imported by src/.
//   npm run photos:import            (reads ./photos)
//   npm run photos:import -- <dir>
// Put files named by slot in the folder: ph-01.jpg … ph-16.jpg (jpg/jpeg/png/webp/tif). Missing slots
// keep their current image, so a partial import is fine. Originals stay out of git (photos/ is ignored);
// only the generated WebP variants, the LQIP manifest and og-default.jpg are committed.
// Output per slot: public/placeholder/p/<id>/{640,1280,2400}.webp, EXIF orientation applied, all
// metadata (EXIF/GPS/XMP) stripped, never upscaled — same rules as the admin upload pipeline.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const SRC = resolve(ROOT, process.argv[2] ?? "photos");
const OUT = join(ROOT, "public", "placeholder", "p");
const MANIFEST = join(ROOT, "src", "lib", "data", "placeholders.json");
const VARIANTS = [
  { edge: 2400, quality: 82 },
  { edge: 1280, quality: 82 },
  { edge: 640, quality: 78 },
];
const EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"]);
const FORMATS = new Set(["jpeg", "png", "webp", "tiff"]); // decoded format, not the file name, decides

// Where each slot shows up (src/pages/index.astro, src/lib/data/placeholder.ts, mock.ts).
// "card fallback" = service card image while that category has no published album yet.
const ROLES = {
  "ph-01": "hero + share image (og-default.jpg) + track #1 + Vjenčanja card fallback",
  "ph-02": "Portreti card fallback + track #2",
  "ph-03": "Iz zraka card fallback + track #3",
  "ph-11": "Eventi card fallback + track #10",
  "ph-04": "track #6", "ph-05": "track #7", "ph-07": "track #5", "ph-08": "track #8",
  "ph-10": "track #9", "ph-12": "track #4", "ph-13": "track #11", "ph-16": "track #12",
  "ph-06": "albums only", "ph-09": "albums only", "ph-14": "albums only", "ph-15": "albums only",
};

if (!existsSync(SRC)) {
  console.error(`No folder ${SRC}. Create it and add files named ph-01.jpg … ph-16.jpg.`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const files = readdirSync(SRC);
for (const f of files) {
  if (extname(f).toLowerCase() === ".svg") console.warn(`skip ${f}: SVG is never accepted`);
}

const shape = (w, h) => (w / h > 1.15 ? "landscape" : w / h < 0.87 ? "portrait" : "square");
let done = 0;
let ogMaster;

for (const entry of manifest) {
  const file = files.find((f) => f.toLowerCase().startsWith(`${entry.id}.`) && EXT.has(extname(f).toLowerCase()));
  if (!file) continue;

  const input = readFileSync(join(SRC, file));
  const meta = await sharp(input).metadata();
  if (!meta.format || !FORMATS.has(meta.format)) {
    console.warn(`skip ${file}: decoded format "${meta.format}" is not an accepted photo format`);
    continue;
  }

  // Apply EXIF orientation once, cap the long edge at 2400, drop alpha. Output carries no metadata.
  const master = await sharp(input)
    .rotate()
    .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#000000" })
    .toColourspace("srgb")
    .png()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = master.info;
  const long = Math.max(w, h);

  const dir = join(OUT, entry.id);
  mkdirSync(dir, { recursive: true });
  for (const v of VARIANTS) {
    const edge = Math.min(v.edge, long);
    await sharp(master.data)
      .resize({ width: w >= h ? edge : undefined, height: h > w ? edge : undefined })
      .webp({ quality: v.quality })
      .toFile(join(dir, `${v.edge}.webp`));
  }
  const lqipBuf = await sharp(master.data)
    .resize({ width: w >= h ? 16 : undefined, height: h > w ? 16 : undefined })
    .webp({ quality: 50 })
    .toBuffer();
  const lqip = `data:image/webp;base64,${lqipBuf.toString("base64")}`;
  if (lqip.length > 2000) throw new Error(`${entry.id} LQIP too long (${lqip.length})`);

  const wanted = shape(entry.width, entry.height);
  const got = shape(w, h);
  const notes = [];
  if (got !== wanted) notes.push(`slot was ${wanted}, photo is ${got} (layout adapts)`);
  if (long < 1600) notes.push(`long edge ${long}px — soft on large screens, prefer the original file`);

  entry.width = w;
  entry.height = h;
  entry.lqip = lqip;
  entry.tone = "photo";
  if (entry.id === "ph-01") ogMaster = master.data;
  done++;
  console.log(`${entry.id} ← ${file}  ${w}×${h}  [${ROLES[entry.id] ?? ""}]${notes.length ? `\n      ! ${notes.join("; ")}` : ""}`);
}

if (done === 0) {
  console.error(`Nothing imported. Expected files named ph-01.jpg … ph-16.jpg in ${SRC}.`);
  process.exit(1);
}

writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
if (ogMaster) {
  await sharp(ogMaster)
    .resize(1200, 630, { fit: "cover", position: sharp.strategy.attention })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(join(ROOT, "public", "og-default.jpg"));
  console.log("og-default.jpg 1200×630 from ph-01");
}
const empty = manifest.filter((e) => e.tone !== "photo").map((e) => e.id);
console.log(`\n${done} imported. ${empty.length ? `Still synthetic: ${empty.join(", ")}` : "All 16 slots are real photos."}`);
