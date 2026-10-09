# CLAUDE.md

@AGENTS.md

## Règles propres à Claude Code

### Isolation : rien dans le cloud Anthropic

C'est une **règle absolue** de ce projet.

- **Jamais d'Artifact Claude** : ne pas publier, lire ou commenter d'artifact.
- **Jamais de Claude Docs** ni d'autre stockage hébergé par Anthropic.
- **Pas d'agent distant** (`isolation: "remote"`), **pas de routine cloud** (`/schedule`) ni de déclencheur distant.
- Tous les livrables (docs, specs, maquettes, rapports) sont des **fichiers du dépôt**, en Markdown ou en HTML local.
- Ces outils sont aussi bloqués dans `.claude/settings.json`. Ne jamais lever ce blocage.

### Façon de travailler

- **Avant de dire « terminé »**, lancer `npm run verify` (ou la skill `/verifier`) et donner le résultat réel.
- Pour toute modification de `packages/engine`, faire relire le diff par le sous-agent **`gardien-determinisme`**.
- Pour une modification d'équilibrage ou de règle, consulter le sous-agent **`game-designer`** et mettre à jour `docs/GDD.md`.
- Pour une revue générale (qualité, sécurité web, performances), utiliser le sous-agent **`relecteur-code`**.
- Pour ajouter un bâtiment ou une unité, suivre la skill **`/ajouter-batiment`**.
- Ne pas committer ni pousser sans demande explicite de l'utilisateur.

### Sous-agents et skills du projet

| Type       | Nom                    | Rôle                                                           |
| ---------- | ---------------------- | -------------------------------------------------------------- |
| Sous-agent | `gardien-determinisme` | Vérifie qu'un changement du moteur reste déterministe          |
| Sous-agent | `game-designer`        | Équilibrage, cohérence avec le GDD, propositions de règles     |
| Sous-agent | `relecteur-code`       | Revue qualité, sécurité web, performances, accessibilité       |
| Skill      | `/verifier`            | Lance toute la chaîne de vérification et en résume le résultat |
| Skill      | `/ajouter-batiment`    | Procédure complète pour ajouter un bâtiment ou une unité       |
