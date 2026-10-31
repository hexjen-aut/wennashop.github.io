# Prompts de génération d'image

La génération d'image sert à **explorer une ambiance, produire une mise en situation ou une illustration** — jamais à produire un logo final ni un texte lisible.

## Limites à annoncer

Les générateurs déforment lettres, symboles et proportions. Donc :
- Exploration de concept : génération acceptée.
- Logo retenu : reconstruit en SVG à la main, proportions et typo contrôlées, versions monochromes vérifiées.
- Un mockup généré n'est jamais présenté comme le logo original.
- Si du texte doit être lisible dans un visuel, il est composé en SVG/HTML par-dessus, pas généré.

## Gabarit en 10 points

Chaque prompt précise, dans cet ordre :

1. **Objectif** — à quoi sert l'image, où elle sera vue.
2. **Sujet** — ce qui est représenté, précisément.
3. **Composition** — cadrage, point de vue, placement du sujet, espace libre réservé au texte ou au logo.
4. **Palette exacte** — les HEX de la charte, en nommant leur rôle dans l'image.
5. **Style graphique** — registre, référence de technique (pas de nom de marque ni d'artiste vivant).
6. **Formes et textures** — matériaux, grain, surfaces, rapport aux formes du système.
7. **Éclairage** — direction, dureté, température, si pertinent.
8. **Format** — ratio et dimensions cibles.
9. **Contraintes de rendu** — netteté, fond, détourage, zone de sécurité.
10. **Éléments interdits** — texte, logos, visages reconnaissables, watermark, mains, effets à éviter.

## Exemple de structure

```
Objectif : image d'en-tête de la page d'accueil, texte blanc posé à gauche.
Sujet : <sujet concret>.
Composition : plan large, sujet décalé à droite au tiers, moitié gauche volontairement calme pour accueillir le texte.
Palette : fond #0F2A22 dominant, sujet en #E8C47A, accent ponctuel #D4553B, neutres #F5F3EF.
Style : photographie éditoriale sobre, contraste maîtrisé, sans effet.
Textures : matière mate, grain fin, surfaces franches.
Éclairage : latérale douce venant de la droite, température chaude.
Format : 2400 × 1200 px, ratio 2:1.
Rendu : net, profondeur de champ modérée, pas de vignettage.
Interdits : aucun texte, aucun logo, pas de visage identifiable, pas de watermark, pas de reflet lenticulaire.
```

## Après génération

Vérifie : respect de la palette, zone libre réellement utilisable, absence de texte parasite, cohérence avec les autres visuels de la série. Si une image sort de la charte, elle est régénérée ou écartée — elle n'est pas « rattrapée » par un filtre.
