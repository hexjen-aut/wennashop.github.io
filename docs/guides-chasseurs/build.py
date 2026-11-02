# Génère guide-chasseur-gabon.html et guide-chasseur-senegal.html à partir des
# captures de captures/. Les encadrés orange sont en coordonnées CSS d'une
# capture 390 × 844 (viewport mobile), convertis en pourcentages.
# Usage : python3 build.py, puis node pdf.cjs pour les PDF.
import html, os

D = os.path.dirname(os.path.abspath(__file__))
W, H = 390, 844


def box(x1, y1, x2, y2):
    return (x1 / W * 100, y1 / H * 100, (x2 - x1) / W * 100, (y2 - y1) / H * 100)


# Section A : recruter un vendeur
RECRUTER = [
    ('Connecte-toi', 'c01-connexion', box(16, 715, 373, 758),
     "Ouvre wennashop.com, entre ton e-mail et ton mot de passe, puis touche « Se connecter »."),
    ('Ouvre « Mes vendeurs »', 'c02-dashboard', box(288, 208, 390, 246),
     "Dans ton espace chasseur, fais glisser les onglets et touche « Mes vendeurs »."),
    ('Copie ton lien de parrainage', 'c03-parrainage', box(43, 552, 205, 599),
     "Touche « Copier le lien à partager », puis colle-le sur WhatsApp au vendeur. Sa boutique sera rattachée à toi automatiquement."),
    ('Le vendeur crée son compte', 'c04b-inscription-vendeur', box(198, 376, 375, 424),
     "En ouvrant ton lien, il arrive sur l'inscription avec « Vendeur » déjà choisi. Il remplit le formulaire et touche « Créer mon compte gratuitement »."),
    ('Il envoie sa pièce d\'identité', 'v01-vendeur', box(51, 554, 338, 591),
     "À sa première connexion, il envoie une pièce d'identité et son adresse. L'équipe valide son dossier sous 24 à 48 h."),
    ('Il ajoute son premier produit', 'v02-dashboard', box(59, 53, 214, 93),
     "Dans son espace vendeur, il touche « Nouveau produit ». Les 20 premiers vendeurs validés deviennent Fondateurs : badge à vie et 3 mois en vedette."),
    ('Nom, description, prix', 'v03-produit-infos', box(19, 251, 371, 574),
     "Il remplit le nom, la description, le prix et le stock. Des infos claires = moins de questions des clients."),
    ('Les photos', 'v04-produit-photos', box(19, 605, 105, 690),
     "Onglet « Photos » : il touche « Ajouter ». Fond clair, produit centré, plusieurs angles."),
    ('Suis tes vendeurs et tes primes', 'c07-recrutes', box(22, 345, 368, 694),
     "Toujours dans « Mes vendeurs » : ton solde de parrainage et la liste de tes vendeurs. Tu touches 3 000 FCFA quand une boutique atteint 3 commandes livrées, puis 20 % de la commission WennaShop sur ses ventes pendant 6 mois."),
]

CLIENT_COMMUN = [
    ('Le client choisit son produit', 'k01-produit', box(18, 778, 372, 834),
     "Il choisit la couleur et la taille, puis touche « Ajouter au panier »."),
    ('Il passe au paiement', 'k02-panier', box(47, 461, 343, 519),
     "Dans son panier, il vérifie le total et touche « Passer au paiement »."),
]

GA_PAIEMENT = CLIENT_COMMUN + [
    ('Paiement à la livraison', 'k04-paiement-cod', box(47, 430, 192, 529),
     "Il remplit l'adresse et choisit « Paiement à la livraison » : il paie en espèces au livreur."),
    ('Ou Airtel Money', 'k05-paiement-airtel', box(198, 430, 343, 529),
     "S'il préfère Airtel Money, il choisit « Airtel Money », puis « Voir les instructions de paiement »."),
    ('Le numéro où payer', 'k06-airtel-numero', box(15, 223, 375, 324),
     "Le site affiche le montant exact et le numéro Airtel Money WennaShop. Le client envoie le montant à ce numéro."),
    ('Il déclare son paiement', 'k07-declaration', box(33, 534, 357, 841),
     "Il colle l'ID de transaction reçu par SMS, puis touche « J'ai payé ». C'est moi qui valide le paiement."),
]

SN_PAIEMENT = CLIENT_COMMUN + [
    ('Paiement à la livraison', 'k04-paiement-cod', box(47, 430, 192, 529),
     "Il remplit l'adresse et choisit « Paiement à la livraison » : il paie en espèces au livreur. Au Sénégal, c'est le seul moyen de paiement pour l'instant."),
]

