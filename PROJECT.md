# PROJECT.md — LegionWar

> Fiche projet : vision, périmètre, feuille de route, décisions et risques. Les instructions pour les agents IA sont dans [AGENTS.md](AGENTS.md), le design détaillé dans [docs/GDD.md](docs/GDD.md).

|                      |                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Nom**              | LegionWar                                                                                                    |
| **Dépôt**            | https://github.com/Mattieee/LegionWar                                                                        |
| **Genre**            | Conquête territoriale en temps réel, massivement multijoueur, dans le navigateur                             |
| **Univers**          | Médiéval-fantastique original, dans l'esprit de Warcraft III : le continent de Valdren et ses quatre peuples |
| **Plateforme cible** | Navigateur desktop et mobile ; un portage desktop (Steam) est envisageable plus tard                         |
| **Langue**           | Français, l'internationalisation est prévue                                                                  |
| **Version**          | 0.1.0, prototype solo                                                                                        |
| **Démarrage**        | 9 octobre 2026                                                                                               |

## Vision

> _« Levez vos bannières, étendez votre royaume tuile par tuile, et faites plier le continent — par l'épée, l'or ou la magie. »_

LegionWar reprend la boucle addictive des jeux de territoire (OpenFront.io, Territorial.io) : on démarre avec un petit fief, on s'étend, on se bat, on s'allie et on trahit. Le jeu y ajoute la **saveur d'un RTS fantasy** : des races asymétriques, des bâtiments thématiques, des sorts dévastateurs à la place des bombes nucléaires et des créatures neutres à soumettre.

### Piliers

1. **Immédiat** : on joue en 5 secondes, sans compte ni tutoriel obligatoire.
2. **Stratégique** : chaque race impose un style (marchand-bâtisseur, conquérant, nécromancien, guérillero sylvestre).
3. **Social** : alliances éphémères, trahisons, coups de théâtre, des dizaines de joueurs sur une même carte.
4. **Juste** : une simulation déterministe et un serveur qui fait autorité sur l'ordre des actions ; pas de pay-to-win.

### Public

Les joueurs de .io et de RTS nostalgiques de Warcraft III, pour des sessions de 15 à 30 minutes.

## Périmètre de la version actuelle (v0.1 — prototype)

| Fonctionnalité                                                                                    | Statut  |
| ------------------------------------------------------------------------------------------------- | ------- |
| Monorepo TypeScript (engine / shared / server / client), outillage (ESLint, Prettier, Vitest, CI) | ✅      |
| Moteur déterministe : PRNG, maths déterministes, hash d'état                                      | ✅      |
| Carte procédurale (plaine, forêt, collines, montagnes, pics, lacs, océan) et mines d'or           | ✅      |
| Déploiement, expansion, attaques entre joueurs, annexion, victoire à 80 %                         | ✅      |
| Économie : troupes (plafond et régénération), or, mines                                           | ✅      |
| 4 races avec leurs modificateurs (Aldoria, Kharag, Morvane, Sylvanor)                             | ✅      |
| Bâtiments : Bourg, Tour de garde                                                                  | ✅      |
| IA « tribus sauvages »                                                                            | ✅      |
| Client : menu, choix de race, rendu Canvas, caméra, HUD, classement, journal                      | ✅      |
| Design system : tokens, composants `.lw-*`, polices embarquées, page de référence, tests WCAG     | ✅      |
| Serveur relais WebSocket (lobby, tours, reconnexion) et tests                                     | ✅      |
| Barges de débarquement (route maritime, tête de pont, 3 par seigneur) — avancé depuis la v0.4     | ✅      |
| Multijoueur branché dans le client                                                                | ⏳ v0.2 |

## Feuille de route

