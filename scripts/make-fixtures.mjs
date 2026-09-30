// Generates committed image fixtures. Scripts only — never imported by src/.
//   node scripts/make-fixtures.mjs
// Part 1 (now): placeholder "photos" for the front-end (public/placeholder/p/<id>/{640,1280,2400}.webp),
// their LQIP manifest (src/lib/data/placeholders.json) and the default OG image.
// Part 2 (backend phase): upload attack/validation fixtures in tests/fixtures (TESTING §4).
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const OUT = join(ROOT, "public", "placeholder", "p");
const VARIANTS = [
  { edge: 2400, quality: 82 },
  { edge: 1280, quality: 82 },
  { edge: 640, quality: 78 },
];

/** Aspect ratio → dimensions of the 2400 variant (long edge 2400). */
function dims(ratioW, ratioH) {
  return ratioW >= ratioH
    ? { w: 2400, h: Math.round((2400 * ratioH) / ratioW) }
    : { w: Math.round((2400 * ratioW) / ratioH), h: 2400 };
}

const lin = (id, stops, x2 = 0, y2 = 1) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops
    .map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`)
    .join("")}</linearGradient>`;
const rad = (id, stops, cx = 0.5, cy = 0.5, r = 0.5) =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops
    .map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`)
    .join("")}</radialGradient>`;
const blur = (id, s) => `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${s}"/></filter>`;

/** Bokeh dots, deterministic. */
function bokeh(w, h, n, colors, seed) {
  let x = seed;
  const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  let out = "";
  for (let i = 0; i < n; i++) {
    const r = (0.02 + rnd() * 0.05) * Math.max(w, h);
    out += `<circle cx="${rnd() * w}" cy="${(0.15 + rnd() * 0.6) * h}" r="${r}" fill="${colors[i % colors.length]}" opacity="${0.25 + rnd() * 0.45}" filter="url(#b)"/>`;
  }
  return out;
}

