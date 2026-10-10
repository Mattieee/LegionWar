import "@legionwar/design-system/styles.css";
import "./styleguide.css";
import {
  contrastRatio,
  cssVarName,
  flatten,
  raceColor,
  raceTincture,
  TINCTURES,
  token,
  tokens,
} from "@legionwar/design-system";
import { ALL_RACES, RACES } from "@legionwar/engine";
import { escapeHtml } from "../ui/format";
import { RadialMenu } from "../ui/RadialMenu";

/**
 * Page de référence du design system. Les sections « tokens » sont générées depuis
 * `tokens.ts` : elles ne peuvent pas diverger du code.
 */

const root = document.getElementById("styleguide");
if (!root) throw new Error("Élément #styleguide introuvable");

const hexOf = (path: string): string => String(token(path));

function swatch(path: string, note = ""): string {
  const name = cssVarName(path.split("."));
  return `<figure class="sg-swatch">
    <div class="sg-swatch__chip" style="background: var(${name})"></div>
    <figcaption><code>${name}</code><span>${escapeHtml(hexOf(path))}${note}</span></figcaption>
  </figure>`;
}

function contrastNote(fg: string, bg = "bg.surface"): string {
  const ratio = contrastRatio(hexOf(fg), hexOf(bg));
  const level = ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA grand" : "✗";
  return ` · ${ratio.toFixed(1)}:1 ${level}`;
}

function group(prefix: string): string[] {
  return flatten()
    .filter(([path, value]) => path.join(".").startsWith(prefix) && typeof value === "string")
    .map(([path]) => path.join("."));
}

const primitives = group("color.");
const semantic = [
  ...group("bg."),
  ...group("text."),
  ...group("border."),
  ...group("feedback."),
  ...group("focus."),
];

const section = (id: string, title: string, intro: string, body: string): string => `
  <section class="sg-section" id="${id}" aria-labelledby="${id}-title">
    <h2 class="lw-title-1" id="${id}-title">${title}</h2>
    <p class="sg-intro lw-text-muted">${intro}</p>
    ${body}
  </section>`;

const nav = [
  ["principes", "Principes"],
  ["couleurs", "Couleurs"],
  ["heraldique", "Héraldique"],
  ["races", "Peuples"],
  ["carte", "Carte"],
  ["typographie", "Typographie"],
  ["espaces", "Espaces & formes"],
  ["composants", "Composants"],
]
  .map(([id, label]) => `<a href="#${id}">${label}</a>`)
  .join("");