| Phase                        | Objectif                    | Contenu principal                                                                                                              |
| ---------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **v0.1** Prototype ✅        | Valider la boucle de jeu    | Voir le tableau ci-dessus                                                                                                      |
| **v0.2** Multijoueur         | Jouer à plusieurs           | Écran de lobby, connexion du client au serveur relais, détection de désynchronisation (hash), reconnexion, spectateur          |
| **v0.2b** Peuples marqués ✅ | Des factions à part entière | Habillage d'interface par peuple, mécaniques propres (remparts, pillage, levée des charniers, bosquets), rééquilibrage chiffré |
| **v0.3** Bâtiments complets  | Profondeur économique       | Port, Comptoir et routes commerciales (caravanes), bâtiments propres à chaque race, amélioration des bâtiments                 |
| **v0.4** Naval               | Débarquements               | ~~Barges de transport~~ (livré), navires de guerre, nefs marchandes                                                            |
| **v0.5** Magie               | Le « nucléaire » fantasy    | Sanctuaire, sorts mineur/majeur/ultime par race, Bastion runique (contre-sort), terres maudites                                |
| **v0.6** Diplomatie          | Couche sociale              | ~~Alliances, trahison, dons~~ (moteur et interface livrés ; IA diplomatique à affiner), embargo, emojis, messages rapides      |
| **v0.7** IA Seigneurs        | Adversaires crédibles       | ~~Prétendants, 4 niveaux~~ (v1 livrée), nations liées à la carte, IA diplomatique affinée                                      |
| **v0.8** Contenu             | Rejouabilité                | Cartes dessinées (Valdren), modes Équipes, temps de paix, cycle jour/nuit, héros (à étudier)                                   |
| **v1.0** Lancement           | Ouverture publique          | Comptes, classements, file publique, hébergement, modération, internationalisation                                             |

## Journal des décisions

