#!/usr/bin/env node
/**
 * Génération des images de LegionWar via l'API OpenAI (Images API).
 *
 * Sécurité et budget :
 *  - La clé est lue dans la variable d'environnement OPENAI_API_KEY, jamais affichée ni écrite.
 *  - Sans --run, le script n'appelle pas l'API : il affiche le plan et le coût estimé.
 *  - Chaque appel est consigné dans tools/assets/ledger.json (tokens, coût) ; le script refuse
 *    de lancer une génération qui ferait dépasser le budget (BUDGET_EUR).
 *
 * Usage :
 *   node tools/assets/generate.mjs                     # plan + estimation (gratuit)
 *   node tools/assets/generate.mjs --run               # génère tout ce qui n'existe pas encore
 *   node tools/assets/generate.mjs --run --only a,b    # seulement ces identifiants
 *   node tools/assets/generate.mjs --run --only a --force   # nouvel essai même si l'image existe
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const OUT_DIR = join(ROOT, "packages", "client", "public", "assets", "generated");
const LEDGER = join(HERE, "ledger.json");
const ENDPOINT = "https://api.openai.com/v1/images/generations";

const BUDGET_EUR = 10;
const USD_TO_EUR = 0.92;
// Tarifs officiels (developers.openai.com/api/docs/pricing, oct. 2026), USD par million de tokens.
const PRICE = { imageOutput: 30, textInput: 5 };
// Estimation par image avant appel (USD), pour le contrôle de budget.
const ESTIMATE_USD = {
  low: { square: 0.006, wide: 0.009 },
  medium: { square: 0.053, wide: 0.08 },
  high: { square: 0.211, wide: 0.25 },
};

const args = process.argv.slice(2);
const run = args.includes("--run");
const force = args.includes("--force");
const onlyArg = args.find((a, i) => args[i - 1] === "--only");
const only = onlyArg ? new Set(onlyArg.split(",").map((s) => s.trim())) : null;

const config = JSON.parse(readFileSync(join(HERE, "prompts.json"), "utf8"));
const ledger = existsSync(LEDGER)
  ? JSON.parse(readFileSync(LEDGER, "utf8"))
  : { currency: "USD", entries: [] };

const spentUsd = () => ledger.entries.reduce((sum, e) => sum + e.costUsd, 0);
const eur = (usd) => `${(usd * USD_TO_EUR).toFixed(2)} €`;
const estimate = (a) =>
  ESTIMATE_USD[a.quality][a.size === "1024x1024" ? "square" : "wide"] ?? ESTIMATE_USD.high.wide;
const fileFor = (a) => join(OUT_DIR, `${a.id}.png`);

const selected = config.assets.filter(
  (a) => (!only || only.has(a.id)) && (force || !existsSync(fileFor(a))),
);
const plannedUsd = selected.reduce((sum, a) => sum + estimate(a), 0);

console.log(`Modèle : ${config.model}`);
console.log(`Déjà dépensé : ${eur(spentUsd())} / ${BUDGET_EUR} €`);
console.log(`À générer : ${selected.length} image(s), estimation ${eur(plannedUsd)}`);
for (const a of selected) {
  console.log(
    `  - ${a.id.padEnd(20)} ${a.size.padEnd(10)} ${a.quality.padEnd(7)} ≈ ${eur(estimate(a))}`,
  );
}

if (!run) {
  console.log("\nMode plan uniquement (aucun appel, aucun coût). Ajoutez --run pour générer.");
  process.exit(0);
}
if ((spentUsd() + plannedUsd) * USD_TO_EUR > BUDGET_EUR) {
  console.error(`\nRefusé : le budget de ${BUDGET_EUR} € serait dépassé.`);
  process.exit(1);
}
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("\nVariable OPENAI_API_KEY absente. Exemple (PowerShell) :");
  console.error('  $env:OPENAI_API_KEY = "sk-..."; npm run assets:generate');
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
const saveLedger = () => writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 2)}\n`);

for (const asset of selected) {
  if ((spentUsd() + estimate(asset)) * USD_TO_EUR > BUDGET_EUR) {
    console.error(`Arrêt avant ${asset.id} : budget atteint.`);
    break;
  }
  process.stdout.write(`→ ${asset.id}… `);
  const body = {
    model: config.model,
    prompt: `${config.style}\n\n${asset.prompt}`,
    size: asset.size,
    quality: asset.quality,
    background: asset.background,
    output_format: "png",
    n: 1,
  };
  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error(`échec réseau (${error instanceof Error ? error.message : error})`);
    continue;
  }
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.data?.[0]?.b64_json) {
    console.error(`échec HTTP ${response.status} : ${json.error?.message ?? "réponse inattendue"}`);
    continue;
  }
  writeFileSync(fileFor(asset), Buffer.from(json.data[0].b64_json, "base64"));
  const usage = json.usage ?? {};
  const outputTokens = usage.output_tokens ?? 0;
  const inputTokens = usage.input_tokens ?? 0;
  const costUsd = usage.output_tokens
    ? (outputTokens * PRICE.imageOutput + inputTokens * PRICE.textInput) / 1e6
    : estimate(asset);
  ledger.entries.push({
    date: new Date().toISOString(),
    id: asset.id,
    model: config.model,
    size: asset.size,
    quality: asset.quality,
    inputTokens,
    outputTokens,
    costUsd: Number(costUsd.toFixed(4)),
    measured: Boolean(usage.output_tokens),
  });
  saveLedger();
  console.log(`ok (${eur(costUsd)}${usage.output_tokens ? "" : ", estimé"})`);
}

console.log(`\nTotal dépensé : ${eur(spentUsd())} / ${BUDGET_EUR} €`);
console.log(`Images : ${OUT_DIR}`);
