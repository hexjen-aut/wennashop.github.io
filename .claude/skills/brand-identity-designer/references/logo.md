# Système de logo

## Typologies à explorer

| Type | Quand il convient | Risque |
|---|---|---|
| Wordmark | nom court, distinctif, à faire connaître | peu d'usage en petit format |
| Lettermark | nom long ou multi-mots | abstraction, confusion d'initiales |
| Pictogramme | objet/geste identifiable propre au métier | banalité si trop littéral |
| Logo abstrait | positionnement conceptuel, tech, finance | demande du budget de notoriété |
| Emblème | institution, artisanat, tradition, étiquette | illisible en petit, difficile en responsive |
| Combiné | cas le plus sûr pour une marque jeune | demande un symbole qui tient seul |

Recommandation par défaut pour une marque jeune : **combiné**, avec un symbole qui fonctionne seul en avatar.

## Argumentation obligatoire par concept

1. Idée créative
2. Signification du symbole
3. Relation avec l'activité
4. Logique des formes (grille, angles, rayons, rapports)
5. Typographie utilisée et modifications apportées
6. Pertinence commerciale (où il sera vu, par qui)
7. Conditions d'utilisation (tailles, fonds, versions)

## Exigences

Original · lisible · mémorisable · adaptable · reproductible · fonctionnel à 16 px · fonctionnel en monochrome · fonctionnel en négatif.

## Construction SVG — règles

- `viewBox` carré pour le symbole (ex. `0 0 64 64`), rectangulaire pour le lockup.
- Grille explicite : toutes les coordonnées sur une trame (multiples de 2 ou 4 dans le viewBox). Pas de valeurs flottantes arbitraires.
- Formes géométriques déduites : rayons, angles et épaisseurs en rapports simples (1/2, 1/3, 2/3, 1.5×).
- Épaisseur de trait unique, ou deux épaisseurs en rapport franc. Jamais trois épaisseurs proches.
- `fill="currentColor"` sur le symbole pour une colorisation par CSS ; version couleur séparée avec HEX explicites.
- Pas de `<filter>`, pas d'ombre, pas de dégradé dans la version principale. Un dégradé éventuel est une variante secondaire.
- Texte du wordmark : **converti en `<path>`** pour le fichier final (pas de `<text>` qui dépend d'une police installée). Garder une version `<text>` de travail commentée.
- `stroke-linejoin`/`stroke-linecap` cohérents sur tout le système.
- Nettoyer : pas de groupes vides, pas d'attributs inutiles, `id` parlants.
- Optimiser en gardant lisible : indentation conservée, commentaires de construction autorisés en tête.

Squelette :

```svg
<!-- <Marque> — symbole. Grille 64. Épaisseur 6. Rayon ext. 28. -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="<Marque>">
  <title><Marque></title>
  <path d="..." fill="currentColor"/>
</svg>
```

## Variantes à livrer systématiquement

| Fichier | Usage |
|---|---|
| `logo-principal.svg` | usage par défaut, couleur, fond clair |
| `logo-horizontal.svg` | bandeaux, en-têtes, signatures |
| `logo-vertical.svg` | formats carrés, enseignes, packaging |
| `symbole.svg` | avatar, favicon, tampon, application |
| `logo-mono-noir.svg` | impression 1 couleur, fax, gravure |
| `logo-mono-blanc.svg` | fonds sombres et photos |
| `logo-inverse.svg` | détourage dans un bloc de couleur |
| `favicon.svg` + `favicon-32.png` + `apple-touch-icon-180.png` | web |

## Règles d'usage à chiffrer

- **Zone de protection** : exprimée en unité interne du logo (ex. hauteur de la lettre capitale, ou 1× le module de la grille). Donne la valeur, pas « un peu d'air ».
- **Taille minimale** : hauteur en px pour l'écran et en mm pour l'impression, pour le lockup et pour le symbole seul.
- **Utilisations interdites** : liste illustrée — déformation, rotation, recoloration hors palette, contour ajouté, ombre, pose sur fond chargé sans plaque, recomposition des éléments, remplacement de la typo.

## Contrôle avant validation

Rends le logo à 16, 24, 48 px et en 100 % noir. Si le symbole devient une tache ou si deux formes fusionnent, il est à corriger — dis-le au lieu de livrer.
