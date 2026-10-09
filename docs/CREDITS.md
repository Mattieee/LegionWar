# Crédits et licences des assets

Tout asset ajouté au projet (police, image, son, musique) doit figurer ici avec sa source et sa licence.

## Polices

| Police             | Auteur                                               | Licence                   | Source                                 | Usage                          |
| ------------------ | ---------------------------------------------------- | ------------------------- | -------------------------------------- | ------------------------------ |
| IM Fell English SC | Igino Marini (d'après les fontes de John Fell, 1670) | SIL Open Font License 1.1 | `@fontsource/im-fell-english-sc` (npm) | Titres, boutons, libellés      |
| IM Fell English    | Igino Marini (d'après les fontes de John Fell, 1670) | SIL Open Font License 1.1 | `@fontsource/im-fell-english` (npm)    | Textes d'ambiance (italique)   |
| EB Garamond        | Georg Duffner, Octavio Pardo                         | SIL Open Font License 1.1 | `@fontsource/eb-garamond` (npm)        | Texte d'interface, chiffres    |
| Cinzel             | The Cinzel Project Authors (Natanael Gama)           | SIL Open Font License 1.1 | `@fontsource/cinzel` (npm)             | Titres de l'habillage Aldoria  |
| Grenze Gotisch     | The Grenze Gotisch Project Authors (Omnibus-Type)    | SIL Open Font License 1.1 | `@fontsource/grenze-gotisch` (npm)     | Titres de l'habillage Kharag   |
| UnifrakturMaguntia | j. « mach » wust, Peter Wiegel                       | SIL Open Font License 1.1 | `@fontsource/unifrakturmaguntia` (npm) | Titres de l'habillage Morvane  |
| Uncial Antiqua     | Brian J. Bonislawsky (Astigmatic)                    | SIL Open Font License 1.1 | `@fontsource/uncial-antiqua` (npm)     | Titres de l'habillage Sylvanor |

## Images générées

Budget total autorisé : **10 €**. Toute génération doit être validée au préalable (liste et coût estimé).

Le détail ligne à ligne (tokens, coût mesuré) est dans `tools/assets/ledger.json` ; les consignes
de génération dans `tools/assets/prompts.json`. Images générées par IA (OpenAI), sans reprise
d'œuvre existante.

Les originaux (PNG, non versionnés) sont dans `tools/assets/originals/` ; `npm run assets:optimize`
en tire les WebP du jeu (`packages/client/public/art/`) et le grain de papier du design system.

| Date       | Lot                                                                                                                                                             | Modèle              | Qualité / taille                      | Coût   | Cumul         |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------- | ------ | ------------- |
| 2026-10-09 | Premier passage, 22 images : papiers, rose des vents, cartouches, frontispice, 6 bâtiments, 4 emblèmes, 3 monstres marins, 3 navires (16 retenues, 6 à refaire) | gpt-image-2.5-flare | moyenne 1024 px (frontispice : haute) | 0,30 € | 0,30 € / 10 € |
| 2026-10-09 | Second passage, 6 images refaites sur fond opaque : serpent de mer, kraken, galion, drakkar, bastion, sanctuaire                                                | gpt-image-2.5-flare | moyenne 1024 px                       | 0,08 € | 0,38 € / 10 € |

## Sons et musiques

_(aucun pour l'instant)_
