# Package de livraison

Arborescence fixe. Les fichiers créés le sont dans le répertoire de travail principal pour que l'utilisateur puisse les ouvrir.

```
brand-<marque>/
├── 01-brand-strategy/
│   ├── adn-positionnement.md
│   ├── personnalite.md
│   └── direction-artistique.md
├── 02-logo-system/
│   ├── logo-principal.svg
│   ├── logo-horizontal.svg
│   ├── logo-vertical.svg
│   ├── symbole.svg
│   ├── logo-mono-noir.svg
│   ├── logo-mono-blanc.svg
│   ├── logo-inverse.svg
│   ├── construction.svg          (grille et cotes)
│   └── png/                      (exports transparents 512/1024/2048)
├── 03-color-system/
│   ├── palette.md
│   ├── contrastes.md
│   └── variables.css             (+ tokens.js si projet web)
├── 04-typography-system/
│   ├── typographie.md
│   └── echelle.html
├── 05-graphic-system/
│   ├── module-formes.svg
│   ├── motif.svg
│   ├── icones/
│   └── direction-photo.md
├── 06-brand-applications/
│   ├── print/
│   ├── social/
│   ├── commercial/
│   └── digital/
├── 07-brand-guidelines/
│   └── charte-graphique.html     (imprimable en PDF)
└── 08-export-package/
    ├── favicon.svg, favicon-32.png, apple-touch-icon-180.png
    ├── og-image.png
    └── README.md                 (que contient quoi, comment utiliser)
```

## Formats

| Besoin | Format |
|---|---|
| Logos vectoriels | SVG (source exploitable) |
| Logos pour usages bitmap | PNG transparent, 3 tailles |
| Charte | HTML autonome → impression PDF |
| Présentations / aperçus | JPG ou PNG |
| Tokens | CSS custom properties, + JS/Tailwind si pertinent |

Pas de fichier `.ai`, `.psd` ou `.fig` : dis-le explicitement. Le SVG est la source éditable fournie ; indique qu'elle s'ouvre dans Illustrator, Figma, Inkscape ou Affinity.

## README du package

À inclure obligatoirement : quelle version du logo pour quel usage, les 3 interdits principaux, les HEX, les polices et leurs licences, qui contacter, la date et la version.

## Sauvegarde

Après livraison, propose la sauvegarde du package sur Google Drive (dossier au nom de la marque) et attends l'accord avant d'envoyer quoi que ce soit à un service externe.
