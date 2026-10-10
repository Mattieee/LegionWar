/**
 * Design tokens de LegionWar — SOURCE UNIQUE DE VÉRITÉ.
 *
 * Direction artistique « Atlas + Héraldique » : la partie se joue sur un atlas gravé de la
 * Renaissance (papier vergé, encre sépia, lavis d'aquarelle) ; chaque seigneur y porte ses
 * armoiries (émaux héraldiques, bannières). Voir docs/DESIGN_SYSTEM.md et docs/moodboards/.
 *
 * Trois niveaux :
 *  1. Primitives  (`color`, `font`, `space`…) : valeurs brutes, sans intention.
 *  2. Sémantiques (`bg`, `text`, `border`, `action`, `feedback`, `focus`, `progress`) :
 *     intention d'usage, exprimées par alias `{chemin.vers.primitive}`.
 *  3. Domaine jeu (`race`, `heraldry`, `skin`, `map`) : armoiries, habillage de l'interface
 *     par peuple et rendu de la carte (Canvas).
 *
 * `src/css/tokens.css` est GÉNÉRÉ à partir de ce fichier (`npm run tokens`). Ne pas l'éditer à la main.
 * Règle : les composants n'utilisent que les niveaux 2 et 3, jamais les primitives de couleur.
 */
export const tokens = {
  // 1. Primitives ------------------------------------------------------------------------------
  color: {
    paper: {
      50: "#f7f0dc",
      100: "#efe5c8",
      200: "#e6d8b2",
      300: "#d8c69a",
      400: "#c4ad7c",
    },
    ink: {
      900: "#2a1d12",
      800: "#3b2a1a",
      700: "#5a4630",
      500: "#7d6648",
      300: "#a89474",
    },
    garance: { 700: "#6e2a1c", 600: "#8c3b2a", 500: "#a5442f", 300: "#c97a62" },
    gules: { 700: "#7f1d16", 500: "#b3261e" },
    indigo: { 700: "#2c4566", 500: "#3d5f8a", 300: "#8aa3c2" },
    verdigris: { 700: "#2f5446", 500: "#4f7f6a", 300: "#93b3a2" },
    wine: { 500: "#6e3d5b" },
    sienna: { 600: "#8e5f28", 500: "#b8823f", 300: "#d9b57a" },
    table: { 900: "#1c140e", 800: "#2a1f17" },
  },

  font: {
    family: {
      display: '"IM Fell English SC", "Palatino Linotype", Georgia, serif',
      flavor: '"IM Fell English", "Palatino Linotype", Georgia, serif',
      body: '"EB Garamond", Garamond, "Times New Roman", serif',
      /** Titres : la police d'affichage, remplacée par celle du peuple dans un habillage. */
      title: "{font.family.display}",
    },
    // Échelle compacte (ratio ≈ 1,2) : le HUD doit laisser toute la place à la carte.
    size: {
      xs: "0.75rem",
      sm: "0.8125rem",
      md: "0.9375rem",
      lg: "1.125rem",
      xl: "1.375rem",
      "2xl": "1.625rem",
      "3xl": "2rem",
      display: "clamp(2.2rem, 5vw, 3.4rem)",
    },
    weight: { regular: 400, medium: 500, bold: 600, display: 400 },
    leading: { tight: 1.15, normal: 1.4, relaxed: 1.6 },
    tracking: { normal: "0", wide: "0.05em", display: "0.14em" },
  },

  space: {
    0: "0",
    1: "0.25rem",
    2: "0.5rem",
    3: "0.75rem",
    4: "1rem",
    5: "1.25rem",
    6: "1.5rem",
    8: "2rem",
    10: "2.5rem",
    12: "3rem",
  },

  radius: { sm: "2px", md: "4px", lg: "14px / 8px", pill: "999px" },

  shadow: {
    sm: "0 1px 2px rgba(42, 29, 18, 0.25)",
    md: "0 6px 18px rgba(20, 12, 6, 0.45)",
    lg: "0 18px 46px rgba(10, 6, 3, 0.6)",
    bevel: "inset 0 0 0 1px rgba(255, 250, 235, 0.55)",
    glow: "0 0 0 3px rgba(61, 95, 138, 0.35)",
    paper: "inset 0 0 38px rgba(90, 70, 48, 0.22)",
  },

  duration: { fast: "120ms", base: "200ms", slow: "320ms" },
  easing: { standard: "cubic-bezier(0.2, 0, 0, 1)", emphasized: "cubic-bezier(0.3, 0, 0, 1.2)" },

  z: { base: 0, hud: 10, overlay: 100, modal: 200, toast: 300 },

  // 2. Sémantiques -----------------------------------------------------------------------------
  bg: {
    app: "{color.table.900}",
    surface: "{color.paper.100}",
    raised: "{color.paper.50}",
    inset: "{color.paper.200}",
    hover: "{color.paper.200}",
    selection: "{color.indigo.300}",
    overlay: "rgba(28, 20, 14, 0.6)",
  },
  text: {
    primary: "{color.ink.900}",
    secondary: "{color.ink.700}",
    muted: "{color.ink.500}",
    accent: "{color.garance.600}",
    inverse: "{color.paper.50}",
    danger: "{color.gules.700}",
    success: "{color.verdigris.700}",
    info: "{color.indigo.700}",
    emboss: "{color.paper.50}",
  },
  border: {
    subtle: "{color.ink.300}",
    hover: "{color.ink.500}",
    default: "{color.ink.700}",
    strong: "{color.ink.900}",
  },
  action: {
    primary: {
      bg: "{color.garance.600}",
      bgHover: "{color.garance.700}",
      text: "{color.paper.50}",
      border: "{color.ink.900}",
    },
    secondary: {
      bg: "{color.paper.100}",
      bgHover: "{color.paper.200}",
      text: "{color.ink.900}",
      border: "{color.ink.700}",
    },
    danger: {
      bg: "{color.gules.700}",
      bgHover: "{color.ink.900}",
      text: "{color.paper.50}",
      border: "{color.ink.900}",
    },
  },
  feedback: {
    success: "{color.verdigris.500}",
    danger: "{color.gules.500}",
    warning: "{color.sienna.600}",
    info: "{color.indigo.500}",
  },
  focus: { ring: "{color.indigo.500}" },
  progress: { from: "{color.sienna.500}", to: "{color.garance.600}" },

  // 3. Domaine jeu -----------------------------------------------------------------------------
  /** Émaux héraldiques : armoiries des joueurs, bannières, écus. */
  heraldry: {
    or: "#d4a12a",
    argent: "#f4f1e8",
    gules: "#b3261e",
    azure: "#1f4fa3",
    vert: "#2d7a46",
    purpure: "#6b2d6b",
    sable: "#1b1b1b",
    tenne: "#9a5b2b",
  },
  /** Émail principal de chaque peuple. */
  race: {
    aldoria: "{heraldry.azure}",
    kharag: "{heraldry.gules}",
    morvane: "{heraldry.purpure}",
    sylvanor: "{heraldry.vert}",
  },
  /**
   * Habillage de l'interface selon le peuple joué (« matières de faction ») : la carte reste
   * l'Atlas, le HUD prend la matière du peuple. Chaque habillage redéfinit les tokens
   * sémantiques (fonds, textes, bordures, bouton principal) et la police des titres.
   */
  skin: {
    // Pierre de taille et filet d'or.
    aldoria: {
      font: '"Cinzel", "IM Fell English SC", Georgia, serif',
      surface: "#424854",
      raised: "#4a505c",
      inset: "#343943",
      text: "#f3f1ea",
      textSecondary: "#d3d6dc",
      textMuted: "#aeb3bd",
      accent: "#f0d27e",
      info: "#b8d3f5",
      danger: "#ffb3aa",
      success: "#a9e4ba",
      border: "#8b919c",
      trim: "#d4a94a",
      actionBg: "#1f4e9c",
      actionBgHover: "#183f80",
      actionText: "#ffffff",
    },
    // Planches clouées, cuir et fer.
    kharag: {
      font: '"Grenze Gotisch", "IM Fell English SC", Georgia, serif',
      surface: "#4a2a17",
      raised: "#5a3420",
      inset: "#3a2011",
      text: "#f4e6c9",
      textSecondary: "#dcc6a0",
      textMuted: "#b89c74",
      accent: "#f0a24a",
      info: "#a8c8ee",
      danger: "#ff9a86",
      success: "#b7dc8a",
      border: "#8a5a32",
      trim: "#c9c3b8",
      actionBg: "#9e2a1e",
      actionBgHover: "#7e1f15",
      actionText: "#fbefd8",
    },
    // Os, améthyste et lueur verdâtre.
    morvane: {
      font: '"UnifrakturMaguntia", "IM Fell English SC", Georgia, serif',
      surface: "#22142a",
      raised: "#2d1b37",
      inset: "#180d1e",
      text: "#ece6f2",
      textSecondary: "#cfc4da",
      textMuted: "#a596b3",
      accent: "#a8db66",
      info: "#a9b8f5",
      danger: "#ff9aaa",
      success: "#a8db66",
      border: "#6e4f80",
      trim: "#d8cfb8",
      actionBg: "#5b2a6e",
      actionBgHover: "#46205a",
      actionText: "#f1ffe4",
    },
    // Écorce, pierre de lune et feuillage.
    sylvanor: {
      font: '"Uncial Antiqua", "IM Fell English SC", Georgia, serif',
      surface: "#1d3524",
      raised: "#26432e",
      inset: "#142a1c",
      text: "#eef4ea",
      textSecondary: "#cddbc8",
      textMuted: "#a3b8a0",
      accent: "#d6e4f2",
      info: "#b3d0f2",
      danger: "#ffa396",
      success: "#b5e3a0",
      border: "#5f7f68",
      trim: "#b9c9dc",
      actionBg: "#2f6b3a",
      actionBgHover: "#24542d",
      actionText: "#f6fbf3",
    },
  },
  map: {
    table: "{color.table.800}",
    terrain: {
      plain: "#ece0bf",
      coast: "#e4d4a8",
      forest: "#d5d1a2",
      hills: "#e2cf9c",
      mountain: "#cbb58a",
      peaks: "#f7f0dc",
      sea: "#d6d2b0",
      seaDeep: "#c9c6a2",
      lake: "#cfcfae",
    },
    /** Hachures côtières gravées (encre posée sur la mer près des côtes). */
    coastLine: "{color.ink.700}",
    coastLineStrength: 0.32,
    /** Lavis d'aquarelle des territoires : intérieur, bord qui « bave », frontière à l'encre. */
    washInterior: 0.36,
    washEdge: 0.58,
    borderInk: 0.55,
    ink: "{color.ink.800}",
    mine: "{color.sienna.500}",
    hover: "{color.ink.900}",
    buildValid: "{color.verdigris.700}",
    buildInvalid: "{heraldry.gules}",
    towerRange: "{color.indigo.500}",
    label: "{color.ink.900}",
    labelSelf: "{color.garance.700}",
    labelHalo: "{color.paper.50}",
    vignette: "{color.ink.900}",
    /** Batailles : ligne de front sur les tuiles qui changent de main, chiffre des fronts. */
    battle: {
      /** Ombre d'encre brève sur une tuile prise de force. */
      capture: "{color.ink.800}",
      /** Chiffre d'une attaque qui vous vise. */
      incoming: "{heraldry.gules}",
      /** Chiffre de vos propres attaques. */
      outgoing: "{color.verdigris.700}",
    },
    /** Diplomatie : liseré des frontières alliées, nom du Parjure, Couronne du meneur. */
    ally: "{color.verdigris.500}",
    parjure: "{heraldry.gules}",
    crown: "{heraldry.or}",
    /** Marques des mécaniques de race sur la carte (GDD §7.3). */
    marks: {
      /** Remparts d'Aldoria : créneaux à l'encre alternés avec la pierre. */
      rampartInk: "{color.ink.900}",
      rampartStone: "#a59c8b",
      /** Bosquets de Sylvanor : feuillage mêlé au papier, ponctué d'arbres à l'encre. */
      grove: "#4d7340",
      groveStrength: 0.42,
      groveTree: "#26401f",
      /** Charniers : cendre, ossements ; braises quand Kharag tient la terre. */
      ash: "#5e554b",
      ashStrength: 0.38,
      bone: "{color.paper.50}",
      ember: "#d0561f",
      /** Terres de Morvane : papier désaturé et violacé (purement visuel). */
      deadland: "#6a5a7c",
      deadlandStrength: 0.4,
    },
    playerHuman: { saturation: 0.62, lightness: 0.4 },
    playerBot: { saturation: 0.28, lightness: 0.46 },
  },
} as const;

export type Tokens = typeof tokens;
