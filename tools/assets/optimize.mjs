#!/usr/bin/env node
/**
 * Optimise les images générées (tools/assets/originals, non versionné) pour le jeu.
 *
 *  - Gravures (bâtiments, emblèmes, mer, ornements) : « extraction de l'encre ». Le papier de
 *    fond est retiré ; il ne reste qu'une encre sépia unique sur fond transparent, dont
 *    l'opacité suit la densité du trait. Les gravures se posent ainsi sur n'importe quel fond.
 *  - Papier clair : « grain » neutre (gris centré près du blanc), à multiplier sur la couleur
 *    de surface du design system sans la décaler.
 *  - Papier taché : texture opaque, réduite pour être répétée en mosaïque.
 *  - Frontispice : illustration opaque.
 * Sortie en WebP, à la taille d'usage.
 *
 * Usage : npm run assets:optimize
 */
import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const SRC = join(HERE, "originals");
const ART = join(ROOT, "packages", "client", "public", "art");
const DS_ASSETS = join(ROOT, "packages", "design-system", "src", "assets");

/** Encre de référence (token map.ink / color.ink.900). */
const INK = [42, 29, 18];
/** Papier sur lequel aplatir les images partiellement transparentes avant extraction. */
const PAPER_HEX = "#efe5c8";

const JOBS = [
  // Grain des panneaux du design system
  { src: "paper-1", out: [DS_ASSETS, "paper-grain.webp"], width: 512, mode: "grain" },
  // Menu : table de papier taché et frontispice
  { src: "paper-2", out: [ART, "paper-aged.webp"], width: 512, mode: "opaque" },
  { src: "frontispice", out: [ART, "frontispice.webp"], width: 1536, mode: "opaque" },
  // Ornements
  { src: "cartouche-title", out: [ART, "cartouche-title.webp"], width: 1024, mode: "ink" },
  { src: "cartouche-victory", out: [ART, "cartouche-victory.webp"], width: 1024, mode: "ink" },
  {
    src: "compass-rose",
    out: [ART, "compass-rose.webp"],
    width: 384,
    mode: "ink",
    radialFade: true,
    // Le fond de l'original est taché : seuil plus haut pour ne garder que le trait.
    threshold: 0.3,
  },
  // Bâtiments
  // L'original « comptoir » sert au Marché (BuildingKind.Marche).
  ...["bourg", "tour", "port", "comptoir", "bastion", "sanctuaire"].map((id) => ({
    src: `building-${id}`,
    out: [join(ART, "buildings"), `${id === "comptoir" ? "marche" : id}.webp`],
    width: 256,
    mode: "ink",
  })),
  // Emblèmes des peuples
  ...["aldoria", "kharag", "morvane", "sylvanor"].map((id) => ({
    src: `emblem-${id}`,
    out: [join(ART, "emblems"), `${id}.webp`],
    width: 256,
    mode: "ink",
  })),
  // Décor marin
  ...[
    ["sea-serpent", "serpent"],
    ["sea-whale", "whale"],
    ["sea-kraken", "kraken"],
    ["ship-galleon", "galleon"],
    ["ship-longship", "longship"],
    ["ship-cog", "cog"],
  ].map(([src, id]) => ({ src, out: [join(ART, "sea"), `${id}.webp`], width: 384, mode: "ink" })),
];

/** Couleur médiane des pixels de bord : le papier de fond de la gravure. */
function borderPaper(data, width, height) {
  const samples = [[], [], []];
  const take = (x, y) => {
    const i = (y * width + x) * 4;
    for (let c = 0; c < 3; c++) samples[c].push(data[i + c]);
  };
  for (let x = 0; x < width; x += 4) {
    take(x, 0);
    take(x, height - 1);
  }
  for (let y = 0; y < height; y += 4) {
    take(0, y);
    take(width - 1, y);
  }
  return samples.map((s) => s.sort((a, b) => a - b)[s.length >> 1]);
}

/**
 * Inverse le mélange C = a·Encre + (1 − a)·Papier : a = (Papier − C) / (Papier − Encre),
 * pris sur le canal le plus marqué. Le bruit du papier (a < seuil, 6 % par défaut) est effacé.
 */
function extractInk(data, width, height, radialFade, threshold) {
  const paper = borderPaper(data, width, height);
  const out = Buffer.alloc(width * height * 4);
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let a = 0;
      for (let c = 0; c < 3; c++) {
        const span = paper[c] - INK[c];
        if (span > 8) a = Math.max(a, (paper[c] - data[i + c]) / span);
      }
      a = Math.min(1, Math.max(0, (a - threshold) / (1 - threshold)));
      if (radialFade) {
        const d = Math.hypot(x - cx, y - cy) / radius;
        a *= Math.min(1, Math.max(0, (1 - d) / 0.12));
      }
      out[i] = INK[0];
      out[i + 1] = INK[1];
      out[i + 2] = INK[2];
      out[i + 3] = Math.round(a * 255);
    }
  }
  return out;
}

/**
 * Grain neutre : luminance centrée sur GRAIN_BASE, écarts amplifiés. Multiplié sur une couleur
 * de surface, il ajoute la fibre du papier en l'assombrissant à peine (~2 %).
 */
const GRAIN_BASE = 250;
const GRAIN_GAIN = 1.6;
// Plancher : une tache sombre isolée du papier ne doit pas faire un point noir sur le panneau.
const GRAIN_FLOOR = 215;
function paperGrain(data, width, height) {
  const n = width * height;
  const lum = new Float32Array(n);
  let mean = 0;
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    lum[p] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    mean += lum[p];
  }
  mean /= n;
  const out = Buffer.alloc(n);
  for (let p = 0; p < n; p++) {
    out[p] = Math.min(
      255,
      Math.max(GRAIN_FLOOR, Math.round(GRAIN_BASE + GRAIN_GAIN * (lum[p] - mean))),
    );
  }
  return out;
}

let total = 0;
for (const job of JOBS) {
  const input = join(SRC, `${job.src}.png`);
  if (!existsSync(input)) {
    console.warn(`  ! ${job.src}.png absent, ignoré`);
    continue;
  }
  const [dir, name] = job.out;
  mkdirSync(dir, { recursive: true });
  const output = join(dir, name);
  let pipeline = sharp(input).resize({ width: job.width, withoutEnlargement: true });
  if (job.mode === "opaque") {
    await pipeline.flatten({ background: PAPER_HEX }).webp({ quality: 80 }).toFile(output);
  } else if (job.mode === "grain") {
    pipeline = pipeline.flatten({ background: PAPER_HEX }).ensureAlpha();
    const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
    const grain = paperGrain(data, info.width, info.height);
    await sharp(grain, { raw: { width: info.width, height: info.height, channels: 1 } })
      .webp({ quality: 80 })
      .toFile(output);
  } else {
    pipeline = pipeline.flatten({ background: PAPER_HEX }).ensureAlpha();
    const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
    const ink = extractInk(
      data,
      info.width,
      info.height,
      Boolean(job.radialFade),
      job.threshold ?? 0.06,
    );
    await sharp(ink, { raw: { width: info.width, height: info.height, channels: 4 } })
      .webp({ quality: 82, alphaQuality: 90 })
      .toFile(output);
  }
  const size = statSync(output).size;
  total += size;
  console.log(`  ${name.padEnd(24)} ${(size / 1024).toFixed(0).padStart(5)} Ko`);
}
console.log(`Total : ${(total / 1024).toFixed(0)} Ko`);
