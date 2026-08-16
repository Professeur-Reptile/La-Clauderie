// -----------------------------------------------------------------------------
// Vérification des GUIDES RÉDIGÉS À LA MAIN contre les données du jeu :
//   - `const BUILDS` de bis.html      (spé, maîtrise, talents, rotation)
//   - `const PVP`    de pvp.html      (spé, talents, plan de match)
//   - `const ENCH`   de metiers.html  (enchantements : bonus et matériaux)
//   - le tableau des montures de montures.html (aucune monture oubliée)
//
// Ce que ça contrôle, build par build — 18 dans bis.html, car une classe peut
// avoir plusieurs spés pour un même rôle :
//   1. la SPÉ annoncée existe pour cette classe et tient bien ce rôle ;
//   2. la MAÎTRISE citée est celle de cette spé ;
//   3. chaque TALENT est une option de la rangée du niveau annoncé ;
//   4. chaque nom cité en ROTATION (ou en gras dans le plan PvP) est une
//      capacité que CETTE spé peut réellement lancer.
//
// Le point 4 est le plus important, et le moins visible : une capacité retirée
// du jeu RESTE dans ABILITIES.json — le jeu la garde pour reconnaître et jeter
// les barres d'action enregistrées — mais porte `hiddenFromPlayer`, et
// `abilitiesKnownAt` l'exclut alors du grimoire. Elle garde donc une fiche
// Codex parfaitement valide, et rien ne disait qu'aucun joueur ne pouvait plus
// la lancer.
//
// Incident fondateur (16 août 2026, signalé par un joueur de la guilde) : les
// trois rotations du Paladin proposaient encore Oathbrand, Lightmend, Oath of
// Iron, Steadfast Aura et Reproach, cinq sorts retirés à la refonte v0.36 —
// dix mois de guide faux. L'audit qui a suivi a montré que la moitié des builds
// n'avait JAMAIS été relue : les classes à plusieurs spés par rôle (Mage,
// Voleur, Chasseur, Démoniste…) sont rangées dans une LISTE, et les contrôles
// à la main ne regardaient que la première entrée de chaque rôle.
//
// Le bloc est ÉVALUÉ, pas analysé à la main : c'est le même littéral que celui
// que le navigateur exécute, donc aucun risque de désaccord entre ce que voit
// ce script et ce que voit le joueur.
//
// Usage :  node scripts/check_guides.mjs [--kb <dossier de la knowledge base>]
// Tourne en CI (check-site.yml) : un guide périmé ne part plus en ligne.
// -----------------------------------------------------------------------------
import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const kbIndex = args.indexOf('--kb');
const KB = kbIndex !== -1 ? args[kbIndex + 1] : '../wocc-knowledge-base';

const ROLE_OF_TAB = { tank: 'tank', heal: 'healer', dps: 'dps' };
const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[’‘]/g, "'").toLowerCase().trim();

const readJson = async (name) => JSON.parse(await readFile(`${KB}/data/${name}.json`, 'utf8'));
const [ABILITIES, TALENTS, CLASSES, ENCHANTS, ITEMS] = await Promise.all(
  [readJson('ABILITIES'), readJson('TALENTS'), readJson('CLASSES'), readJson('ENCHANTS'), readJson('ITEMS')]);

