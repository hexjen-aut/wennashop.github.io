# Système typographique

## Structure

| Rôle | Choix |
|---|---|
| Police principale | porte l'identité — titres, logo, accroches |
| Police secondaire | lecture longue — paragraphes, documents |
| Police d'accent | optionnelle, usage très limité (chiffres, citations) — à n'ajouter que si elle fait un vrai travail |
| Interface | lisible à petite taille, chiffres tabulaires disponibles |

Deux familles suffisent dans la grande majorité des cas. Trois demandent une justification.

## Fiche par police

```
Nom exact : <nom de la famille, tel qu'il s'écrit>
Catégorie : serif / sans-serif / slab / mono / display / humaniste / géométrique
Rôle      : …
Graisses retenues : ex. 400, 500, 700 (pas plus que nécessaire)
Licence   : SIL OFL / Apache / Google Fonts / commerciale (préciser le périmètre : web, desktop, app, nombre de vues)
Alternative système : pile de secours complète
Jeux de caractères requis : latin étendu, accents français, symboles monétaires (FCFA, MAD, €…)
```

Vérifie que la police couvre les caractères des marchés visés avant de la retenir. Une police sans accents correctement dessinés est éliminée.

## Échelle

Donne une échelle chiffrée, pas des adjectifs :

| Niveau | Taille | Interlignage | Graisse | Interlettrage |
|---|---|---|---|---|
| Display | 48–64 px | 1.05 | 700 | -0.02em |
| H1 | 32–40 px | 1.15 | 700 | -0.01em |
| H2 | 24–28 px | 1.25 | 600 | 0 |
| H3 | 20 px | 1.3 | 600 | 0 |
| Corps | 16–17 px | 1.55 | 400 | 0 |
| Petit | 14 px | 1.5 | 400 | 0 |
| Légende | 12–13 px | 1.45 | 500 | 0.01em |

Adapte les valeurs à la police choisie (hauteur d'x variable) — l'échelle ci-dessus est un point de départ à ajuster, pas un dogme.

## Règles typographiques

- Longueur de ligne : 60 à 80 caractères en lecture longue.
- Pas de texte courant en capitales. Capitales réservées aux micro-labels, avec interlettrage positif.
- Hiérarchie par taille et graisse, pas par couleur.
- Jamais de fausse graisse ni de faux italique synthétisés.
- Typographie française : espaces insécables avant `: ; ! ?`, guillemets « », apostrophe typographique ’.
- Chiffres tabulaires pour tableaux et prix ; chiffres proportionnels dans le texte.

## Livrable

Planche typographique : chaque niveau rendu avec son vrai texte, en clair et en sombre, plus la liste des graisses à charger (et le poids des fichiers web).
