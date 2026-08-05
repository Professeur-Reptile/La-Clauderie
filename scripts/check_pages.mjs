// -----------------------------------------------------------------------------
// Vérification NAVIGATEUR des pages du site (le filet qui manquait le plus).
//
// Les trois vérificateurs Python lisent le source ; celui-ci OUVRE réellement
// chaque page dans Chromium et vérifie ce qu'un joueur verrait :
//   - aucune erreur JavaScript (l'onglet Métiers s'est vidé en production le
//     4 août 2026 à cause d'une apostrophe droite : la page se chargeait, mais
//     son script mourait — invisible pour un contrôle de syntaxe seul, car
//     l'erreur venait d'un fichier généré) ;
//   - aucune requête en échec sur assets/ ou data/ (toutes les armes du BiS
//     s'affichaient en case vide le 5 août 2026 : l'art n'était pas embarqué) ;
//   - aucune image cassée une fois la page défilée (chargement paresseux) ;
//   - les zones rendues par JavaScript ne sont pas vides.
//
// Usage :  node scripts/check_pages.mjs [--kb <dossier de la knowledge base>]
// Sert un serveur statique local, ouvre les pages, code retour 1 si un défaut
// est trouvé. Prévu pour la CI (.github/workflows/check-site.yml) autant que
// pour un contrôle manuel avant push.
// -----------------------------------------------------------------------------
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const kbIndex = args.indexOf('--kb');
const KB = kbIndex !== -1 ? args[kbIndex + 1] : '../wocc-knowledge-base';
const PORT = Number(process.env.PORT || 8099);

// En local, le site résout ses chemins comme dans la disposition « dossier
// parent » documentée (python3 -m http.server à la racine du parent) : le site
// sous /La-Clauderie/ et la knowledge base sous /wocc-knowledge-base/. On sert
// donc exactement ça, sinon toutes les données du Codex partent en 404.
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  try {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    const rel = normalize(url).replace(/^(\.\.[/\\])+/, '');
    const path = rel.startsWith('/wocc-knowledge-base/')
      ? join(KB, rel.slice('/wocc-knowledge-base/'.length))
      : join('.', rel.replace(/^\/La-Clauderie\//, '/'));
    const target = (await stat(path)).isDirectory() ? join(path, 'index.html') : path;
    const body = await readFile(target);
    res.writeHead(200, { 'content-type': MIME[extname(target)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(PORT, r));
const base = `http://127.0.0.1:${PORT}`;

// Page = son chemin, plus les zones remplies par JavaScript qui doivent avoir
// du contenu (une page qui s'affiche mais reste vide est le défaut typique).
const PAGES = [
  { path: '/index.html', filled: [] },
  { path: '/bis.html', filled: ['#bisList', '#buildBox'] },
  { path: '/metiers.html', filled: ['#view-recolte', '#view-metiers'] },
  { path: '/pvp.html', filled: ['#buildBox'] },
  { path: '/failles.html', filled: [] },
  { path: '/montures.html', filled: [] },
  { path: '/patch-notes.html', filled: [] },
  { path: '/notes/v0.34.0.html', filled: [] },
  { path: '/notes/v0.34.0.en.html', filled: [] },
];

// En CI, `npx playwright install chromium` fournit le navigateur ; en local
// (conteneur de développement) il est déjà présent sous PLAYWRIGHT_BROWSERS_PATH,
// mais parfois seulement en version complète : on laisse Playwright choisir, et
// on retombe sur le Chromium du conteneur si l'exécutable par défaut manque.
let browser;
try {
  browser = await chromium.launch();
} catch {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
}
const problems = [];

for (const page of PAGES) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const tab = await ctx.newPage();
  const jsErrors = [];
  const failed = [];
  tab.on('pageerror', (e) => jsErrors.push(String(e).split('\n')[0]));
  // On ne retient que les VRAIES exceptions : les « Failed to load resource »
  // sont déjà couverts par le contrôle des requêtes ci-dessous, et les appels
  // vers l'extérieur (API GitHub du badge de version) ne doivent pas faire
  // échouer une vérification hors ligne.
  tab.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource|ERR_(CERT|NAME|CONNECTION|INTERNET)/.test(t))
      jsErrors.push(t.slice(0, 160));
  });
  tab.on('response', (r) => {
    // Uniquement nos propres ressources : le badge de version interroge aussi
    // l'API GitHub, hors de notre contrôle et absente en CI hors ligne.
    if (r.status() >= 400 && r.url().startsWith(base)) failed.push(`${r.status()} ${r.url().replace(base, '')}`);
  });

  await tab.goto(base + '/La-Clauderie' + page.path, { waitUntil: 'networkidle' });
  await tab.waitForTimeout(1500);
  // Défiler : les images sont en chargement paresseux, une image cassée hors
  // écran ne se voit pas autrement.
  await tab.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 90));
    }
  });
  await tab.waitForTimeout(1200);

  const broken = await tab.evaluate(() =>
    [...document.images].filter((i) => i.naturalWidth === 0 && i.getAttribute('src')).map((i) => i.getAttribute('src')));
  const empty = await tab.evaluate((sels) =>
    sels.filter((s) => (document.querySelector(s)?.innerHTML || '').trim().length < 40), page.filled);

  for (const e of [...new Set(jsErrors)]) problems.push(`${page.path} — erreur JS : ${e}`);
  for (const f of [...new Set(failed)]) problems.push(`${page.path} — requête en échec : ${f}`);
  for (const b of [...new Set(broken)]) problems.push(`${page.path} — image cassée : ${b}`);
  for (const s of empty) problems.push(`${page.path} — zone vide : ${s}`);

  console.log(`  ${problems.length ? ' ' : '✓'} ${page.path}`);
  await ctx.close();
}

await browser.close();
server.close();

if (problems.length) {
  console.error(`\n❌ ${problems.length} problème(s) :`);
  for (const p of problems) console.error('   - ' + p);
  process.exit(1);
}
console.log(`\n✓ ${PAGES.length} pages ouvertes : aucune erreur JS, aucune requête en échec, aucune image cassée.`);