root.innerHTML = `
<header class="sg-header">
  <div>
    <p class="lw-overline">LegionWar</p>
    <h1 class="lw-display sg-title">Design system</h1>
    <p class="lw-flavor">Atlas + Héraldique : papier vergé, encre sépia, lavis d'aquarelle et armoiries. Une seule source : <code>packages/design-system/src/tokens.ts</code>.</p>
  </div>
  <a class="lw-button lw-button--sm" href="/">← Retour au jeu</a>
</header>
<nav class="sg-nav" aria-label="Sections">${nav}</nav>
<main class="sg-main">
${section(
  "principes",
  "Principes",
  "Cinq règles qui guident toute l'interface.",
  `<ol class="sg-principles">
    <li><strong>La carte est le jeu.</strong> Un atlas gravé où les royaumes s'étendent en lavis ; l'interface n'est faite que de cartouches discrets posés sur la feuille.</li>
    <li><strong>Chaque seigneur porte ses armoiries.</strong> Émail, écu, bannière : on reconnaît un joueur sans lire son nom. Les hachures héraldiques codent les émaux pour les daltoniens.</li>
    <li><strong>De l'encre, pas du plastique.</strong> Traits, hachures, grain du papier ; jamais de dégradé brillant ni de lueur générique.</li>
    <li><strong>Une source de vérité.</strong> Tokens sémantiques uniquement ; aucune couleur en dur dans les composants ni dans le jeu.</li>
    <li><strong>Accessible.</strong> Focus visible, états ARIA, clavier partout, mouvement réduit respecté.</li>
  </ol>`,
)}
${section(
  "couleurs",
  "Couleurs",
  "Les primitives sont la palette brute ; les composants n'utilisent que les tokens sémantiques. Ratios de contraste calculés sur <code>bg.surface</code>.",
  `<h3 class="lw-title-3">Sémantiques</h3>
   <div class="sg-grid">${semantic.map((p) => swatch(p, p.startsWith("text.") || p.startsWith("feedback.") || p.startsWith("focus.") ? contrastNote(p) : "")).join("")}</div>
   <h3 class="lw-title-3">Primitives</h3>
   <div class="sg-grid sg-grid--dense">${primitives.map((p) => swatch(p)).join("")}</div>`,
)}
${section(
  "heraldique",
  "Héraldique",
  "Huit émaux pour les armoiries des joueurs. Chacun a sa hachure conventionnelle (système de Petra Sancta) : un écu reste lisible même sans la couleur. Classes <code>.lw-shield</code>, <code>.lw-tincture-*</code>, <code>.lw-shield--hatched</code>, <code>.lw-banner</code>.",
  `<div class="sg-grid sg-grid--dense">${TINCTURES.map(
    (t) => `<figure class="sg-swatch">
      <div class="sg-swatch__chip sg-heraldry">
        <span class="lw-shield lw-shield--lg lw-tincture-${t}"><span></span></span>
        <span class="lw-shield lw-shield--lg lw-shield--hatched lw-tincture-${t}"><span></span></span>
      </div>
      <figcaption><code>${cssVarName(["heraldry", t])}</code><span>${t} · ${hexOf(`heraldry.${t}`)}</span></figcaption>
    </figure>`,
  ).join("")}</div>
  <div class="sg-row">
    <span class="lw-banner lw-tincture-azure">⚜ Royaume d'Aldoria</span>
    <span class="lw-banner lw-tincture-gules">⚒ Clans de Kharag</span>
    <span class="lw-banner lw-tincture-purpure">☠ Damnés de Morvane</span>
    <span class="lw-banner lw-tincture-vert">❦ Cercle de Sylvanor</span>
  </div>`,
)}
${section(
  "races",
  "Peuples",
  "Chaque peuple porte un émail et un emblème, repris sur les cartes de sélection, le HUD et les noms sur la carte.",
  `<div class="sg-grid">${ALL_RACES.map(
    (race) => `<figure class="sg-swatch">
      <div class="sg-swatch__chip sg-heraldry"><span class="lw-shield lw-shield--lg lw-shield--hatched lw-tincture-${raceTincture(race)}"><span>${RACES[race].emblem}</span></span></div>
      <figcaption><code>${cssVarName(["race", race])}</code><span>${escapeHtml(RACES[race].name)} · ${raceTincture(race)} ${raceColor(race)}</span></figcaption>
    </figure>`,
  ).join("")}</div>`,
)}
${section(
  "carte",
  "Carte",
  `Couleurs du rendu Canvas. La mer porte des hachures côtières gravées ; les royaumes sont des lavis d'aquarelle (pigment multiplié sur le papier : ${Math.round(tokens.map.washInterior * 100)} % à l'intérieur, ${Math.round(tokens.map.washEdge * 100)} % près du bord) cernés d'une frontière à l'encre.`,
  `<div class="sg-grid sg-grid--dense">${[...group("map.terrain."), "map.coastLine", "map.table", "map.mine", "map.buildValid", "map.buildInvalid", "map.towerRange", "map.labelSelf"].map((p) => swatch(p)).join("")}</div>`,
)}
${section(
  "typographie",
  "Typographie",
  `Titres : <strong>IM Fell English SC</strong> · Ambiance : <strong>IM Fell English</strong> italique · Interface et chiffres : <strong>EB Garamond</strong> — licence OFL, embarquées dans le build (aucun CDN).`,
  `<div class="sg-type">
    <p class="lw-display">Valdren</p>
    <p class="lw-flavor lw-title-3">Ici commencent les Marches de Morvane, où nul ne revient.</p>
    <h1 class="lw-title-1">Titre 1 — La Couronne d'Astre</h1>
    <h2 class="lw-title-2">Titre 2 — Les Clans de Kharag</h2>
    <h3 class="lw-title-3">Titre 3 — Tour de garde</h3>
    <p>Corps de texte — Les tribus sauvages occupent les terres sans maître. Levez vos bannières et étendez votre royaume tuile par tuile.</p>
    <p class="lw-text-sm lw-text-muted">Petit texte secondaire — informations de contexte.</p>
    <p class="lw-overline">Surtitre</p>
    <p class="lw-numeric">Chiffres tabulaires : 1 234 567 · 89 012 · 3,40 M</p>
  </div>
  <table class="sg-table">
    <thead><tr><th>Token</th><th>Valeur</th></tr></thead>
    <tbody>${Object.entries(tokens.font.size)
      .map(
        ([k, v]) =>
          `<tr><td><code>${cssVarName(["font", "size", k])}</code></td><td>${v}</td></tr>`,
      )
      .join("")}</tbody>
  </table>`,
)}
${section(
  "espaces",
  "Espaces & formes",
  "Échelle d'espacement sur une base de 4 px ; rayons et ombres en nombre limité.",
  `<div class="sg-spaces">${Object.entries(tokens.space)
    .map(
      ([k, v]) =>
        `<div class="sg-space"><code>${cssVarName(["space", k])}</code><span class="sg-space__bar" style="width: ${v}"></span><span>${v}</span></div>`,
    )
    .join("")}</div>
   <div class="sg-grid">${Object.keys(tokens.radius)
     .map(
       (k) =>
         `<div class="sg-shape" style="border-radius: var(${cssVarName(["radius", k])})"><code>${cssVarName(["radius", k])}</code></div>`,
     )
     .join("")}${Object.keys(tokens.shadow)
     .map(
       (k) =>
         `<div class="sg-shape" style="box-shadow: var(${cssVarName(["shadow", k])})"><code>${cssVarName(["shadow", k])}</code></div>`,
     )
     .join("")}</div>`,
)}
${section(
  "composants",
  "Composants",
  "Classes CSS préfixées <code>lw-</code> (convention BEM). États portés par l'ARIA : <code>aria-pressed</code>, <code>aria-invalid</code>, <code>disabled</code>.",
  `
  <h3 class="lw-title-3">Boutons</h3>
  <div class="sg-row">
    <button class="lw-button lw-button--primary">Principal</button>
    <button class="lw-button">Secondaire</button>
    <button class="lw-button lw-button--ghost">Discret</button>
    <button class="lw-button lw-button--danger">Danger</button>
    <button class="lw-button" aria-pressed="true">Activé</button>
    <button class="lw-button" disabled>Désactivé</button>
  </div>
  <div class="sg-row">
    <button class="lw-button lw-button--primary lw-button--lg">Lancer la conquête</button>
    <button class="lw-button lw-button--sm">Petit</button>
    <button class="lw-button lw-button--sm" data-tooltip="Infobulle : data-tooltip">Survolez-moi</button>
  </div>
  <pre class="sg-code"><code>&lt;button class="lw-button lw-button--primary"&gt;Principal&lt;/button&gt;</code></pre>

  <h3 class="lw-title-3">Champs</h3>
  <div class="sg-row sg-row--fields">
    <label class="lw-field"><span class="lw-field__label">Nom du seigneur</span>
      <input class="lw-input" value="Seigneur" /><span class="lw-field__hint">Entre 2 et 20 caractères.</span></label>
    <label class="lw-field"><span class="lw-field__label">Champ en erreur</span>
      <input class="lw-input" aria-invalid="true" value="X" /><span class="lw-field__error">Le nom est trop court.</span></label>
    <label class="lw-field"><span class="lw-field__label">Carte</span>
      <select class="lw-select"><option>Moyenne (512×320)</option><option>Grande (768×480)</option></select></label>
    <label class="lw-field"><span class="lw-field__label">Curseur</span><input class="lw-range" type="range" value="40" /></label>
  </div>

  <h3 class="lw-title-3">Panneau, statistiques, jauge</h3>
  <div class="sg-row">
    <div class="lw-panel sg-demo-panel">
      <div class="lw-panel__header"><h4 class="lw-title-3">Votre royaume</h4><span class="lw-badge">Aldoria</span></div>
      <div class="lw-stat"><span class="lw-stat__label">Or</span><span class="lw-stat__value">124,5 k</span></div>
      <div class="lw-stat"><span class="lw-stat__label">Troupes</span><span class="lw-stat__value">182 k / 324 k</span></div>
      <div class="lw-progress"><div class="lw-progress__fill" style="width: 56%"></div></div>
      <hr class="lw-divider" />
      <p class="lw-text-sm">Raccourcis : <span class="lw-kbd">1</span> Bourg · <span class="lw-kbd">2</span> Tour · <span class="lw-kbd">Échap</span></p>
    </div>
    <div class="sg-stack">
      <span class="lw-badge">Défaut</span>
      <span class="lw-badge lw-badge--success">Allié</span>
      <span class="lw-badge lw-badge--danger">Parjure</span>
      <span class="lw-badge lw-badge--info">Neutre</span>
      <div class="lw-progress lw-progress--danger"><div class="lw-progress__fill" style="width: 30%"></div></div>
    </div>
  </div>

  <h3 class="lw-title-3">Menu radial</h3>
  <div class="sg-row"><button class="lw-button" id="sg-radial">Ouvrir le menu radial</button></div>
  <pre class="sg-code"><code>new RadialMenu(hôte).open(x, y, { center, ring })</code></pre>

  <h3 class="lw-title-3">Menu contextuel</h3>
  <div class="sg-row">
    <div class="lw-menu" role="menu" aria-label="Exemple de menu contextuel" style="position: static">
      <div class="lw-menu__header"><span class="lw-menu__title">Clan Fend-l'Os</span><span class="lw-menu__subtitle">Prétendant (Chevalier) · Clans de Kharag · Méfiant</span></div>
      <button class="lw-menu__item" role="menuitem">Attaquer <span class="lw-menu__hint">20 % · 12,4 k</span></button>
      <button class="lw-menu__item" role="menuitem">Débarquer <span class="lw-menu__hint">B</span></button>
      <hr class="lw-menu__separator" />
      <button class="lw-menu__item" role="menuitem">Proposer une alliance <span class="lw-menu__hint">K</span></button>
      <button class="lw-menu__item" role="menuitem" disabled>Proposition envoyée</button>
      <button class="lw-menu__item lw-menu__item--danger" role="menuitem">Rompre l'alliance… <span class="lw-menu__hint">L L</span></button>
    </div>
  </div>
  <pre class="sg-code"><code>&lt;div class="lw-menu" role="menu"&gt;…&lt;button class="lw-menu__item" role="menuitem"&gt;…&lt;/button&gt;&lt;/div&gt;</code></pre>

  <h3 class="lw-title-3">Cartes sélectionnables</h3>
  <div class="sg-grid">${ALL_RACES.slice(0, 2)
    .map(
      (
        race,
        i,
      ) => `<button type="button" class="lw-card" aria-pressed="${i === 0}" style="--lw-card-accent: ${raceColor(race)}">
        <span class="lw-card__head">
          <span class="lw-shield lw-shield--lg lw-shield--hatched lw-tincture-${raceTincture(race)}" aria-hidden="true"><span>${RACES[race].emblem}</span></span>
          <span><span class="lw-card__title">${escapeHtml(RACES[race].name)}</span><br /><span class="lw-card__subtitle">${escapeHtml(RACES[race].people)}</span></span>
        </span>
        <span class="lw-card__body">${escapeHtml(RACES[race].description)}</span>
        <ul class="lw-card__list">${RACES[race].traits.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>
      </button>`,
    )
    .join("")}</div>

  <h3 class="lw-title-3">Notifications</h3>
  <ul class="sg-stack sg-toasts">
    <li class="lw-toast lw-toast--good">Bourg achevé.</li>
    <li class="lw-toast lw-toast--bad">Les Gnolls du Croc-Noir vous attaquent avec 12 000 troupes !</li>
    <li class="lw-toast lw-toast--info">La guerre commence !</li>
    <li class="lw-toast">Message neutre.</li>
  </ul>

  <h3 class="lw-title-3">Modale</h3>
  <div class="sg-modal-frame">
    <div class="lw-modal sg-modal-inline">
      <div class="lw-panel lw-modal__dialog" role="dialog" aria-label="Exemple de modale">
        <h4 class="lw-modal__title lw-title-2">Victoire !</h4>
        <p>Le continent de Valdren s'incline devant votre bannière.</p>
        <div class="lw-modal__actions"><button class="lw-button lw-button--primary">Retour au menu</button></div>
      </div>
    </div>
  </div>
  `,
)}
${section(
  "habillages",
  "Habillages de faction",
  "La carte reste l'Atlas ; l'interface prend la matière du peuple joué. <code>.lw-skin .lw-skin--{race}</code> redéfinit les tokens sémantiques (fonds, textes, bordures, bouton principal, police des titres) : les composants qu'il contient suivent sans autre règle. Tokens : <code>--lw-skin-{race}-*</code>.",
  `<div class="sg-grid">${ALL_RACES.map(
    (race) => `<div class="lw-skin lw-skin--${race}">
      <div class="lw-panel sg-demo-panel">
        <div class="lw-panel__header"><h4 class="lw-title-3">${escapeHtml(RACES[race].name)}</h4>
          <span class="lw-shield lw-shield--hatched lw-tincture-${raceTincture(race)}" aria-hidden="true"><span>${RACES[race].emblem}</span></span></div>
        <div class="lw-stat"><span class="lw-stat__label">Or</span><span class="lw-stat__value">18,4 k</span></div>
        <div class="lw-stat"><span class="lw-stat__label">Troupes</span><span class="lw-stat__value">52 k / 90 k</span></div>
        <div class="lw-progress"><div class="lw-progress__fill" style="width: 58%"></div></div>
        <div class="sg-row"><span class="lw-badge lw-text-accent">Accent</span><span class="lw-badge lw-badge--success">Allié</span><span class="lw-badge lw-badge--danger">Parjure</span><span class="lw-badge lw-badge--info">Neutre</span></div>
        <div class="sg-row"><button class="lw-button lw-button--primary">Lever l'ost</button><button class="lw-button">Secondaire</button></div>
        <ul class="sg-stack sg-toasts"><li class="lw-toast lw-toast--bad">Une attaque déferle sur vos terres !</li></ul>
      </div>
    </div>`,
  ).join("")}</div>`,
)}
</main>
<footer class="sg-footer lw-text-xs lw-text-muted">Généré depuis les tokens — modifiez <code>tokens.ts</code>, puis <code>npm run tokens</code>.</footer>
`;

// Démonstration du menu radial : centré sur le bouton.
const radial = new RadialMenu(document.body);
document.querySelector<HTMLButtonElement>("#sg-radial")?.addEventListener("click", (e) => {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  radial.open(rect.left + rect.width / 2, rect.top + rect.height / 2, {
    center: {
      label: "Attaquer",
      hint: "20 % · 12,4 k troupes",
      icon: "⚔",
      tone: "attack",
      run: () => undefined,
    },
    ring: [
      {
        label: "Proposer une alliance",
        hint: "touche K",
        icon: "⚭",
        tone: "ally",
        run: () => undefined,
      },
      { label: "Débarquer", hint: "touche B", icon: "⛵", tone: "boat", run: () => undefined },
      {
        label: "Bâtir : Bourg",
        hint: "125 k or",
        icon: { image: "/art/buildings/bourg.webp" },
        tone: "build",
        disabled: true,
      },
    ],
  });
});
