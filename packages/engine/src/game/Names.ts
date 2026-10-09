import type { PseudoRandom } from "../core/PseudoRandom";

const PEOPLES = [
  "Gnolls",
  "Kobolds",
  "Trolls des marais",
  "Ogres",
  "Brigands",
  "Centaures",
  "Hommes-loups",
  "Gobelins",
  "Harpies",
  "Nains renégats",
  "Barbares",
  "Satyres",
  "Hommes-lézards",
  "Pillards",
  "Cultistes",
];

const EPITHETS = [
  "du Croc-Noir",
  "de la Lune Rouge",
  "des Cendres",
  "du Marais Pourpre",
  "de la Dent Brisée",
  "des Collines Grises",
  "du Crâne Fendu",
  "de l'Aube Sanglante",
  "des Mille Lames",
  "du Val Brumeux",
  "de la Griffe d'Acier",
  "des Terres Brûlées",
  "du Gouffre",
  "de la Corne Sombre",
  "des Ronces",
  "du Givre",
];

/** Nom de tribu sauvage, unique dans la partie tant que les combinaisons le permettent. */
export function tribeName(rng: PseudoRandom, used: Set<string>): string {
  for (let i = 0; i < 50; i++) {
    const name = `${rng.pick(PEOPLES)} ${rng.pick(EPITHETS)}`;
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  const fallback = `Tribu n°${used.size + 1}`;
  used.add(fallback);
  return fallback;
}
