# Design system de LegionWar

> **Référence vivante :** `npm run dev`, puis **http://localhost:5173/design-system.html**. Toutes les couleurs, tailles et composants y sont générés depuis le code.
> **Code :** `packages/design-system` (package `@legionwar/design-system`).
> **Exploration :** les six pistes étudiées sont dans [`docs/moodboards/index.html`](moodboards/index.html).

## Direction artistique : « Atlas + Héraldique »

Retenue le 9 octobre 2026, parmi les six moodboards.

- **La carte est un atlas gravé de la Renaissance** : papier vergé, encre sépia, hachures côtières, lavis d'aquarelle pour les royaumes, frontières à l'encre.
- **Chaque seigneur porte ses armoiries** : émail, écu, bannière à queue d'aronde. On reconnaît un joueur sans lire son nom.
- **L'interface se réduit à des cartouches de cartographe** posés sur la feuille : papier, double filet, capitales d'imprimerie.
- **Le souffle épique** (sorts, trahisons, victoires) viendra de miniatures enluminées en plein écran, ponctuelles (à venir).

**Références :**

- atlas de Blaeu et Ortelius ;
- carte « papier » de Crusader Kings III ;
- cartes de la Terre du Milieu ;
- armoriaux médiévaux et système de hachures de Petra Sancta ;
- _The Banner Saga_ pour les bannières.

## Principes

1. **La carte est le jeu.** L'interface n'est faite que de cartouches discrets ; rien ne doit masquer le front.
2. **Chaque seigneur porte ses armoiries.** Émail, écu, bannière ; les hachures héraldiques codent les émaux pour les daltoniens.
3. **De l'encre, pas du plastique.** Traits, hachures, grain du papier. Jamais de dégradé brillant ni de lueur générique : c'est ce qui donnait le « look IA » de la première version.
4. **Lisible en un coup d'œil.** Chiffres tabulaires dans le HUD, contraste AA minimum (vérifié par les tests), la couleur n'est jamais seule porteuse d'information.
5. **Une source de vérité.** Tout passe par les tokens : aucune couleur en dur dans les composants ni dans le jeu.

## Architecture

```
packages/design-system/
  src/tokens.ts          ← SOURCE UNIQUE : tous les tokens (typés)
  src/resolve.ts         alias {a.b.c}, génération du CSS
  src/color.ts           conversions, contraste WCAG
  src/index.ts           API TypeScript (tokens, tokenRgb, raceColor, raceTincture, playerColor…)
  src/css/tokens.css     GÉNÉRÉ (npm run tokens) : variables --lw-*
  src/css/fonts.css      polices embarquées (latin)
  src/css/base.css       la table, le papier, typographie, focus, accessibilité
  src/css/components.css composants .lw-*
  src/assets/            grain de papier des panneaux (paper-grain.webp)
  src/css/index.css      point d'entrée (styles.css)
  test/tokens.test.ts    garde-fous (voir plus bas)
```

| Où                   | Comment                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| CSS / DOM            | `import "@legionwar/design-system/styles.css"` une fois par page, puis `var(--lw-…)` et les classes `.lw-…` |
| Canvas (carte)       | `tokenRgb("map.terrain.forest")`, `tokens.map.washInterior`, `playerColor(id, isBot)`                       |
| Armoiries d'une race | `raceTincture(race)` → `"azure"` (classe `.lw-tincture-azure`) ; `raceColor(race)` → hexadécimal            |

## Tokens

Il y a trois niveaux, et une règle : **les composants n'utilisent que les niveaux 2 et 3**.

| Niveau         | Groupes                                                                                                                                      | Exemple                                       |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 1. Primitives  | `color` (paper, ink, garance, gules, indigo, verdigris, wine, sienna, table), `font`, `space`, `radius`, `shadow`, `duration`, `easing`, `z` | `--lw-color-ink-700`                          |
| 2. Sémantiques | `bg`, `text`, `border`, `action`, `feedback`, `focus`, `progress`                                                                            | `--lw-text-accent`                            |
| 3. Domaine jeu | `heraldry` (8 émaux), `race` (émail de chaque peuple), `map` (rendu Canvas)                                                                  | `--lw-heraldry-azure`, `--lw-map-terrain-sea` |

Les espacements, tailles de police, rayons, ombres, durées et z-index sont des primitives sans intention de couleur : on les utilise directement.

### Couleurs sémantiques