| Date       | Décision                                                                                                                                                                                         | Raison                                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-09 | **Réécriture propre**, sans fork d'OpenFront                                                                                                                                                     | Liberté de licence et maîtrise totale du code ; le code d'OpenFront est sous AGPL-3.0                                                                      |
| 2026-10-09 | **4 races asymétriques** sur un socle de règles commun                                                                                                                                           | Saveur Warcraft III tout en gardant l'équilibrage maîtrisable                                                                                              |
| 2026-10-09 | **Lockstep déterministe** : le serveur relaie, les clients simulent                                                                                                                              | Des centaines de joueurs pour un coût serveur minimal ; replays gratuits                                                                                   |
| 2026-10-09 | **Canvas 2D** pour le prototype, WebGL plus tard si besoin                                                                                                                                       | Simple et suffisant jusqu'à environ 1 M de tuiles ; mesuré : tick moteur de 1 à 2 ms                                                                       |
| 2026-10-09 | **JSON** sur WebSocket (pas de format binaire pour l'instant)                                                                                                                                    | Débogage simple ; un format binaire pourra venir à l'échelle                                                                                               |
| 2026-10-09 | **Aucun outil cloud Anthropic** (Artifacts, Claude Docs, agents distants)                                                                                                                        | Exigence du porteur de projet ; tout reste dans le dépôt                                                                                                   |
| 2026-10-09 | **Design system maison** (tokens TS → CSS généré, composants `.lw-*`)                                                                                                                            | Une seule source pour le DOM et le Canvas ; contraste vérifié par les tests                                                                                |
| 2026-10-09 | Direction artistique **« Atlas + Héraldique »** (choisie parmi 6 moodboards)                                                                                                                     | La carte est le cœur du jeu ; les armoiries rendent 60 joueurs lisibles et accessibles                                                                     |
| 2026-10-09 | Polices **IM Fell English (SC)** + **EB Garamond** (OFL), embarquées                                                                                                                             | Typographie d'atlas du XVIIe siècle, Garamond lisible pour le HUD                                                                                          |
| 2026-10-10 | **La Couronne se paie en sang** (pertes ×1,5 contre les royaumes), bonus « grand territoire » seulement en défense, **Crépuscule** à 20 min (−3 points/min) et **limite à 35 min** (GDD §6, §14) | Partie médiane 8,6 → 12,7 min, toutes terminées avant 35 min ; on s'écarte d'OpenFront sur le bonus « grand territoire », qui accélérait la boule de neige |
| 2026-10-10 | **IA des prétendants réglée** : attaque dès 1,25:1, barges vers les îles, trahison quand ils sont enfermés, plus de nuances de peuple ; Morvane à −5 % de régénération (GDD §13.3)               | 44 % des parties à 4 prétendants restaient sans vainqueur ; mesuré sur 400 parties, chaque peuple mène 22 à 29 %                                           |
| 2026-10-10 | **Diplomatie comme OpenFront**, avec trois types de joueurs : seigneur, **prétendant** (IA qui bâtit, s'allie, trahit ; Écuyer à Empereur) et tribu passive (GDD §12–13)                         | Les alliances n'ont de sens qu'avec des rivaux qui jouent comme des humains ; les tribus restent du remplissage                                            |
| 2026-10-10 | **Rythme ralenti** : batailles ×0,25, expansion ×0,5, régénération ×0,5, barges à 1 tuile/tick (GDD §6)                                                                                          | Cartes 9 à 15× plus petites qu'OpenFront : une vague décidait d'une guerre en 7 s ; le joueur doit avoir le temps de réagir                                |
| 2026-10-09 | **Factions marquées** : interface en « matières de faction », carte en Atlas (moodboard `docs/moodboards/factions.html`)                                                                         | Les peuples ne différaient que par des chiffres ; l'habillage du HUD donne le souffle Warcraft sans sacrifier la lisibilité de la carte                    |
| 2026-10-09 | Images IA via OpenAI **sur validation**, budget **10 €**                                                                                                                                         | Assets à moindre coût, dépense maîtrisée                                                                                                                   |
| 2026-10-09 | Univers et noms **100 % originaux**                                                                                                                                                              | Éviter toute propriété intellectuelle de Blizzard                                                                                                          |

## Risques

| Risque                         | Impact             | Parade                                                                                                |
| ------------------------------ | ------------------ | ----------------------------------------------------------------------------------------------------- |
| Désynchronisation multijoueur  | Parties injouables | Règles ESLint, test de déterminisme, hash d'état tous les 10 ticks, sous-agent `gardien-determinisme` |
| Équilibrage des races          | Une race domine    | Simulations automatisées (sous-agent `game-designer`), télémétrie des victoires                       |
| Performance sur grandes cartes | Lags               | Profilage (tick < 5 ms visé), passage au WebGL si le rendu Canvas sature                              |
| Triche                         | Perte de confiance | Validation serveur, horodatage serveur des intents, vote de hash                                      |
| Propriété intellectuelle       | Juridique          | Univers original, crédits des assets, aucun code AGPL copié                                           |
| Toxicité (pseudos, chat)       | Modération         | Pas de chat libre (messages prédéfinis), filtrage des pseudos                                         |

## Questions ouvertes

- **Licence du code** : propriétaire, MIT ou AGPL ? À décider avant toute publication ou contribution externe.
- **Direction artistique** : tranchée (« Atlas + Héraldique », voir `docs/DESIGN_SYSTEM.md`). Reste à décider qui produit les assets illustrés (génération IA validée au cas par cas, budget 10 €, ou illustrateur).
- **Héros** à la Warcraft III : à évaluer après la v0.6 (complexité et équilibrage).
- **Hébergement** du serveur relais : VPS, conteneur… et nom de domaine.
- **Modèle économique** : cosmétiques uniquement ? Aucune décision pour l'instant.

## Glossaire

| Terme           | Définition                                                                          |
| --------------- | ----------------------------------------------------------------------------------- |
| Tick / tour     | Pas de simulation de 100 ms. Le serveur émet un tour par tick.                      |
| Intent          | Action d'un joueur (attaquer, bâtir…), sérialisable et appliquée au début d'un tour |
| Lockstep        | Modèle réseau où tous les clients exécutent les mêmes tours dans le même ordre      |
| Terres libres   | Tuiles sans propriétaire, à conquérir                                               |
| Tribu sauvage   | IA neutre et passive qui occupe la carte (équivalent des « bots » d'OpenFront)      |
| Seigneur        | Joueur humain, ou IA avancée (prévue en v0.7)                                       |
| Terres maudites | Tuiles corrompues par un sort majeur (équivalent du fallout)                        |
