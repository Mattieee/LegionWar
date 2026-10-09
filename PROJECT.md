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
| Serveur relais WebSocket (lobby, tours, reconnexion) et tests                                     | ✅      |
| Multijoueur branché dans le client                                                                | ⏳ v0.2 |

## Feuille de route

| Phase                       | Objectif                 | Contenu principal                                                                                                     |
| --------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| **v0.1** Prototype ✅       | Valider la boucle de jeu | Voir le tableau ci-dessus                                                                                             |
| **v0.2** Multijoueur        | Jouer à plusieurs        | Écran de lobby, connexion du client au serveur relais, détection de désynchronisation (hash), reconnexion, spectateur |
| **v0.3** Bâtiments complets | Profondeur économique    | Port, Comptoir et routes commerciales (caravanes), bâtiments propres à chaque race, amélioration des bâtiments        |
| **v0.4** Naval              | Débarquements            | Barges de transport, navires de guerre, nefs marchandes                                                               |
| **v0.5** Magie              | Le « nucléaire » fantasy | Sanctuaire, sorts mineur/majeur/ultime par race, Bastion runique (contre-sort), terres maudites                       |
| **v0.6** Diplomatie         | Couche sociale           | Alliances, trahison, embargo, dons, emojis, messages rapides                                                          |
| **v0.7** IA Seigneurs       | Adversaires crédibles    | Nations IA liées à la carte, 4 niveaux de difficulté                                                                  |
| **v0.8** Contenu            | Rejouabilité             | Cartes dessinées (Valdren), modes Équipes, temps de paix, cycle jour/nuit, héros (à étudier)                          |
| **v1.0** Lancement          | Ouverture publique       | Comptes, classements, file publique, hébergement, modération, internationalisation                                    |

## Journal des décisions

| Date       | Décision                                                                  | Raison                                                                                |
| ---------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 2026-10-09 | **Réécriture propre**, sans fork d'OpenFront                              | Liberté de licence et maîtrise totale du code ; le code d'OpenFront est sous AGPL-3.0 |
| 2026-10-09 | **4 races asymétriques** sur un socle de règles commun                    | Saveur Warcraft III tout en gardant l'équilibrage maîtrisable                         |
| 2026-10-09 | **Lockstep déterministe** : le serveur relaie, les clients simulent       | Des centaines de joueurs pour un coût serveur minimal ; replays gratuits              |
| 2026-10-09 | **Canvas 2D** pour le prototype, WebGL plus tard si besoin                | Simple et suffisant jusqu'à environ 1 M de tuiles ; mesuré : tick moteur de 1 à 2 ms  |
| 2026-10-09 | **JSON** sur WebSocket (pas de format binaire pour l'instant)             | Débogage simple ; un format binaire pourra venir à l'échelle                          |
| 2026-10-09 | **Aucun outil cloud Anthropic** (Artifacts, Claude Docs, agents distants) | Exigence du porteur de projet ; tout reste dans le dépôt                              |
| 2026-10-09 | Univers et noms **100 % originaux**                                       | Éviter toute propriété intellectuelle de Blizzard                                     |

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
- **Direction artistique** : pixel art, ou illustration vectorielle peinte ? Qui produit les assets ?
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
