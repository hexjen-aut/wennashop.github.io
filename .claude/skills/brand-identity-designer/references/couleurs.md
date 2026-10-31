# Système de couleurs

## Structure obligatoire

| Rôle | Nombre | Fonction |
|---|---|---|
| Principale | 1 | porte l'identité, présente partout |
| Secondaire | 1 (2 max) | structure, soutient la principale |
| Accent | 1 | appels à l'action, points de tension — usage rare par définition |
| Neutres | 3 à 5 | textes, bordures, surfaces (du quasi-noir au gris clair) |
| Fonds | 2 | fond clair, fond sombre |
| Fonctionnelles | 4 si interface | succès, alerte, erreur, information |

Une couleur de plus qu'il n'en faut affaiblit la reconnaissance. Si une couleur n'a pas de rôle nommé, elle sort de la palette.

## Fiche par couleur

```
Nom interne : <nom lié à la marque, pas « bleu 2 »>
HEX    : #RRGGBB
RGB    : r, g, b
CMJN   : c, m, j, n (approx. — à faire valider par l'imprimeur)
Rôle   : où elle est utilisée, et où elle ne l'est pas
Proportion : part visuelle cible (ex. 60 / 25 / 10 / 5)
```

Précise toujours que le CMJN est une conversion approximative et qu'un Pantone doit être arrêté avec l'imprimeur avant tout tirage.

## Justification

Chaque couleur se rattache au positionnement ou à la personnalité : marché visé, codes du secteur à épouser ou à casser, lecture culturelle sur les marchés concernés. Une couleur choisie « parce qu'elle est belle » est refusée.

Vérifie aussi : la couleur principale ne doit pas être celle du concurrent direct le plus visible du marché.

## Contrôle de contraste — non négociable

Calcule les ratios WCAG réels (ne les estime pas à l'œil) :

| Paire | Minimum |
|---|---|
| Texte courant sur son fond | 4.5:1 |
| Texte ≥ 24 px ou ≥ 19 px gras | 3:1 |
| Icône / bordure porteuse de sens | 3:1 |
| Texte sur bouton de couleur accent | 4.5:1 |

Rends la matrice de contraste de toutes les paires réellement utilisées. Si une paire échoue, propose une variante tonale (`-600`, `-700`) plutôt que d'abandonner la couleur.

Vérifie aussi le rendu en deutéranopie pour toute paire porteuse de sens (succès/erreur) : jamais la couleur seule comme signal.

## Échelle tonale

Pour une identité numérique, décline la principale et les neutres en 9 pas (50 → 900). Donne les HEX de chaque pas, pas une formule.

## Livrable

- Tableau complet de la palette.
- Matrice de contraste.
- Règles de proportion.
- Variables prêtes : CSS custom properties + objet JS/Tailwind si le projet est web.