// Une capacité ACCORDABLE est dans le kit de classe, accordée par une option de
// talent, ou signature d'une spé. Le reste existe dans les données sans qu'aucun
// joueur puisse l'apprendre : Veinleech en est l'exemple (aucun kit, aucun
// talent), tout comme Savage Mending l'était avant que la v0.38.0 le donne
// enfin à l'ours. Une rotation qui cite ça envoie le joueur chercher un sort
// qu'il ne trouvera jamais.
const grantable = {};
for (const [cls, def] of Object.entries(CLASSES)) grantable[cls] = new Set(def.abilities ?? []);
for (const [cls, block] of Object.entries(TALENTS)) {
  const set = (grantable[cls] ??= new Set());
  for (const spec of block.specs) if (spec.signature) set.add(spec.signature);
  for (const row of block.rows) {
    for (const opt of row.options) {
      const granted = opt.effect?.grant?.ability;
      if (granted) set.add(granted);
    }
  }
}
// Une capacité peut aussi n'apparaître qu'en REMPLACEMENT d'une autre sur la
// barre d'action, à partir d'un certain nombre de charges : Unleash Beast prend
// la place de Pack Command à 3 Férocités, Marrowbreak celle de Maul à 3 Old
// Blood. Elle n'est dans aucun kit et n'est accordée par aucun talent, mais le
// joueur l'a bien — donc elle a sa place dans une rotation.
for (const set of Object.values(grantable)) {
  for (let added = true; added; ) {
    added = false;
    for (const id of [...set]) {
      const rep = ABILITIES[id]?.actionReplacement;
      for (const r of Array.isArray(rep) ? rep : rep ? [rep] : []) {
        if (r.abilityId && !set.has(r.abilityId)) { set.add(r.abilityId); added = true; }
      }
    }
  }
}

// Par classe : nom replié -> définitions (le jeu réutilise des noms d'affichage).
const abilitiesByClass = {};
for (const ability of Object.values(ABILITIES)) {
  if (!ability.class) continue;
  const byName = (abilitiesByClass[ability.class] ??= new Map());
  const key = fold(ability.name);
  byName.set(key, [...(byName.get(key) ?? []), ability]);
}
// Par classe : nom de talent -> niveau de sa rangée, et les spés par nom.
const talentsByClass = {}, specsByClass = {};
for (const [cls, block] of Object.entries(TALENTS)) {
  talentsByClass[cls] = new Map(
    block.rows.flatMap((row) => row.options.map((o) => [fold(o.name), row.level])));
  specsByClass[cls] = new Map(block.specs.map((s) => [fold(s.name), s]));
}

const problems = [];
const fail = (where, what) => problems.push(`❌ ${where} — ${what}`);

// Un champ de guide est soit une chaîne, soit { fr, en } : on lit le français.
const text = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? (v.fr ?? v.en ?? '') : (v ?? ''));

// `cxNames()` (bis.html) découpe une entrée de rotation sur →, / et + et laisse
// tomber un « ×N » final : on vérifie donc exactement les morceaux rendus
// cliquables au joueur.
const parts = (raw) => String(raw).replace(/\s*×\s*\d+\s*$/, '').split(/\s*(?:→|\/|\+)\s*/)
  .map((p) => p.trim()).filter(Boolean);

function checkName(where, cls, specId, name) {
  const defs = abilitiesByClass[cls]?.get(fold(name));
  if (!defs) {
    if (talentsByClass[cls]?.has(fold(name))) return;   // un talent cité : légitime
    fail(where, `« ${name} » : ni capacité ni talent de cette classe`);
    return;
  }
  const live = defs.filter((d) => !d.hiddenFromPlayer);
  if (!live.length) {
    fail(where, `« ${name} » : RETIRÉ DU GRIMOIRE (hiddenFromPlayer) — plus lançable par un joueur`);
    return;
  }
  const usable = live.filter((d) => !d.specs || d.specs.includes(specId));
  if (!usable.length) {
    const reserved = [...new Set(live.flatMap((d) => d.specs ?? []))].sort().join(', ');
    fail(where, `« ${name} » : réservé à ${reserved} — pas à ${specId}`);
    return;
  }
  if (!usable.some((d) => grantable[cls]?.has(d.id))) {
    fail(where, `« ${name} » : aucun kit de classe, aucun talent et aucune spé ne l'accorde — injouable`);
  }
}