| Token                                                | Rôle                                                                         |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| `bg-app`                                             | La table sombre sous la feuille (seul `text-inverse` y est lisible)          |
| `bg-surface` / `bg-raised` / `bg-inset`              | Papier du cartouche / papier clair (cartes, touches) / papier foncé (champs) |
| `text-primary` / `text-secondary`                    | Encre sépia foncée / encre moyenne                                           |
| `text-accent`                                        | Garance (rubriques, valeurs clés, lien)                                      |
| `text-danger` / `text-success` / `text-info`         | Gueules foncé / vert-de-gris / indigo (≥ 4,5:1 sur le papier)                |
| `feedback-*`                                         | Bordures et pastilles d'état (≥ 3:1)                                         |
| `border-subtle` / `border-default` / `border-strong` | Filets d'encre légers / normaux / appuyés                                    |
| `action-primary-*`                                   | Bouton principal : garance, texte papier, filet intérieur                    |

### Héraldique

| Émail          | Token              | Hachure (Petra Sancta) | Peuple   |
| -------------- | ------------------ | ---------------------- | -------- |
| Azur           | `heraldry-azure`   | horizontales           | Aldoria  |
| Gueules        | `heraldry-gules`   | verticales             | Kharag   |
| Pourpre        | `heraldry-purpure` | diagonales senestres   | Morvane  |
| Sinople (vert) | `heraldry-vert`    | diagonales dextres     | Sylvanor |
| Or             | `heraldry-or`      | points                 | —        |
| Argent         | `heraldry-argent`  | uni                    | —        |
| Sable          | `heraldry-sable`   | — (contours)           | —        |
| Tenné          | `heraldry-tenne`   | croisillons            | —        |

### Carte (Canvas)

