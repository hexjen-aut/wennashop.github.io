// Exporte les deux guides en PDF A4 (une étape par page) : node pdf.cjs
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  for (const name of ['guide-chasseur-gabon', 'guide-chasseur-senegal']) {
    const p = await b.newPage();
    await p.goto('file://' + path.join(__dirname, name + '.html'), { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    await p.pdf({ path: path.join(__dirname, name + '.pdf'), format: 'A4', printBackground: true });
    console.log('pdf', name);
  }
  await b.close();
})();
