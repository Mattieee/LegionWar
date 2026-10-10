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
