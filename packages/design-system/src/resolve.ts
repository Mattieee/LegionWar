import { tokens } from "./tokens";

type Leaf = string | number;
interface Tree {
  readonly [key: string]: Leaf | Tree;
}

const ALIAS = /^\{([^}]+)\}$/;
export const CSS_PREFIX = "lw";

/** Aplatit l'arbre en paires [chemin, valeur] (ordre de déclaration). */
export function flatten(tree: Tree = tokens, prefix: string[] = []): [string[], Leaf][] {
  const out: [string[], Leaf][] = [];
  for (const [key, value] of Object.entries(tree)) {
    const path = [...prefix, key];
    if (typeof value === "object") out.push(...flatten(value, path));
    else out.push([path, value]);
  }
  return out;
}

function lookup(path: string): Leaf {
  let node: Leaf | Tree = tokens;
  for (const part of path.split(".")) {
    if (typeof node !== "object" || !(part in node)) {
      throw new Error(`Alias de token introuvable : {${path}}`);
    }
    node = (node as Tree)[part] as Leaf | Tree;
  }
  if (typeof node === "object")
    throw new Error(`L'alias {${path}} désigne un groupe, pas une valeur`);
  return node;
}

/** Résout récursivement un alias `{a.b.c}` vers sa valeur finale. */
export function resolveValue(value: Leaf, seen: string[] = []): Leaf {
  if (typeof value !== "string") return value;
  const match = ALIAS.exec(value);
  if (!match) return value;
  const path = match[1] as string;
  if (seen.includes(path)) throw new Error(`Alias circulaire : ${[...seen, path].join(" → ")}`);
  return resolveValue(lookup(path), [...seen, path]);
}

/** Valeur résolue d'un token par son chemin (ex. `token("text.accent")`). */
export function token(path: string): Leaf {
  return resolveValue(lookup(path));
}

/** Nom de la variable CSS d'un chemin : ["text", "accent"] → `--lw-text-accent`. */
export function cssVarName(path: readonly string[]): string {
  const kebab = path.map((p) => p.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));
  return `--${CSS_PREFIX}-${kebab.join("-")}`;
}

/** Génère le contenu de `tokens.css` : alias → `var(--…)` pour permettre le re-thème en CSS. */
export function generateTokensCss(): string {
  const lines = flatten().map(([path, value]) => {
    const match = typeof value === "string" ? ALIAS.exec(value) : null;
    const cssValue = match ? `var(${cssVarName((match[1] as string).split("."))})` : String(value);
    return `  ${cssVarName(path)}: ${cssValue};`;
  });
  return [
    "/* FICHIER GÉNÉRÉ par `npm run tokens` depuis src/tokens.ts — ne pas éditer à la main. */",
    ":root {",
    ...lines,
    "}",
    "",
  ].join("\n");
}