// Scenes: abstract, photographic-feeling compositions. Mixed aspect ratios on purpose.
const SCENES = [
  { id: "ph-01", ratio: [3, 2], tone: "dusk-sea", svg: (w, h) =>
    `<defs>${lin("s", [[0, "#f1c7a0"], [0.45, "#8a6a7c"], [0.62, "#2a2d42"]])}${lin("sea", [[0, "#2b3a52"], [1, "#0b1017"]])}${rad("sun", [[0, "#ffe2b8", 0.95], [0.35, "#f6b58a", 0.5], [1, "#f6b58a", 0]], 0.68, 0.58, 0.32)}</defs>
     <rect width="${w}" height="${h}" fill="url(#s)"/><rect width="${w}" height="${h}" fill="url(#sun)"/>
     <rect y="${h * 0.62}" width="${w}" height="${h * 0.38}" fill="url(#sea)"/>
     <rect x="${w * 0.5}" y="${h * 0.62}" width="${w * 0.36}" height="${h * 0.006}" fill="#ffd9ae" opacity=".55"/>
     <path d="M0 ${h * 0.86} Q ${w * 0.3} ${h * 0.8} ${w * 0.52} ${h * 0.9} T ${w} ${h * 0.84} V ${h} H 0 Z" fill="#07090c" opacity=".85"/>` },
  { id: "ph-02", ratio: [4, 5], tone: "bw-portrait", svg: (w, h) =>
    `<defs>${rad("l", [[0, "#8d8d8d"], [0.55, "#2f2f2f"], [1, "#0e0e0e"]], 0.35, 0.3, 0.8)}${blur("b", 60)}</defs>
     <rect width="${w}" height="${h}" fill="url(#l)"/>
     <ellipse cx="${w * 0.55}" cy="${h * 0.36}" rx="${w * 0.16}" ry="${h * 0.14}" fill="#141414" filter="url(#b)"/>
     <path d="M${w * 0.18} ${h} C ${w * 0.25} ${h * 0.62} ${w * 0.85} ${h * 0.62} ${w * 0.92} ${h} Z" fill="#101010" filter="url(#b)"/>` },
  { id: "ph-03", ratio: [16, 10], tone: "aerial-bay", svg: (w, h) =>
    `<defs>${lin("w", [[0, "#0a3552"], [0.5, "#1f7f93"], [1, "#56c2c4"]], 1, 0.4)}${blur("b", 30)}</defs>
     <rect width="${w}" height="${h}" fill="url(#w)"/>
     <path d="M${w * 0.55} 0 C ${w * 0.62} ${h * 0.4} ${w * 0.52} ${h * 0.7} ${w * 0.72} ${h} H ${w} V 0 Z" fill="#e6d5ad" filter="url(#b)"/>
     <path d="M${w * 0.62} 0 C ${w * 0.7} ${h * 0.35} ${w * 0.62} ${h * 0.72} ${w * 0.8} ${h} H ${w} V 0 Z" fill="#6f7d4a" filter="url(#b)"/>` },
  { id: "ph-04", ratio: [3, 2], tone: "golden-field", svg: (w, h) =>
    `<defs>${lin("s", [[0, "#f6dcaa"], [0.5, "#e2a45c"], [1, "#6b3b16"]])}${rad("g", [[0, "#fff1cf", 0.9], [1, "#fff1cf", 0]], 0.25, 0.42, 0.35)}${blur("b", 30)}</defs>
     <rect width="${w}" height="${h}" fill="url(#s)"/><rect width="${w}" height="${h}" fill="url(#g)"/>
     <path d="M0 ${h * 0.58} Q ${w * 0.5} ${h * 0.52} ${w} ${h * 0.6} V ${h} H 0 Z" fill="#8a5323" opacity=".75" filter="url(#b)"/>
     <ellipse cx="${w * 0.64}" cy="${h * 0.6}" rx="${w * 0.05}" ry="${h * 0.2}" fill="#2a170b" opacity=".8" filter="url(#b)"/>
     <ellipse cx="${w * 0.7}" cy="${h * 0.62}" rx="${w * 0.045}" ry="${h * 0.18}" fill="#2a170b" opacity=".75" filter="url(#b)"/>` },
  { id: "ph-05", ratio: [2, 3], tone: "night-bokeh", svg: (w, h) =>
    `<defs>${lin("s", [[0, "#0d1320"], [1, "#221a2b"]])}${blur("b", 22)}</defs>
     <rect width="${w}" height="${h}" fill="url(#s)"/>${bokeh(w, h, 26, ["#ffcf8a", "#f59e6b", "#fff0d0", "#9fb8ff"], 7)}` },
  { id: "ph-06", ratio: [1, 1], tone: "stone", svg: (w, h) =>
    `<defs>${lin("s", [[0, "#b9a992"], [1, "#6d6255"]], 1, 1)}${rad("l", [[0, "#fff6e6", 0.5], [1, "#fff6e6", 0]], 0.3, 0.2, 0.7)}</defs>
     <rect width="${w}" height="${h}" fill="url(#s)"/><rect width="${w}" height="${h}" fill="url(#l)"/>
     ${Array.from({ length: 7 }, (_, i) => `<rect y="${(i + 1) * h / 8}" width="${w}" height="${h * 0.004}" fill="#4f463c" opacity=".35"/>`).join("")}` },
  { id: "ph-07", ratio: [4, 5], tone: "bw-dance", svg: (w, h) =>
    `<defs>${rad("l", [[0, "#d9d9d9"], [0.4, "#555"], [1, "#080808"]], 0.5, 0.25, 0.75)}${blur("b", 50)}</defs>
     <rect width="${w}" height="${h}" fill="url(#l)"/>
     <ellipse cx="${w * 0.45}" cy="${h * 0.6}" rx="${w * 0.12}" ry="${h * 0.3}" fill="#0c0c0c" filter="url(#b)"/>
     <ellipse cx="${w * 0.58}" cy="${h * 0.6}" rx="${w * 0.11}" ry="${h * 0.29}" fill="#1c1c1c" filter="url(#b)"/>` },
  { id: "ph-08", ratio: [16, 9], tone: "coast-aerial", svg: (w, h) =>
    `<defs>${lin("w", [[0, "#06243a"], [1, "#2a8aa0"]], 1, 0)}${blur("b", 26)}</defs>
     <rect width="${w}" height="${h}" fill="url(#w)"/>
     <path d="M0 ${h * 0.7} C ${w * 0.2} ${h * 0.5} ${w * 0.45} ${h * 0.85} ${w * 0.7} ${h * 0.55} S ${w} ${h * 0.35} ${w} ${h * 0.3} V ${h} H 0 Z" fill="#c9b98f" filter="url(#b)"/>
     <path d="M0 ${h * 0.78} C ${w * 0.2} ${h * 0.6} ${w * 0.45} ${h * 0.93} ${w * 0.7} ${h * 0.63} S ${w} ${h * 0.43} ${w} ${h * 0.38} V ${h} H 0 Z" fill="#4c5a37" filter="url(#b)"/>` },
  { id: "ph-09", ratio: [3, 4], tone: "forest", svg: (w, h) =>
    `<defs>${lin("s", [[0, "#c9d6b0"], [0.4, "#4f6b3f"], [1, "#16200f"]])}${blur("b", 20)}</defs>
     <rect width="${w}" height="${h}" fill="url(#s)"/>
     ${Array.from({ length: 6 }, (_, i) => `<rect x="${w * (0.08 + i * 0.16)}" y="0" width="${w * 0.035}" height="${h}" fill="#10170b" opacity=".6" filter="url(#b)"/>`).join("")}` },
  { id: "ph-10", ratio: [4, 5], tone: "snow", svg: (w, h) =>
    `<defs>${lin("s", [[0, "#dfe6ee"], [0.6, "#b4c0cc"], [1, "#eef2f5"]])}${blur("b", 45)}</defs>
     <rect width="${w}" height="${h}" fill="url(#s)"/>
     <path d="M0 ${h * 0.55} L ${w * 0.35} ${h * 0.3} L ${w * 0.6} ${h * 0.48} L ${w} ${h * 0.25} V ${h * 0.7} H 0 Z" fill="#8795a3" opacity=".6" filter="url(#b)"/>
     <ellipse cx="${w * 0.5}" cy="${h * 0.72}" rx="${w * 0.09}" ry="${h * 0.2}" fill="#3a2f33" opacity=".85" filter="url(#b)"/>` },
  { id: "ph-11", ratio: [3, 2], tone: "candle-warm", svg: (w, h) =>
    `<defs>${lin("s", [[0, "#2a160c"], [1, "#6e3a18"]], 1, 1)}${blur("b", 28)}</defs>
     <rect width="${w}" height="${h}" fill="url(#s)"/>${bokeh(w, h, 22, ["#ffb866", "#ffd9a0", "#e8894a"], 13)}` },
  { id: "ph-12", ratio: [3, 2], tone: "pink-pier", svg: (w, h) =>
    `<defs>${lin("s", [[0, "#f3b7a6"], [0.55, "#c9798a"], [0.56, "#6f4e68"], [1, "#2b2236"]])}</defs>
     <rect width="${w}" height="${h}" fill="url(#s)"/>
     <rect x="${w * 0.1}" y="${h * 0.6}" width="${w * 0.8}" height="${h * 0.02}" fill="#1a1320"/>
     ${Array.from({ length: 9 }, (_, i) => `<rect x="${w * (0.12 + i * 0.095)}" y="${h * 0.6}" width="${w * 0.008}" height="${h * 0.12}" fill="#1a1320"/>`).join("")}` },
  { id: "ph-13", ratio: [2, 3], tone: "lavender", svg: (w, h) =>
    `<defs>${lin("s", [[0, "#e9dcf0"], [0.45, "#9b86b8"], [1, "#3b2d52"]])}${blur("b", 16)}</defs>
     <rect width="${w}" height="${h}" fill="url(#s)"/>
     ${Array.from({ length: 8 }, (_, i) => `<path d="M${w * (i / 7)} ${h} L ${w * 0.5} ${h * 0.48}" stroke="#5b4580" stroke-width="${w * 0.03}" opacity=".45" filter="url(#b)"/>`).join("")}` },
  { id: "ph-14", ratio: [3, 2], tone: "old-town", svg: (w, h) =>
    `<defs>${lin("s", [[0, "#e7d7bd"], [1, "#a8744c"]], 0, 1)}${blur("b", 10)}</defs>
     <rect width="${w}" height="${h}" fill="url(#s)"/>
     <rect x="${w * 0.08}" y="${h * 0.25}" width="${w * 0.22}" height="${h * 0.75}" fill="#c99b6c" filter="url(#b)"/>
     <rect x="${w * 0.36}" y="${h * 0.12}" width="${w * 0.14}" height="${h * 0.88}" fill="#8c5d3b" filter="url(#b)"/>
     <rect x="${w * 0.58}" y="${h * 0.3}" width="${w * 0.3}" height="${h * 0.7}" fill="#b98457" filter="url(#b)"/>` },
  { id: "ph-15", ratio: [16, 10], tone: "bw-architecture", svg: (w, h) =>
    `<defs>${lin("s", [[0, "#1b1b1b"], [1, "#9a9a9a"]], 1, 0.2)}</defs>
     <rect width="${w}" height="${h}" fill="url(#s)"/>
     <path d="M0 ${h} L ${w * 0.45} 0 L ${w * 0.55} 0 L ${w * 0.3} ${h} Z" fill="#e8e8e8" opacity=".35"/>
     <path d="M${w * 0.6} ${h} L ${w} ${h * 0.2} V ${h} Z" fill="#0c0c0c" opacity=".6"/>` },
  { id: "ph-16", ratio: [3, 2], tone: "storm-sea", svg: (w, h) =>
    `<defs>${lin("s", [[0, "#6f7d8a"], [0.5, "#3d4a57"], [0.51, "#243240"], [1, "#0f161d"]])}${blur("b", 30)}</defs>
     <rect width="${w}" height="${h}" fill="url(#s)"/>
     <ellipse cx="${w * 0.3}" cy="${h * 0.2}" rx="${w * 0.35}" ry="${h * 0.12}" fill="#98a4ae" opacity=".5" filter="url(#b)"/>` },
];