function checkBuild(where, cls, tabRole, build, lineFields) {
  const specLabel = text(build.spec);
  const spec = specsByClass[cls]?.get(fold(specLabel.split(/[(—]/)[0]));
  if (!spec) { fail(where, `spé « ${specLabel} » inconnue pour ${cls}`); return; }
  if (tabRole && spec.role !== ROLE_OF_TAB[tabRole]) {
    fail(where, `spé « ${spec.name} » tient le rôle ${spec.role}, pas ${tabRole}`);
  }
  const mastery = text(build.mastery);
  if (mastery && !fold(mastery).includes(fold(spec.mastery.name))) {
    fail(where, `maîtrise citée ≠ « ${spec.mastery.name} » (celle de ${spec.name})`);
  }
  for (const [name, tree] of build.talents ?? []) {
    const level = /niv\.?\s*(\d+)/.exec(String(text(tree)));
    const row = talentsByClass[cls]?.get(fold(name));
    if (row === undefined) {
      // Une posture (Guerrier) est une capacité, pas une option de talent.
      checkName(where, cls, spec.id, name);
      if (level) fail(where, `talent « ${name} » : aucune option de ce nom chez ${cls}`);
    } else if (level && row !== Number(level[1])) {
      fail(where, `talent « ${name} » : rangée niv. ${row}, pas niv. ${level[1]}`);
    }
  }
  const cited = new Set();
  for (const field of lineFields) {
    for (const entry of build[field] ?? []) {
      for (const part of parts(Array.isArray(entry) ? entry[0] : text(entry))) {
        cited.add(fold(part));
        checkName(where, cls, spec.id, part);
      }
    }
  }
  return { spec, cited };
}

/** Une rotation qui ne cite pas la SIGNATURE de sa spé, ou presque aucune de ses
 *  capacités propres, décrit un jeu qui n'existe plus — c'est ce qui arrive
 *  quand une refonte passe et que le guide, lui, ne bouge pas. La signature est
 *  bloquante ; la couverture est un simple rappel, pour ne pas faire échouer un
 *  déploiement sur un choix éditorial (on n'énumère pas tout un kit). */
function checkCoverage(where, cls, spec, cited) {
  const signature = ABILITIES[spec.signature];
  if (signature && !cited.has(fold(signature.name))) {
    fail(where, `la rotation ne cite pas la signature de ${spec.name} : « ${signature.name} »`);
  }
  const own = Object.values(ABILITIES).filter(
    (a) => a.class === cls && !a.hiddenFromPlayer && !a.passive && a.specs?.includes(spec.id));
  const missing = own.filter((a) => !cited.has(fold(a.name))).map((a) => a.name);
  if (own.length && missing.length > own.length / 2) {
    console.log(`⚠️  ${where} — ${missing.length}/${own.length} capacités propres à ${spec.name} `
      + `absentes de la rotation : ${missing.join(', ')}`);
  }
}

/** Le littéral `const X = {…}` ou `const X = […]` d'une page, évalué comme le
 *  fait le navigateur : on suit les accolades/crochets en ignorant ce qui est
 *  entre guillemets, donc aucun risque de couper au milieu d'un texte. */
async function guideBlock(page, constName) {
  const html = await readFile(page, 'utf8');
  const decl = html.indexOf(`const ${constName} = `);
  if (decl === -1) throw new Error(`${page} : bloc ${constName} introuvable`);
  const open = decl + `const ${constName} = `.length;
  const closing = { '{': '}', '[': ']' }[html[open]];
  if (!closing) throw new Error(`${page} : ${constName} n'est ni un objet ni un tableau`);
  let depth = 0, quote = '';
  for (let i = open; i < html.length; i++) {
    const c = html[i];
    if (quote) {
      if (c === '\\') i += 1;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === html[open]) depth += 1;
    else if (c === closing) {
      depth -= 1;
      if (depth === 0) return new Function(`return ${html.slice(open, i + 1)};`)();
    }
  }
  throw new Error(`${page} : fin du bloc ${constName} introuvable`);
}

let count = 0;
const BUILDS = await guideBlock('bis.html', 'BUILDS');
for (const [cls, roles] of Object.entries(BUILDS)) {
  for (const [role, raw] of Object.entries(roles)) {
    const list = Array.isArray(raw) ? raw : [raw];
    list.forEach((build, i) => {
      count += 1;
      const where = `bis.html ${cls}/${role}${list.length > 1 ? ` #${i + 1}` : ''}`;
      const seen = checkBuild(where, cls, role, build, ['rotation']);
      if (seen) checkCoverage(where, cls, seen.spec, seen.cited);
    });
  }
}

// Le guide PvP n'a qu'un build par classe (toujours orienté DPS) et son « plan »
// est du texte : on n'y contrôle que les noms mis en avant en <b>…</b>.
const PVP = await guideBlock('pvp.html', 'PVP');
for (const [cls, build] of Object.entries(PVP)) {
  count += 1;
  // Le gras sert aussi à insister sur un bout de phrase (« ne peut plus
  // pivoter ») : seuls les fragments qui commencent par une majuscule sont
  // traités comme des noms de capacités, les noms du jeu étant tous anglais.
  const bolds = (build.plan ?? []).flatMap((line) => [...text(line).matchAll(/<b>([^<]+)<\/b>/g)]
    .map((m) => m[1].trim()).filter((n) => /^[A-Z]/.test(n)));
  checkBuild(`pvp.html ${cls}`, cls, null, { ...build, plan: bolds }, ['plan']);
}

// --- Enchantements (metiers.html) -------------------------------------------
// Le guide Enchantement est rédigé à la main ; le jeu, lui, publie son registre
// (src/sim/content/enchants.ts → data/ENCHANTS.json). Un enchantement ajouté par
// une MAJ passait donc inaperçu : « Enchant Offhand - Stamina » manquait au
// tableau (trouvé le 16 août 2026 en repassant tout le site).
const ENCH = await guideBlock('metiers.html', 'ENCH');
const enchByName = new Map(Object.values(ENCHANTS).map((e) => [e.name, e]));
const listed = new Set(ENCH.map((e) => e.n));
for (const e of Object.values(ENCHANTS)) {
  if (!listed.has(e.name)) fail('metiers.html', `enchantement absent du guide : « ${e.name} »`);
}
for (const e of ENCH) {
  const ref = enchByName.get(e.n);
  if (!ref) { fail('metiers.html', `enchantement « ${e.n} » inconnu du jeu`); continue; }
  const [stat, value] = Object.entries(ref.statBonus ?? {})[0] ?? [];
  if (stat !== e.stat || value !== e.v) {
    fail('metiers.html', `« ${e.n} » : le guide annonce ${e.stat} +${e.v}, le jeu ${stat} +${value}`);
  }
  if (ref.itemSlot !== e.slot) {
    fail('metiers.html', `« ${e.n} » : emplacement ${e.slot} dans le guide, ${ref.itemSlot} dans le jeu`);
  }
  const want = (ref.reagents ?? []).map((r) => `${r.itemId}x${r.count}`).sort().join(',');
  const got = (e.reg ?? []).map((r) => `${r.id}x${r.c}`).sort().join(',');
  if (want !== got) fail('metiers.html', `« ${e.n} » : matériaux ${got || '(aucun)'} au lieu de ${want}`);
}
count += ENCH.length;

// --- Montures (montures.html) -----------------------------------------------
// Le catalogue du jeu compte 9 montures ; la page n'en listait que 7 (les deux
// dernières n'ont pas encore de source, ce que la page doit dire plutôt que de
// les passer sous silence). On vérifie donc que chaque rênes du jeu apparaît.
const mountsPage = await readFile('montures.html', 'utf8');
for (const [id, item] of Object.entries(ITEMS)) {
  if (!item.mount) continue;
  count += 1;
  if (!mountsPage.includes(id)) {
    fail('montures.html', `monture absente du guide : ${item.name} (${id})`);
  }
}

if (problems.length) {
  for (const line of problems) console.log(line);
  console.log(`\n${problems.length} problème(s) sur ${count} entrées vérifiées.`);
  process.exit(1);
}
console.log(`✓ ${count} entrées vérifiées (builds, enchantements, montures) : les guides `
  + `écrits à la main collent aux données du jeu.`);