| Élément           | Rendu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Papier et terrain | Plaine, côte, forêt, collines et montagnes en teintes de papier ; grain stable par tuile                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Mer               | Mer pâle, plus foncée au large ; **hachures côtières gravées** à 1, 3, 5 et 8 tuiles de la côte (`coastLine`, `coastLineStrength`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Royaumes          | **Lavis d'aquarelle** : pigment multiplié sur le papier, `washInterior` (36 %) au centre, `washEdge` (58 %) à 2 tuiles du bord                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Frontières        | Encre teintée de la couleur du royaume (`borderInk`, 55 %)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Hors carte        | La table (`map.table`), une ombre portée de la feuille et un vignettage d'écran                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Bâtiments         | **Gravures** (`/art/buildings/*.webp`) marquées d'un petit **écu** aux couleurs du propriétaire ; 4,2 tuiles, jamais moins de 16 px                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Haute mer         | **Rose des vents, monstres marins et navires gravés** (`/art/sea/*.webp`), à 50 % d'opacité, posés loin des côtes, stables par carte                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Batailles         | **Ligne de front** sur les tuiles prises de force : sur vos fronts, **vert** là où vous gagnez du terrain (`map.battle.outgoing`) et **rouge** là où vous en perdez (`map.battle.incoming`), en 1 s ; ailleurs, brève ombre d'encre (`map.battle.capture`). **Chiffre du front** sans cadre, qui suit la ligne de front (prises du dernier tick) : ⚔ + troupes engagées, vert pour vos attaques, rouge quand on vous attaque, encre pour les autres (visibles à partir de 2,5 px par tuile). **Cadre d'alerte** pulsant sur les bords de l'écran quand une attaque vous vise (au plus une fois par 15 s, sans pulsation si les animations sont réduites) |
| Diplomatie        | **Liseré allié** : frontière avec un allié en pointillé vert (`map.ally`) ; **Parjure** : nom en gueules (`map.parjure`) et écu fêlé, ✗ dans le classement ; **Couronne** ♛ en or (`map.crown`) au-dessus du royaume qui tient au moins 35 % des terres. Cartes de demande et de renouvellement en haut de l'écran, avec barre de temps                                                                                                                                                                                                                                                                                                                  |
| Commerce          | **Nefs** gravées (`/art/sea/cog.webp`) marquées de l'écu de leur maître ; **routes des caravanes** en trait fin continu à l'encre (`map.road`, 50 %), lissées, sous les bâtiments, masquées sous 0,9 px par tuile ; **caravanes** en chariot bâché dessiné au Canvas (bâche aux couleurs du maître, caisse et roues à l'encre), 9 px au moins, un point quand on dézoome ; **« +X or »** en sienne (`map.trade`) au-dessus de vos ports et étapes ; à la pose d'un Marché, cercle de portée et traits vers les étapes reliées                                                                                                                            |
| Noms              | Capitales IM Fell sur un halo de papier ; écu de la race pour les seigneurs ; troupes en italique                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

### Typographie

| Rôle                            | Police                                                                                | Token                      |
| ------------------------------- | ------------------------------------------------------------------------------------- | -------------------------- |
| Titres, boutons, libellés       | **IM Fell English SC** (capitales de l'imprimerie Fell, 1670)                         | `--lw-font-family-display` |
| Ambiance, statistiques, journal | **IM Fell English** italique                                                          | `--lw-font-family-flavor`  |
| Interface et chiffres           | **EB Garamond** 400/500/600 (chiffres elzéviriens dans le texte, alignés dans le HUD) | `--lw-font-family-body`    |

Les titres (`h1`–`h4`, `lw-display`, `lw-card__title`) passent par `--lw-font-family-title`, qui vaut la police d'affichage par défaut et la police du peuple dans un habillage de faction (voir plus bas).

Toutes sont sous licence SIL OFL 1.1 et embarquées par Vite (sous-ensemble latin, aucun CDN).

### Habillages de faction (« matières de faction »)

Choisis sur [moodboards/factions.html](moodboards/factions.html) : **la carte reste l'Atlas, l'interface prend la matière du peuple joué.** `lw-skin lw-skin--{race}` redéfinit les tokens sémantiques (fonds, textes, bordures, boutons, police des titres) ; tous les composants `.lw-*` qu'il contient suivent. Les panneaux y prennent la texture du peuple.

| Peuple   | Matière                                         | Police des titres  | Tokens                 |
| -------- | ----------------------------------------------- | ------------------ | ---------------------- |
| Aldoria  | Pierre de taille, filet d'or, bouton azur       | Cinzel             | `--lw-skin-aldoria-*`  |
| Kharag   | Planches clouées, rivets de fer, bouton gueules | Grenze Gotisch     | `--lw-skin-kharag-*`   |
| Morvane  | Crypte d'améthyste, filet d'os, lueur verdâtre  | UnifrakturMaguntia | `--lw-skin-morvane-*`  |
| Sylvanor | Écorce veinée, pierre de lune, coins en feuille | Uncial Antiqua     | `--lw-skin-sylvanor-*` |

- **En jeu :** tout le HUD porte l'habillage du peuple joué, sauf la modale de fin, qui reste sur papier (son cartouche est une gravure à l'encre).
- **Menu :** chaque carte de peuple affiche son nom dans la police du peuple.
- **Carte :** les noms des seigneurs s'écrivent dans la police de leur peuple à partir de 13 px, en police d'atlas en dessous.
- Ne jamais poser une gravure à l'encre sur fond transparent dans un habillage sombre.

## Composants

Convention BEM préfixée : `.lw-bloc`, `.lw-bloc__element`, `.lw-bloc--variante`. **Les états passent par l'ARIA** (`aria-pressed`, `aria-invalid`, `disabled`, `hidden`).

| Composant            | Classes                                                                                                                                      | Notes                                                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Cartouche            | `lw-panel` + `--translucent` / `--compact`, `__header`                                                                                       | Papier, double filet d'encre, coins en volute                                                                                                 |
| Bouton               | `lw-button` + `--primary` / `--danger` / `--ghost`, `--sm` / `--lg`                                                                          | Pastille d'encre ; principal en garance                                                                                                       |
| Champ                | `lw-field`, `__label`, `__hint`, `__error` ; `lw-input`, `lw-select`, `lw-range`                                                             | Papier creusé, filet inférieur ; `aria-invalid`                                                                                               |
| **Écu**              | `lw-shield` + `lw-tincture-{émail}`, `--hatched`, `--lg`                                                                                     | Contenu = emblème ; `--hatched` ajoute la hachure héraldique                                                                                  |
| **Bannière**         | `lw-banner` + `lw-tincture-{émail}`                                                                                                          | Queue d'aronde                                                                                                                                |
| **Fleuron**          | `lw-ornament` (contenu : ❦)                                                                                                                  | Filet avec ornement central                                                                                                                   |
| Filet                | `lw-divider`                                                                                                                                 | Double filet d'encre                                                                                                                          |
| Touche               | `lw-kbd`                                                                                                                                     | Raccourcis clavier                                                                                                                            |
| Badge                | `lw-badge` + `--success` / `--danger` / `--info`                                                                                             | Statut court                                                                                                                                  |
| Statistique          | `lw-stat`, `__label`, `__value`                                                                                                              | Libellé en italique, valeur en chiffres alignés                                                                                               |
| Jauge                | `lw-progress`, `__fill`, `--danger`                                                                                                          | Remplissage hachuré, comme un lavis gravé                                                                                                     |
| Carte sélectionnable | `lw-card`, `__head`, `__title`, `__subtitle`, `__body`, `__list`                                                                             | Accent via `--lw-card-accent` ; `aria-pressed`                                                                                                |
| Notification         | `lw-toast` + `--good` / `--bad` / `--info`                                                                                                   | Billet de papier, italique                                                                                                                    |
| Modale               | `lw-modal`, `__dialog`, `__title`, `__actions`                                                                                               | `role="dialog"`, focus sur l'action                                                                                                           |
| Habillage de faction | `lw-skin` + `lw-skin--{race}`                                                                                                                | Redéfinit les tokens sémantiques ; voir ci-dessus                                                                                             |
| Menu radial          | `lw-radial`, `__item` (+ `--attack`, `--boat`, `--ally`, `--build`, `--gold`, `--danger`, `--disabled`), `__center`, `__sector`, `__tooltip` | Clic droit sur la carte (comme OpenFront) : action principale au centre (rayon 30), anneau 40–95 px ; construit en SVG par `ui/RadialMenu.ts` |
| Menu contextuel      | `lw-menu` (confirmations : rupture d'alliance), `__header`, `__title`, `__subtitle`, `__item` (+ `--danger`), `__hint`, `__separator`        | `role="menu"`, flèches / Entrée / Échap ; textes via `textContent`                                                                            |
| Infobulle            | attribut `data-tooltip="…"`                                                                                                                  | Encre sur papier inversé                                                                                                                      |
| Typographie          | `lw-display`, `lw-title-1..3`, `lw-flavor`, `lw-overline`, `lw-text-sm/xs`, `lw-text-muted`, `lw-text-accent`, `lw-numeric`                  |                                                                                                                                               |

## Garde-fous automatiques (`npm test`)

- `tokens.css` doit être à jour (sinon, lancer `npm run tokens`), et tous les alias doivent se résoudre.
- Chaque race porte un émail héraldique valide ; les émaux (hors or et argent) se distinguent du papier (≥ 3:1).
- **Aucune couleur primitive ni code hexadécimal** dans `base.css`, `components.css` et `packages/client/src/styles.css`.
- **Contrastes WCAG 2.1 AA :**
  - textes ≥ 4,5:1 sur tous les papiers ;
  - texte inversé ≥ 4,5:1 sur la table ;
  - étiquettes de la carte ≥ 4,5:1 sur la plaine, la montagne et leur halo ;
  - boutons ≥ 4,5:1, au repos comme au survol ;
  - focus et bordures ≥ 3:1 ;
  - pour chaque habillage de faction : textes ≥ 4,5:1 sur ses trois fonds, bouton principal ≥ 4,5:1, filet ≥ 3:1.

## Faire évoluer le système

| Besoin                   | Démarche                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Changer une couleur      | Modifier `tokens.ts`, puis `npm run tokens` et `npm test` (le contraste est vérifié)                                                 |
| Nouvelle intention       | Ajouter un token **sémantique** qui pointe sur une primitive, jamais une couleur en dur                                              |
| Nouveau composant        | `components.css` (préfixe `lw-`, tokens uniquement), page de référence (`packages/client/src/styleguide/main.ts`), tableau ci-dessus |
| Style d'un écran         | Feuille de l'écran (ex. `packages/client/src/styles.css`) : placement et tokens uniquement                                           |
| Nouvelle police ou image | Licence compatible, et entrée dans [`CREDITS.md`](CREDITS.md)                                                                        |

## Assets graphiques (à venir)

- **Génération :** les ornements gravés (rose des vents, cartouches, monstres marins), les icônes de bâtiments, les meubles héraldiques et les miniatures de sorts pourront être générés avec la clé OpenAI du projet, **toujours après validation de la liste et du coût estimé**, dans un budget total de **10 € maximum**.
- **Suivi :** chaque asset est tracé dans `CREDITS.md`.
