---
name: verifier
description: Lance toute la chaîne de vérification de LegionWar (types, lint, formatage, tests, build) et résume le résultat. À utiliser avant de déclarer une tâche terminée, avant un commit, ou quand l'utilisateur demande « est-ce que tout passe ? ».
---

# Vérifier le projet

1. Depuis la racine du dépôt, lance `npm run verify`. Elle enchaîne `typecheck`, `lint`, `format:check`, `test` et `build`, et s'arrête à la première erreur.
2. Si une étape échoue :
   - **format:check** : lance `npm run format`, puis relance `npm run verify`.
   - **lint** : essaie `npm run lint:fix`. Corrige à la main ce qui reste, sans désactiver de règle (surtout pas les règles de déterminisme du moteur).
   - **typecheck**, **test** ou **build** : diagnostique la cause réelle et corrige-la. Ne modifie jamais un test pour le faire passer, sauf si le test lui-même est faux, et dis-le explicitement.
3. Relance jusqu'à ce que tout passe, ou jusqu'à rencontrer un blocage qui demande une décision de l'utilisateur.
4. Rends un résumé court :
   - le résultat de chaque étape (✅ / ❌) ;
   - le nombre de tests passés ;
   - les corrections appliquées ;
   - ce qui reste en échec, avec l'extrait d'erreur utile.

Ne dis jamais que « tout passe » sans avoir vu la sortie de `npm run verify` se terminer sans erreur.
