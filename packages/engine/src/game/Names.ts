import { Race } from "../config/Races";
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

/**
 * Familles de mots clés : deux mots d'une même famille ne se retrouvent jamais dans le peuple et
 * dans le lieu (« Trolls des marais du Marais Pourpre », « … des Collines du Mont Gris »).
 */
const KEYWORD_FAMILIES: readonly (readonly string[])[] = [
  ["marais", "marecage", "tourbiere"],
  ["foret", "bois", "sylve", "ronce"],
  ["colline", "mont", "montagne"],
  ["val", "vallee", "gouffre"],
  ["cendre", "brule", "brulee", "braise"],
];

/** Articles ignorés (les plus courts, « de », « du », « la », tombent sous la longueur minimale). */
const ARTICLES = new Set(["des", "les", "aux", "une"]);

/**
 * Mots porteurs d'un nom, ramenés à une racine : minuscules, sans accents ni pluriel, sans les
 * articles ; un mot d'une famille est remplacé par sa famille.
 */
function nameKeywords(text: string): Set<string> {
  const out = new Set<string>();
  const words = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z]+/);
  for (const word of words) {
    if (word.length < 3 || ARTICLES.has(word)) continue;
    const root = word.replace(/(s|x)$/, "");
    const family = KEYWORD_FAMILIES.findIndex((f) => f.includes(root));
    out.add(family >= 0 ? `famille:${family}` : root);
  }
  return out;
}

/** Pour chaque peuple, les lieux qui ne répètent aucun de ses mots clés (calculé une fois). */
const EPITHETS_FOR: ReadonlyMap<string, readonly string[]> = new Map(
  PEOPLES.map((people) => {
    const keys = nameKeywords(people);
    return [people, EPITHETS.filter((e) => ![...nameKeywords(e)].some((k) => keys.has(k)))];
  }),
);

/**
 * Nom de tribu sauvage, unique dans la partie tant que les combinaisons le permettent. Le lieu est
 * tiré parmi ceux qui ne répètent pas un mot du peuple : toujours deux tirages par essai.
 */
export function tribeName(rng: PseudoRandom, used: Set<string>): string {
  for (let i = 0; i < 50; i++) {
    const people = rng.pick(PEOPLES);
    const name = `${people} ${rng.pick(EPITHETS_FOR.get(people) ?? EPITHETS)}`;
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  const fallback = `Tribu n°${used.size + 1}`;
  used.add(fallback);
  return fallback;
}

/** Titres et terres des maisons d'Aldoria (« Comté de Valgarde »). */
const ALDORIA_TITLES = ["Duché", "Comté", "Marche", "Baronnie"];
const ALDORIA_LANDS = [
  "Valgarde",
  "Hautbrune",
  "Clairsaule",
  "Pierrelune",
  "Aubeval",
  "Brisemont",
  "Ormelande",
  "Castelfroid",
];

/** Maisons des autres peuples, noms complets (univers original, aucun emprunt). */
const NATION_NAMES: Record<Exclude<Race, Race.Aldoria>, readonly string[]> = {
  [Race.Kharag]: [
    "Clan des Crocs de Cendre",
    "Clan Fend-l'Os",
    "Khanat de la Steppe Rouge",
    "Clan du Tambour Noir",
    "Clan Brise-Échine",
    "Clan de la Fournaise",
  ],
  [Race.Morvane]: [
    "Cour des Linceuls",
    "Ost de Morne-Glas",
    "Ossuaire de Pâle-Fosse",
    "Concile des Cierges Noirs",
    "Légion du Glas",
    "Marches Livides",
  ],
  [Race.Sylvanor]: [
    "Sylve d'Ambreciel",
    "Conclave des Saules",
    "Clairière de Lunefeuille",
    "Cercle des Fougères",
    "Bois de Brumelin",
    "Havre-Ramure",
  ],
};

/** Nom d'un prétendant, propre à son peuple et unique dans la partie. */
export function nationName(race: Race, rng: PseudoRandom, used: Set<string>): string {
  for (let i = 0; i < 50; i++) {
    const name =
      race === Race.Aldoria
        ? `${rng.pick(ALDORIA_TITLES)} ${ofLand(rng.pick(ALDORIA_LANDS))}`
        : rng.pick(NATION_NAMES[race]);
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  const fallback = `Maison n°${used.size + 1}`;
  used.add(fallback);
  return fallback;
}

/** « de Valgarde », mais « d'Aubeval » : élision devant une voyelle. */
function ofLand(land: string): string {
  return /^[AEIOUYÂÉÈÊÎÔÛaeiouy]/.test(land) ? `d'${land}` : `de ${land}`;
}