CSS = """
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@500;700;800;900&display=swap');
:root { --accent: #ff751f; --ink: #1d1d1f; --muted: #5b5b63; --line: #ececf0; --soft: #fff4ec; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Nunito', system-ui, sans-serif; background: #f7f7f9; color: var(--ink); line-height: 1.5; -webkit-font-smoothing: antialiased; }
main { max-width: 560px; margin: 0 auto; padding: 24px 16px 48px; }
.cover { background: #fff; border-radius: 20px; padding: 28px 22px; margin-bottom: 22px; border: 1px solid var(--line); }
.brand { font-weight: 900; font-size: 22px; letter-spacing: -.5px; }
.brand b { color: var(--accent); }
.cover h1 { font-size: 28px; font-weight: 900; line-height: 1.15; margin: 14px 0 8px; }
.cover p { color: var(--muted); font-size: 16px; }
.toc { margin-top: 16px; display: grid; gap: 6px; font-weight: 800; font-size: 15px; }
.toc span { color: var(--accent); margin-right: 8px; }
h2 { font-size: 22px; font-weight: 900; margin: 34px 0 6px; }
h2 span { color: var(--accent); }
.lead { color: var(--muted); font-size: 16px; margin-bottom: 14px; }
.step { background: #fff; border: 1px solid var(--line); border-radius: 20px; padding: 18px 16px 20px; margin-bottom: 16px; }
.head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.num { flex: 0 0 38px; height: 38px; border-radius: 50%; background: var(--accent); color: #fff; font-weight: 900; font-size: 18px; display: flex; align-items: center; justify-content: center; }
.head h3 { font-size: 19px; font-weight: 900; line-height: 1.2; }
.shot { position: relative; width: 78%; max-width: 330px; margin: 0 auto 14px; border-radius: 18px; overflow: hidden; border: 1px solid #ddd; box-shadow: 0 6px 22px rgba(0,0,0,.12); }
.shot img { display: block; width: 100%; height: auto; }
.mark { position: absolute; border: 3px solid var(--accent); border-radius: 12px; box-shadow: 0 0 0 4px rgba(255,117,31,.28); }
.txt { font-size: 17px; font-weight: 600; }
.flow { display: grid; gap: 10px; margin: 10px 0 6px; }
.fstep { display: flex; gap: 12px; align-items: flex-start; background: var(--soft); border: 2px solid var(--accent); border-radius: 16px; padding: 14px; }
.fstep .num { flex-basis: 34px; height: 34px; font-size: 16px; }
.fstep strong { display: block; font-size: 17px; font-weight: 900; }
.fstep p { font-size: 15px; color: var(--muted); }
.arrow { text-align: center; color: var(--accent); font-weight: 900; font-size: 22px; line-height: 1; }
.note { background: #fff; border-left: 5px solid var(--accent); border-radius: 12px; padding: 14px 16px; font-size: 16px; margin: 12px 0; }
.list { background: #fff; border: 1px solid var(--line); border-radius: 20px; padding: 18px 20px; }
.list li { font-size: 17px; font-weight: 700; margin: 8px 0 8px 20px; }
.dont li::marker { color: #d93b2f; }
.goals li::marker { color: var(--accent); }
footer { text-align: center; color: var(--muted); font-size: 13px; margin-top: 30px; }
@media print {
  @page { size: A4 portrait; margin: 14mm 16mm; }
  body { background: #fff; }
  main { max-width: none; padding: 0; }
  .cover, .step, .list, .flow-block { break-inside: avoid; page-break-inside: avoid; }
  .step { break-before: page; border: none; padding: 0; }
  .shot { width: auto; max-width: none; height: 190mm; display: inline-block; margin: 0 auto 10px; }
  .shot img { height: 190mm; width: auto; }
  .shotwrap { text-align: center; }
  h2 { break-before: page; break-after: avoid; }
  h2 + .lead + .step { break-before: avoid; }
  h2 + .lead + .step .shot, h2 + .lead + .step .shot img { height: 165mm; }
}
"""


def esc(s):
    return html.escape(s, quote=False)


def step_html(n, title, img, b, text):
    x, y, w, h = b
    return f"""<section class="step">
  <div class="head"><div class="num">{n}</div><h3>{esc(title)}</h3></div>
  <div class="shotwrap"><div class="shot"><img src="captures/{img}.jpg" alt="{esc(title)}" loading="lazy"><div class="mark" style="left:{x:.2f}%;top:{y:.2f}%;width:{w:.2f}%;height:{h:.2f}%"></div></div></div>
  <p class="txt">{esc(text)}</p>
</section>"""


