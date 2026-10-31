# Système graphique

Tout ce qui suit dérive du logo et de la direction artistique. Rien n'est ajouté « pour décorer ».

## Formes

- Identifie le **module** du logo (angle, rayon, épaisseur, rapport) et réutilise-le partout : coins arrondis, découpes, cadres, séparateurs.
- Un seul rayon de coin pour tout le système, plus éventuellement un rayon « large » en rapport simple (ex. 8 px et 24 px).
- Angles : si le logo est construit à 45°, aucune diagonale à 30° ailleurs.

## Motifs et textures

- Un motif maximum, construit par répétition du symbole ou de son module.
- Toujours fourni en SVG `pattern` carrelable, avec la taille de tuile indiquée.
- Usage défini : fonds de section, dos de carte, papier d'emballage. Jamais sous du texte courant.

## Iconographie

- Une seule grille (24 px), une seule épaisseur de trait, mêmes terminaisons que le logo.
- Style unique : trait OU plein, jamais mélangés.
- Pas d'icône décorative. Une icône n'existe que si elle remplace un mot ou accélère un repérage. Si elle double le libellé qu'elle accompagne, elle est supprimée.
- Livrées en SVG avec `currentColor`.

## Illustration

Définis le registre et tiens-le : trait, aplats, semi-réaliste, isométrique. Palette limitée à la charte. Si l'illustration n'est pas tenable dans le temps par l'équipe, ne l'intègre pas au système.

## Photographie

Direction photo écrite : sujets, cadrage, lumière, traitement colorimétrique, présence humaine, arrière-plans. Donne 3 règles de sélection et 3 motifs de rejet.
Pour les images d'illustration, utilise des images libres de droit (Unsplash, Pexels, Pixabay) et cite la source et la licence.

## Grilles et composition

| Support | Grille |
|---|---|
| Web | 12 colonnes, gouttière 24 px, largeur max 1200–1280 px |
| Mobile | 4 colonnes, marge 16–20 px |
| Print A4 | 12 colonnes, marges 15 mm, empagement défini |
| Social carré | marge de sécurité 8 % du côté |

## Espacement

Une seule échelle, en base 4 : 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96.
Toute valeur hors échelle doit être justifiée. Cette échelle vaut aussi pour le print, convertie.

## Livrable

Planche « système graphique » : module, rayons, motif, grille d'icônes, échelle d'espacement, grilles de composition — rendue en HTML/SVG.