async function renderScene(scene) {
  const { w, h } = dims(scene.ratio[0], scene.ratio[1]);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${scene.svg(w, h)}</svg>`;
  const base = sharp(Buffer.from(svg)).removeAlpha();
  const master = await base.png().toBuffer();
  const dir = join(OUT, scene.id);
  mkdirSync(dir, { recursive: true });
  for (const v of VARIANTS) {
    await sharp(master)
      .resize({ width: w >= h ? v.edge : undefined, height: h > w ? v.edge : undefined })
      .webp({ quality: v.quality })
      .toFile(join(dir, `${v.edge}.webp`));
  }
  const lqipBuf = await sharp(master)
    .resize({ width: w >= h ? 16 : undefined, height: h > w ? 16 : undefined })
    .webp({ quality: 50 })
    .toBuffer();
  const lqip = `data:image/webp;base64,${lqipBuf.toString("base64")}`;
  if (lqip.length > 2000) throw new Error(`${scene.id} LQIP too long (${lqip.length})`);
  return { id: scene.id, width: w, height: h, lqip, tone: scene.tone, master };
}

// WebP output is not byte-stable across runs, so committed placeholders are rebuilt only on --force.
const FORCE = process.argv.includes("--force");
const havePlaceholders = existsSync(join(OUT, SCENES[SCENES.length - 1].id, "640.webp"));
if (havePlaceholders && !FORCE) {
  console.log("placeholders exist — skipped (use --force to rebuild)");
} else {
  const manifest = [];
  let ogSource;
  for (const scene of SCENES) {
    const r = await renderScene(scene);
    if (scene.id === "ph-01") ogSource = r.master;
    manifest.push({ id: r.id, width: r.width, height: r.height, lqip: r.lqip, tone: r.tone });
    console.log(`placeholder ${r.id} ${r.width}x${r.height}`);
  }
  mkdirSync(join(ROOT, "src", "lib", "data"), { recursive: true });
  writeFileSync(join(ROOT, "src", "lib", "data", "placeholders.json"), JSON.stringify(manifest, null, 2) + "\n");
  await sharp(ogSource).resize(1200, 630, { fit: "cover" }).jpeg({ quality: 82, mozjpeg: true }).toFile(join(ROOT, "public", "og-default.jpg"));
  console.log("og-default.jpg 1200x630");
}

// ── Part 2a: upload fixtures for the admin e2e tests (TESTING §4) ─────────────────────────────
const FIX = join(ROOT, "tests", "fixtures");
mkdirSync(FIX, { recursive: true });

// Real camera-like JPEG: 3000×2000 stored, EXIF Orientation=6 (display portrait) and GPS
// coordinates. libvips maps IFD3 to the GPS IFD. The privacy test proves both are gone after
// the in-browser re-encode and that the orientation was applied.
const cameraSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="2000"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9a066"/><stop offset="1" stop-color="#2d3b55"/></linearGradient></defs><rect width="3000" height="2000" fill="url(#g)"/><rect x="0" y="0" width="600" height="2000" fill="#b33"/></svg>`;
await sharp(Buffer.from(cameraSvg))
  .jpeg({ quality: 85 })
  .withMetadata({ orientation: 6 })
  .withExifMerge({
    IFD0: { Make: "Fixture", Model: "GPS Test Camera" },
    IFD3: {
      GPSLatitudeRef: "N",
      GPSLatitude: "44/1 7/1 1000/100",
      GPSLongitudeRef: "E",
      GPSLongitude: "15/1 13/1 5000/100",
    },
  })
  .toFile(join(FIX, "camera-gps-3000x2000.jpg"));
console.log("fixture camera-gps-3000x2000.jpg");

// Small ordinary inputs for fast upload flows.
await sharp(Buffer.from(SCENES[0].svg(1200, 800).replace(/^/, `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">`) + "</svg>"))
  .jpeg({ quality: 80 })
  .toFile(join(FIX, "upload-landscape.jpg"));
await sharp(Buffer.from(SCENES[1].svg(800, 1000).replace(/^/, `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000">`) + "</svg>"))
  .png()
  .toFile(join(FIX, "upload-portrait.png"));
console.log("fixture upload-landscape.jpg, upload-portrait.png");

// Random bytes with a .heic name → the browser cannot decode it (client error path).
let x = 12345;
const junk = Buffer.alloc(4096, 0).map(() => ((x = (x * 1103515245 + 12345) & 0x7fffffff), x & 0xff));
writeFileSync(join(FIX, "fake.heic"), junk);
console.log("fixture fake.heic");