def build(country):
    ga = country == 'GA'
    pays = 'Gabon' if ga else 'Sénégal'
    reverse = 'Airtel Money' if ga else 'Wave ou Orange Money'
    out = []
    n = 1
    out.append(f"""<div class="cover">
  <div class="brand">Wenna<b>Shop</b></div>
  <h1>Guide du chasseur<br>{pays}</h1>
  <p>Les écrans du site, étape par étape. Touche toujours le bouton entouré en orange.</p>
  <div class="toc"><div><span>A</span>Recruter un vendeur</div><div><span>B</span>Les paiements</div><div><span>C</span>Ce que tu ne fais pas</div><div><span>D</span>Tes objectifs du 1er mois</div></div>
</div>""")
    out.append('<h2><span>A.</span> Recruter un vendeur</h2><p class="lead">Ton lien de parrainage rattache automatiquement la boutique du vendeur à toi.</p>')
    for t, img, b, txt in RECRUTER:
        out.append(step_html(n, t, img, b, txt)); n += 1
    out.append('<div class="note"><strong>Offre Fondateurs :</strong> les 20 premiers vendeurs validés qui mettent un produit en ligne gagnent un badge Fondateur à vie et 3 mois en vedette sur la page d\'accueil. Dis-le à chaque vendeur que tu recrutes.</div>')

    out.append('<h2><span>B.</span> Les paiements</h2><p class="lead">Ce que voit le client, puis ce que tu fais quand il paie en espèces.</p>')
    for t, img, b, txt in (GA_PAIEMENT if ga else SN_PAIEMENT):
        out.append(step_html(n, t, img, b, txt)); n += 1
    if ga:
        out.append('<div class="note"><strong>Si le client bloque sur Airtel Money :</strong> envoie-moi sur WhatsApp le n° de commande (WN-…), le montant et l\'ID de transaction. C\'est moi qui valide.</div>')
    else:
        out.append('<div class="note"><strong>Bientôt :</strong> le paiement Wave et Orange Money en ligne arrive sur le site. En attendant, les clients du Sénégal paient à la livraison.</div>')
    out.append(f"""<div class="flow-block"><h3 style="font-size:19px;font-weight:900;margin:20px 0 4px">Paiement à la livraison : ce que tu fais</h3>
<div class="flow">
  <div class="fstep"><div class="num">1</div><div><strong>Encaisser</strong><p>Le client te paie en espèces à la livraison.</p></div></div>
  <div class="arrow">↓</div>
  <div class="fstep"><div class="num">2</div><div><strong>Déclarer sur WhatsApp</strong><p>Tout de suite, envoie-moi la date, le n° de commande et le montant.</p></div></div>
  <div class="arrow">↓</div>
  <div class="fstep"><div class="num">3</div><div><strong>Reverser sous 48 h</strong><p>Envoie l'argent par {reverse}, avec la référence ou la photo du reçu.</p></div></div>
  <div class="arrow">↓</div>
  <div class="fstep"><div class="num">4</div><div><strong>Confirmation</strong><p>Je confirme la réception. Tant que je n'ai pas confirmé, ce n'est pas terminé.</p></div></div>
</div></div>""")

    out.append("""<h2><span>C.</span> Ce que tu ne fais pas</h2>
<ul class="list dont">
  <li>Tu ne paies jamais un vendeur.</li>
  <li>Tu ne fais aucun paiement international.</li>
  <li>Tu ne confirmes jamais un paiement sans ma validation.</li>
  <li>Tu ne partages jamais tes accès (e-mail, mot de passe, code).</li>
</ul>""")
    extra = '' if ga else '<li>Trouver 2 ou 3 options de livraison, avec leurs tarifs.</li>'
    out.append(f"""<h2><span>D.</span> Tes objectifs du 1er mois</h2>
<ul class="list goals">
  <li>5 vendeurs inscrits avec ton lien.</li>
  <li>2 vendeurs actifs (au moins un produit en ligne).</li>
  <li>L'argent encaissé reversé en moins de 48 h.</li>
  {extra}
</ul>
<footer>WennaShop · Guide du chasseur {pays} · Captures du site wennashop.com</footer>""")
    page = f"""<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Guide chasseur {pays}</title><style>{CSS}</style></head>
<body><main>
{chr(10).join(out)}
</main></body></html>"""
    name = 'guide-chasseur-gabon' if ga else 'guide-chasseur-senegal'
    open(os.path.join(D, name + '.html'), 'w').write(page)
    print(name, n - 1, 'étapes')


build('GA')
build('SN')
