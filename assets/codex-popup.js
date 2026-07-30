/* ============================================================================
   Codex Popup — fiches incrustées pour le site de La Clauderie
   ----------------------------------------------------------------------------
   Affiche une petite fiche dans la page (sans quitter le site) pour tout
   élément marqué  data-codex="type|référence"  :

     <span data-codex="item|swiftfang_talisman">Swiftfang Talisman</span>
     <span data-codex="ability|Mending Light">Mending Light</span>
     <span data-codex="talent|Seething Fury">Seething Fury</span>
     <span data-codex="mob|Thunzharr">Thunzharr</span>
     <span data-codex="term|soulbound">soulbound</span>
     <span data-codex="auto|Oathbrand">Oathbrand</span>   ← devine le type

   Types : item, ability (sort), talent, spec, mob, npc, quest, dungeon,
   delve, set, zone, term (glossaire français), auto (essaie tout).
   La référence est un id du jeu OU un nom exact (insensible aux accents).

   Les données viennent du Codex WoCC (même domaine GitHub Pages), chargées
   à la volée au premier clic puis mises en cache par le navigateur. Comme le
   Codex se régénère tout seul à chaque release du jeu, ces fiches sont
   toujours à jour sans aucune intervention.
   ============================================================================ */
(() => {
'use strict';

/* ---------- langue (FR / EN) ----------
   Autonome : lit localStorage directement, pour fonctionner même sur une
   page qui ne charge pas assets/lang.js. Les noms du jeu restent en anglais. */
const LANG = window.LANG || (localStorage.getItem('lang') === 'en' ? 'en' : 'fr');
const T = pair => pair[LANG];

/* ---------- configuration ---------- */

const GH_PAGES = 'https://reptile-new.github.io/wocc-knowledge-base';
// Sur laclauderie.fr, le Codex est copié sur l'hébergement à chaque
// déploiement : la page sous /codex/, les JSON sous /data/ — tout se lit en
// même origine, sans jamais quitter le domaine.
// En local (python3 -m http.server à la racine du dossier parent), le repo
// du codex est servi sous le même hôte : on garde des chemins relatifs au host.
// Partout ailleurs (miroir GitHub Pages…), on lit les JSON du Codex
// directement sur son GitHub Pages, qui autorise les requêtes cross-origin.
const onLocal = /^(localhost|127\.|0\.0\.0\.0)/.test(location.hostname);
const onLaclauderie = /(^|\.)laclauderie\.fr$/.test(location.hostname);
const DATA_BASE = window.CODEX_DATA_BASE ||
  (onLaclauderie ? '/data' : onLocal ? '/wocc-knowledge-base/data' : GH_PAGES + '/data');
const CODEX_SITE = onLaclauderie ? '/codex/'
  : onLocal ? '/wocc-knowledge-base/site/index.html'
  : GH_PAGES + '/site/index.html';
// Racine du site de la guilde : « / » sur laclauderie.fr, « /La-Clauderie/ »
// ailleurs (GitHub Pages, dev local) — pour les liens internes des fiches.
const SITE_BASE = onLaclauderie ? '/' : '/La-Clauderie/';

const FILES = ['ITEMS','MOBS','NPCS','QUESTS','DUNGEONS','DELVES','ITEM_SETS',
               'WORLD_BOSSES','ZONES','HEROIC_BOSS_LOOT','HEROIC_VENDOR_STOCK',
               'DELVE_SHOPS','ABILITIES','TALENTS','_meta'];

/* ---------- petits helpers ---------- */

const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Normalise aussi les apostrophes typographiques (’ ‘) en apostrophe droite :
// les alias du glossaire en utilisent, et un data-codex saisi avec l'une ou
// l'autre doit matcher pareil.
const fold = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'").toLowerCase().trim();
const asList = x => !x ? [] : Array.isArray(x) ? x : Object.values(x);

function money(copper) {
  if (!copper && copper !== 0) return '';
  const g = Math.floor(copper / 10000), s = Math.floor(copper / 100) % 100, c = copper % 100;
  const parts = [];
  const U = LANG === 'en' ? { g: 'g', s: 's', c: 'c' } : { g: 'po', s: 'pa', c: 'pc' };
  if (g) parts.push(`<b class="cxp-po">${g} ${U.g}</b>`);
  if (s) parts.push(`<b class="cxp-pa">${s} ${U.s}</b>`);
  if (c || !parts.length) parts.push(`<b class="cxp-pc">${c} ${U.c}</b>`);
  return parts.join(' ');
}
const pct = x => x == null ? '' : (x >= 0.995 ? '100 %' : (x * 100).toFixed(x < 0.01 ? 1 : 0) + ' %');
/* Un objet occupe souvent plusieurs emplacements d'une même table de butin
   (ex. Nythraxis liste une pièce 4× à 16-17 %). On combine en probabilité d'en
   obtenir AU MOINS UN sur le kill : 1 − Π(1 − chance_i) — une seule ligne, la
   vraie chance. Sans ça, la même source apparaissait en double. */
const combinePct = chances => {
  const cs = chances.filter(c => c != null);
  if (!cs.length) return '';
  let p = 1;
  for (const c of cs) p *= (1 - c);
  return pct(1 - p);
};

/* ---------- libellés (fr / en selon LANG) ---------- */

const QUALITY_FR = LANG === 'en'
  ? { poor:'Poor', common:'Common', uncommon:'Uncommon', rare:'Rare', epic:'Epic', legendary:'Legendary' }
  : { poor:'Médiocre', common:'Commun', uncommon:'Inhabituel', rare:'Rare', epic:'Épique', legendary:'Légendaire' };
const KIND_FR = LANG === 'en'
  ? { weapon:'Weapon', armor:'Armor', bag:'Bag', food:'Food', drink:'Drink', tool:'Tool', junk:'Junk', potion:'Potion', elixir:'Elixir', quest:'Quest item', held_offhand:'Held in off-hand' }
  : { weapon:'Arme', armor:'Armure', bag:'Sac', food:'Nourriture', drink:'Boisson', tool:'Outil', junk:'Camelote', potion:'Potion', elixir:'Élixir', quest:'Objet de quête', held_offhand:'Tenu en main gauche' };
const SLOT_FR = LANG === 'en'
  ? { mainhand:'Main hand', offhand:'Off hand', chest:'Chest', feet:'Feet', legs:'Legs', helmet:'Head', shoulder:'Shoulders', waist:'Waist', gloves:'Hands', neck:'Neck', ring:'Ring', ring1:'Ring', ring2:'Ring' }
  : { mainhand:'Main droite', offhand:'Main gauche', chest:'Torse', feet:'Pieds', legs:'Jambes', helmet:'Tête', shoulder:'Épaules', waist:'Taille', gloves:'Mains', neck:'Cou', ring:'Anneau', ring1:'Anneau', ring2:'Anneau' };
const ARMORTYPE_FR = LANG === 'en'
  ? { cloth:'Cloth', leather:'Leather', mail:'Mail' }
  : { cloth:'Tissu', leather:'Cuir', mail:'Mailles' };
const CLASS_FR = LANG === 'en'
  ? { warrior:'Warrior', mage:'Mage', rogue:'Rogue', priest:'Priest', warlock:'Warlock', druid:'Druid', hunter:'Hunter', paladin:'Paladin', shaman:'Shaman' }
  : { warrior:'Guerrier', mage:'Mage', rogue:'Voleur', priest:'Prêtre', warlock:'Démoniste', druid:'Druide', hunter:'Chasseur', paladin:'Paladin', shaman:'Chaman' };
const STAT_FR = LANG === 'en'
  ? { str:'Strength', sta:'Stamina', agi:'Agility', int:'Intellect', spi:'Spirit', armor:'Armor', ap:'Attack power', crit:'Crit rating', haste:'Haste rating', sp:'Spell power' }
  : { str:'Force', sta:'Endurance', agi:'Agilité', int:'Intelligence', spi:'Esprit', armor:'Armure', ap:"Puissance d'attaque", crit:'Score de critique', haste:'Score de hâte', sp:'Puissance des sorts' };
const FAMILY_FR = LANG === 'en'
  ? { demon:'Demon', beast:'Beast', spider:'Spider', humanoid:'Humanoid', mudfin:'Mudfin', burrower:'Burrower', undead:'Undead', troll:'Troll', ogre:'Ogre', elemental:'Elemental', dragonkin:'Dragonkin' }
  : { demon:'Démon', beast:'Bête', spider:'Araignée', humanoid:'Humanoïde', mudfin:'Mudfin', burrower:'Fouisseur', undead:'Mort-vivant', troll:'Troll', ogre:'Ogre', elemental:'Élémentaire', dragonkin:'Draconien' };
const SCHOOL_FR = LANG === 'en'
  ? { physical:'Physical', fire:'Fire', frost:'Frost', arcane:'Arcane', nature:'Nature', holy:'Holy', shadow:'Shadow' }
  : { physical:'Physique', fire:'Feu', frost:'Givre', arcane:'Arcanes', nature:'Nature', holy:'Sacré', shadow:'Ombre' };
const ROLE_FR = LANG === 'en'
  ? { tank:'Tank', healer:'Healer', dps:'DPS' }
  : { tank:'Tank', healer:'Soins', dps:'DPS' };
const BIOME_FR = LANG === 'en'
  ? { vale:'Vale', marsh:'Marsh', peaks:'Peaks', mountain:'Mountain', forest:'Forest' }
  : { vale:'Vallée', marsh:'Marais', peaks:'Pics', mountain:'Montagne', forest:'Forêt' };

/* Capacités spéciales des monstres (drapeaux booléens des données du jeu). */
const MOB_ABILITY_EN = {
  aoePulse:'AoE pulse', summonAdds:'Summons adds', enrage:'Enrage',
  cleave:'Cleave', mortalStrike:'Mortal strike', knockback:'Knockback',
  stomp:'Stomp', manaBurn:'Mana burn', packFrenzy:'Pack frenzy',
  thorns:'Thorns', venom:'Venom', ensnare:'Ensnare', lifeleech:'Life leech',
  plague:'Plague', silence:'Silence', terrify:'Terrify', spellReflect:'Spell reflect',
  stoneskin:'Stoneskin', warcry:'War cry', bleed:'Bleed',
  disarm:'Disarm', rampage:'Rampage', frostbite:'Frostbite', hex:'Hex',
  frenzyOnHit:'Frenzy on hit', wardAllies:'Wards allies',
  stunOnHit:'Stunning strike', polymorphHex:'Polymorph', blind:'Blind',
  demoralize:'Demoralize', soulrot:'Soul rot', slowStrike:'Slowing strike',
  corrode:'Corrode', sapVigor:'Saps vigor', desperateHeal:'Desperate heal',
  critVuln:'Exposes to crits', stackPoison:'Stacking poison', wither:'Wither',
  purgeOnHit:'Purge on hit', vulnerability:'Vulnerability', healAbsorb:'Absorbs healing',
  mendAlly:'Mends allies', costTax:'Costlier spells', siphonSpirit:'Spirit siphon',
  tongues:'Curse of tongues', arcaneRot:'Arcane rot', deathThroes:'Explodes on death',
  staggerHit:'Staggering strike', rally:'Rally', smolder:'Smolder', cinder:'Burning cinders',
  concuss:'Concuss', chillOnHit:'Chilling strike', spellVuln:'Exposes to spells',
  enfeeble:'Enfeeble', lockout:'Spell lockout', enervate:'Enervate',
  expose:'Exposes armor', aoeSlow:'AoE slow', bigCast:'Devastating cast',
  ccImmune:'CC immune', slowImmune:'Slow immune',
};
const MOB_ABILITY_FR_ONLY = {
  aoePulse:'Vague de zone', summonAdds:'Invoque des renforts', enrage:'Enrage',
  cleave:'Enchaînement', mortalStrike:'Frappe mortelle', knockback:'Projection',
  stomp:'Piétinement', manaBurn:'Brûlure de mana', packFrenzy:'Frénésie de meute',
  thorns:'Épines', venom:'Venin', ensnare:'Enchevêtrement', lifeleech:'Drain de vie',
  plague:'Peste', silence:'Silence', terrify:'Terreur', spellReflect:'Renvoi de sorts',
  stoneskin:'Peau de pierre', warcry:'Cri de guerre', bleed:'Saignement',
  disarm:'Désarmement', rampage:'Sauvagerie', frostbite:'Gelure', hex:'Maléfice',
  frenzyOnHit:'Frénésie au contact', wardAllies:'Protège ses alliés',
  stunOnHit:'Frappe étourdissante', polymorphHex:'Métamorphose', blind:'Aveuglement',
  demoralize:'Démoralisation', soulrot:"Pourriture d'âme", slowStrike:'Frappe ralentissante',
  corrode:'Corrosion', sapVigor:'Sape la vigueur', desperateHeal:'Soin désespéré',
  critVuln:'Expose aux critiques', stackPoison:'Poison cumulable', wither:'Flétrissement',
  purgeOnHit:'Dissipation au contact', vulnerability:'Vulnérabilité', healAbsorb:'Absorbe les soins',
  mendAlly:'Soigne ses alliés', costTax:'Sorts plus coûteux', siphonSpirit:"Siphon d'esprit",
  tongues:'Malédiction des langages', arcaneRot:'Pourriture arcanique', deathThroes:'Explose à la mort',
  staggerHit:'Frappe titubante', rally:'Ralliement', smolder:'Combustion', cinder:'Cendres brûlantes',
  concuss:'Commotion', chillOnHit:'Frappe glaçante', spellVuln:'Expose aux sorts',
  enfeeble:'Affaiblissement', lockout:'Verrouillage de sorts', enervate:'Énervation',
  expose:"Expose l'armure", aoeSlow:'Ralentissement de zone', bigCast:'Incantation dévastatrice',
  ccImmune:'Insensible au contrôle', slowImmune:'Insensible aux ralentissements',
};
const MOB_ABILITY_FR = LANG === 'en' ? MOB_ABILITY_EN : MOB_ABILITY_FR_ONLY;

/* ---------- glossaire (les « mots techniques ») ---------- */

const GLOSSARY_EN = {
  soulbound: { title: 'Soulbound', def: `A <b>soulbound</b> item is permanently bound to the character who picked it up: it cannot be given, traded or sold to another player. That's the case for most dungeon loot and for <span data-codex="term|heroic marks">Heroic Marks</span>.` },
  ilvl: { title: 'ilvl (item level)', def: `The <b>item level</b> measures the overall power of a piece of gear: the higher it is, the more stats the item carries. Two items of the same rarity can have different ilvls — in heroic, epics go up to ilvl 28 for instance.` },
  proc: { title: 'Proc', def: `A <b>proc</b> is an effect that triggers randomly when a condition is met — often “on every critical hit, X% chance to…”. The 4-piece bonuses of the epic sets and the legendary weapons work this way. See also <span data-codex="term|icd">ICD</span>.` },
  icd: { title: 'ICD (internal cooldown)', def: `The <b>Internal Cooldown</b> of a <span data-codex="term|proc">proc</span> is the minimum delay between two triggers. A “50%, 15s ICD” proc can never re-trigger less than 15 seconds after the previous one, no matter how lucky you get.` },
  dot: { title: 'DoT (damage over time)', def: `A <b>DoT</b> (<i>damage over time</i>) deals its damage in small regular ticks over several seconds — poisons, bleeds, curses. The healing equivalent is called a <span data-codex="term|hot">HoT</span>.` },
  hot: { title: 'HoT (heal over time)', def: `A <b>HoT</b> (<i>heal over time</i>) heals in small regular ticks over several seconds rather than all at once. Ideal to put on the tank <i>before</i> the damage comes in.` },
  buff: { title: 'Buff', def: `A <b>buff</b> is a temporary positive effect on a character (more strength, more speed…). The negative equivalent, applied by an enemy, is a <b>debuff</b>. Since v0.24.0, the 6 group buffs no longer stack between casters: the most recent replaces the previous one.` },
  debuff: { title: 'Debuff', def: `A <b>debuff</b> is a temporary negative effect on a target: reduced armor, a slow, a poison… Tanks and DPS aim to keep certain debuffs on the boss (like the armor reduction) for the whole fight.` },
  aggro: { title: 'Aggro & threat', def: `<b>Aggro</b> is “who the monster attacks”. Every action generates <b>threat</b>: the monster hits whoever has the most. The tank's job is to hold aggro; a DPS who “pulls aggro” is hitting too hard too early.` },
  lockout: { title: 'Lockout', def: `The <b>lockout</b> prevents re-running a heroic dungeon right away: since v0.24.0, killing the final boss locks <b>the whole group</b> (at the corpse or not) until the reset. No more “ferry” chaining final bosses.` },
  kiting: { title: 'Kiting', def: `<b>Kiting</b> a monster means keeping it at range by constantly moving while dealing damage — it chases you without ever touching you. Since v0.23.0, melee mobs strike while moving, which makes kiting riskier.` },
  gcd: { title: 'GCD (global cooldown)', def: `The <b>global cooldown</b> is the short delay (~1.5s) imposed between two actions, shared by almost all abilities. Some abilities are “off GCD”: they can be used without blocking anything else.` },
  crit: { title: 'Critical (crit)', def: `A <b>critical</b> hit deals increased damage (×2 in melee, ×1.5 for spells). Crit chance comes from Agility and from your gear's <b>Crit Rating</b>: 10 rating = 1% crit.` },
  haste: { title: 'Haste', def: `<b>Haste</b> speeds up both auto-attacks and spell casts. It comes from your gear's <b>Haste Rating</b>: 10 rating = 1% haste.` },
  ap: { title: 'Attack power (AP)', def: `<b>Attack power</b> increases the damage of physical attacks. It comes from Strength (and from Agility for rogues and hunters): each class has its own conversion.` },
  sp: { title: 'Spell power (SP)', def: `<b>Spell power</b> increases spell damage and healing. It comes from Intellect (0.5 SP per point of Int) and from the flat bonuses on caster gear.` },
  bis: { title: 'BiS (Best in Slot)', def: `The <b>Best in Slot</b> is, for each equipment slot, the most powerful item in the game for your class and role. The <a href="${SITE_BASE}bis.html">Builds</a> page computes it from the real patch data, set bonuses included.` },
  filler: { title: 'Filler', def: `The <b>filler</b> is a rotation's “gap-filling” spell: the one you cast when everything else is on cooldown. Not the most powerful, but always available.` },
  burst: { title: 'Burst', def: `<b>Burst</b> is a damage spike concentrated into a few seconds by lining up cooldowns and procs — as opposed to steady “sustained” damage.` },
  cooldown: { title: 'Cooldown', def: `An ability's <b>cooldown</b> is its recharge time before it can be used again. By extension, “cooldowns” are the big long-recharge abilities you save for the key moments.` },
  imbue: { title: 'Imbue (weapon imbuement)', def: `An <b>imbue</b> is a temporary enchantment that shamans and paladins put on their own weapon (Oathbrand, Stonebound Weapon…). Only one active at a time, refresh it regularly.` },
  interrupt: { title: 'Interrupt', def: `<b>Interrupting</b> means cutting an enemy's cast with a dedicated ability (a kick, a shield bash…), which stops the spell and locks it out for a few seconds. Vital against enemy healers in heroics.` },
  dispel: { title: 'Dispel', def: `<b>Dispelling</b> means removing a magic effect: a debuff on an ally, or a buff on an enemy. Some monsters dispel your buffs on hit.` },
  cc: { title: 'CC (crowd control)', def: `<b>Crowd control</b> covers everything that temporarily neutralises an enemy without killing it: stuns, polymorph, fear, roots… Some monsters are immune to it (“CC immune”), notably bosses.` },
  tank: { title: 'Tank', def: `The <b>tank</b> takes the hits in the group's place: they hold the monsters' <span data-codex="term|aggro">aggro</span> through threat and survive thanks to armor and HP. Warrior, paladin and bear druid fill this role.` },
  heal: { title: 'Healer', def: `The <b>healer</b> keeps the group alive, the <span data-codex="term|tank">tank</span> first. Priest, shaman, druid and paladin can fill this role depending on their specialisation.` },
  dps: { title: 'DPS', def: `<b>DPS</b> (<i>damage per second</i>) is both the measure of damage per second and the role of those whose job it is: kill fast, without stealing the tank's <span data-codex="term|aggro">aggro</span>.` },
  needgreed: { title: 'Need / Greed', def: `The group loot system: roll <b>Need</b> if the item directly improves your character, <b>Greed</b> otherwise. Need rolls always beat Greed rolls.` },
  worldboss: { title: 'World boss', def: `A <b>world boss</b> spawns in the open world (not in a dungeon), at regular intervals, and is fought by several groups at once. Thunzharr is the current example — its HP scales with the number of players present.` },
  delve: { title: 'Delve', def: `A <b>delve</b> is a small module-generated underground excursion, playable solo or in a small group, with an automatic companion if needed and increasing difficulty tiers.` },
  'heroic marks': { title: 'Heroic Marks', def: `The heroic-dungeon completion currency, exchangeable for epic jewellery at the dedicated vendor. Since v0.24.0 they are <span data-codex="term|soulbound">soulbound</span>, and a single final-boss loot pays the whole group.` },
  set: { title: 'Set (2P, 3P, 4P)', def: `A <b>set</b> is a matched collection of items: wearing several pieces unlocks cumulative bonuses, noted <b>2P / 3P / 4P</b> (for 2, 3 or 4 pieces worn). The 4P bonuses of the epic sets are often <span data-codex="term|proc">procs</span>.` },
  pull: { title: 'Pull', def: `<b>Pulling</b> means starting the fight by drawing one or more monsters toward the group. A good pull is chosen and controlled; a bad pull brings half the dungeon and ends in a <span data-codex="term|wipe">wipe</span>.` },
  wipe: { title: 'Wipe', def: `A <b>wipe</b> is the whole group dying on a fight. You retrieve your body, re-buff, and go again — it's part of learning a boss.` },
  rotation: { title: 'Rotation', def: `The <b>rotation</b> is the optimal order in which to chain your abilities in combat: the priorities to maintain (DoTs, debuffs), the abilities to fire as soon as they're ready, and the <span data-codex="term|filler">filler</span> to plug the gaps.` },
  spec: { title: 'Spec (specialisation)', def: `The <b>specialisation</b> is the direction chosen for your class (tank, healing or DPS, each with its own identity). It determines the <span data-codex="term|mastery">mastery</span>, the signature spell and the spec talent tree.` },
  mastery: { title: 'Mastery', def: `The <b>mastery</b> is the permanent passive bonus granted by a specialisation — for example “+10% melee damage” for a DPS spec. It is active as soon as the specialisation is chosen.` },
  uptime: { title: 'Uptime', def: `An effect's <b>uptime</b> is the percentage of the fight during which it is active. “Keeping good uptime” on a DoT or a debuff means reapplying it just before it expires, without wasting time.` },
  elite: { title: 'Elite', def: `An <b>elite</b> monster is far tougher than normal monsters of its level — meant to be fought as a group. <b>Rare</b> monsters are unique elites with long respawn timers and dedicated loot.` },
  ferry: { title: 'Ferry', def: `The <b>ferry</b> was having a practised group kill a heroic dungeon's final boss while “passengers” waited outside to pick up the reward. v0.24.0 ended it: the kill locks the whole group, present or not.` },
  threat: { title: 'Threat', def: `Every action in combat generates <b>threat</b>: damage generates it, healing too (half as much, split across enemies). The monster always attacks whoever has the most threat — see <span data-codex="term|aggro">aggro</span>.` },
};

const GLOSSARY_FR = {
  soulbound: { title: 'Soulbound (lié à l’âme)', def: `Un objet <b>soulbound</b> est lié définitivement au personnage qui l'a ramassé : impossible de le donner, de l'échanger ou de le vendre à un autre joueur. C'est le cas de la plupart des butins de donjon et des <span data-codex="term|heroic marks">Heroic Marks</span>.` },
  ilvl: { title: 'ilvl (niveau d’objet)', def: `Le <b>niveau d'objet</b> (item level) mesure la puissance globale d'une pièce d'équipement : plus il est haut, plus l'objet porte de statistiques. Deux objets de même rareté peuvent avoir des ilvl différents — en héroïque, les épiques montent par exemple à l'ilvl 28.` },
  proc: { title: 'Proc', def: `Un <b>proc</b> est un effet qui se déclenche aléatoirement quand une condition est remplie — souvent « à chaque coup critique, X % de chances de… ». Les bonus 4 pièces des sets épiques et les armes légendaires fonctionnent ainsi. Voir aussi <span data-codex="term|icd">ICD</span>.` },
  icd: { title: 'ICD (temps de recharge interne)', def: `L'<b>Internal Cooldown</b> d'un <span data-codex="term|proc">proc</span> est le délai minimum entre deux déclenchements. Un proc « 50 %, ICD 15 s » ne peut jamais se re-déclencher moins de 15 secondes après le précédent, même avec de la chance.` },
  dot: { title: 'DoT (dégâts sur la durée)', def: `Un <b>DoT</b> (<i>damage over time</i>) inflige ses dégâts par petites touches régulières pendant plusieurs secondes — poisons, saignements, malédictions. L'inverse pour les soins s'appelle un <span data-codex="term|hot">HoT</span>.` },
  hot: { title: 'HoT (soins sur la durée)', def: `Un <b>HoT</b> (<i>heal over time</i>) soigne par petites touches régulières pendant plusieurs secondes, plutôt qu'en une seule fois. Idéal à poser sur le tank <i>avant</i> que les dégâts n'arrivent.` },
  buff: { title: 'Buff', def: `Un <b>buff</b> est un effet positif temporaire posé sur un personnage (plus de force, plus de vitesse…). L'effet négatif équivalent, posé par un ennemi, est un <b>debuff</b>. Depuis la v0.24.0, les 6 buffs de groupe ne se cumulent plus entre lanceurs : le plus récent remplace l'ancien.` },
  debuff: { title: 'Debuff', def: `Un <b>debuff</b> est un effet négatif temporaire posé sur une cible : armure réduite, ralentissement, poison… Les tanks et DPS cherchent à maintenir certains debuffs sur le boss (comme la réduction d'armure) pendant tout le combat.` },
  aggro: { title: 'Aggro & menace', def: `L'<b>aggro</b> désigne « qui le monstre attaque ». Chaque action génère de la <b>menace</b> (threat) : le monstre frappe celui qui en a le plus. Le rôle du tank est de garder l'aggro ; un DPS qui « prend l'aggro » tape trop fort trop tôt.` },
  lockout: { title: 'Lockout (verrouillage)', def: `Le <b>lockout</b> empêche de refaire un donjon héroïque immédiatement : depuis la v0.24.0, tuer le boss final verrouille <b>tout le groupe</b> (présent ou non au corps) jusqu'à la réinitialisation. Fini le « ferry » qui enchaînait les boss finaux.` },
  kiting: { title: 'Kiting', def: `<b>Kiter</b> un monstre, c'est le garder à distance en se déplaçant sans cesse pendant qu'on lui inflige des dégâts — il court après vous sans jamais vous toucher. Depuis la v0.23.0, les mobs de mêlée frappent en avançant, ce qui rend le kiting plus risqué.` },
  gcd: { title: 'GCD (temps de recharge global)', def: `Le <b>global cooldown</b> est le court délai (~1,5 s) imposé entre deux actions, partagé par presque toutes les compétences. Certaines capacités sont « hors GCD » : elles s'utilisent sans bloquer le reste.` },
  crit: { title: 'Critique (crit)', def: `Un coup <b>critique</b> inflige des dégâts augmentés (×2 en mêlée, ×1,5 pour les sorts). La chance de critique vient de l'Agilité et du <b>Crit Rating</b> du stuff : 10 points de rating = 1 % de critique.` },
  haste: { title: 'Hâte (haste)', def: `La <b>hâte</b> accélère à la fois les attaques automatiques et les incantations. Elle vient du <b>Haste Rating</b> du stuff : 10 points de rating = 1 % de hâte.` },
  ap: { title: 'Puissance d’attaque (AP)', def: `L'<b>attack power</b> augmente les dégâts des attaques physiques. Elle vient de la Force (et de l'Agilité pour voleurs et chasseurs) : chaque classe a sa propre conversion.` },
  sp: { title: 'Puissance des sorts (SP)', def: `Le <b>spell power</b> augmente les dégâts et les soins des sorts. Il vient de l'Intelligence (0,5 SP par point d'Int) et des bonus fixes du stuff de lanceur de sorts.` },
  bis: { title: 'BiS (Best in Slot)', def: `Le <b>Best in Slot</b> est, pour chaque emplacement d'équipement, l'objet le plus puissant du jeu pour votre classe et votre rôle. La page <a href="${SITE_BASE}bis.html">Builds</a> le calcule à partir des vraies données du patch, bonus de sets compris.` },
  filler: { title: 'Filler', def: `Le <b>filler</b> est le sort « bouche-trou » d'une rotation : celui qu'on lance quand tout le reste est en recharge. Pas le plus puissant, mais toujours disponible.` },
  burst: { title: 'Burst', def: `Le <b>burst</b> est un pic de dégâts concentré sur quelques secondes, en cumulant cooldowns et procs — par opposition aux dégâts réguliers « soutenus » (sustained).` },
  cooldown: { title: 'Cooldown (recharge)', def: `Le <b>cooldown</b> d'une capacité est son temps de recharge avant de pouvoir la réutiliser. Par extension, « les cooldowns » désignent les grosses capacités à longue recharge qu'on garde pour les moments clés.` },
  imbue: { title: 'Imbue (imprégnation d’arme)', def: `Une <b>imprégnation</b> est un enchantement temporaire que chamans et paladins posent sur leur propre arme (Oathbrand, Stonebound Weapon…). Un seul actif à la fois, à renouveler régulièrement.` },
  interrupt: { title: 'Interruption', def: `<b>Interrompre</b>, c'est couper l'incantation d'un ennemi avec une capacité dédiée (coup de pied, coup de bouclier…), ce qui l'empêche de lancer son sort et le verrouille quelques secondes. Vital contre les soigneurs ennemis en héroïque.` },
  dispel: { title: 'Dissipation (dispel)', def: `<b>Dissiper</b>, c'est retirer un effet magique : un debuff posé sur un allié, ou un buff posé sur un ennemi. Certains monstres dissipent vos buffs au contact.` },
  cc: { title: 'CC (contrôle)', def: `Le <b>crowd control</b> regroupe tout ce qui neutralise temporairement un ennemi sans le tuer : étourdissement, métamorphose, peur, racines… Certains monstres y sont insensibles (« CC immune »), notamment les boss.` },
  tank: { title: 'Tank', def: `Le <b>tank</b> encaisse les coups à la place du groupe : il garde l'<span data-codex="term|aggro">aggro</span> des monstres grâce à sa menace et survit grâce à son armure et ses PV. Guerrier, paladin et druide-ours tiennent ce rôle.` },
  heal: { title: 'Heal (soigneur)', def: `Le <b>soigneur</b> maintient le groupe en vie, en priorité le <span data-codex="term|tank">tank</span>. Prêtre, chaman, druide et paladin peuvent tenir ce rôle selon leur spécialisation.` },
  dps: { title: 'DPS', def: `<b>DPS</b> (<i>damage per second</i>) désigne à la fois la mesure des dégâts par seconde et le rôle de ceux dont c'est le travail : tuer vite, sans voler l'<span data-codex="term|aggro">aggro</span> du tank.` },
  needgreed: { title: 'Need / Greed', def: `Le système de partage du butin en groupe : on lance <b>Need</b> (besoin) si l'objet améliore directement son personnage, <b>Greed</b> (cupidité) sinon. Les jets Need battent toujours les jets Greed.` },
  worldboss: { title: 'World boss', def: `Un <b>world boss</b> est un boss qui apparaît dans le monde ouvert (pas dans un donjon), à intervalle régulier, et se combat à plusieurs groupes. Thunzharr en est l'exemple actuel — ses PV montent avec le nombre de joueurs présents.` },
  delve: { title: 'Delve', def: `Une <b>delve</b> est une petite excursion souterraine générée par modules, jouable en solo ou petit groupe, avec un compagnon automatique si besoin et des paliers de difficulté croissants.` },
  'heroic marks': { title: 'Heroic Marks', def: `La monnaie de fin de donjon héroïque, échangeable contre des bijoux épiques chez le vendeur dédié. Depuis la v0.24.0 elles sont <span data-codex="term|soulbound">soulbound</span>, et un seul butin du boss final paie tout le groupe.` },
  set: { title: 'Set / Panoplie (2P, 3P, 4P)', def: `Une <b>panoplie</b> est un ensemble d'objets assortis : en porter plusieurs pièces débloque des bonus cumulatifs, notés <b>2P / 3P / 4P</b> (pour 2, 3 ou 4 pièces portées). Les bonus 4P des sets épiques sont souvent des <span data-codex="term|proc">procs</span>.` },
  pull: { title: 'Pull', def: `<b>Puller</b>, c'est engager le combat en attirant un ou plusieurs monstres vers le groupe. Un bon pull est choisi et maîtrisé ; un mauvais pull ramène la moitié du donjon et finit en <span data-codex="term|wipe">wipe</span>.` },
  wipe: { title: 'Wipe', def: `Un <b>wipe</b>, c'est la mort de tout le groupe sur un combat. On récupère son corps, on se re-buff, et on y retourne — ça fait partie de l'apprentissage d'un boss.` },
  rotation: { title: 'Rotation', def: `La <b>rotation</b> est l'ordre optimal dans lequel enchaîner ses capacités en combat : les priorités à maintenir (DoT, debuffs), les capacités à lancer dès qu'elles sont prêtes, et le <span data-codex="term|filler">filler</span> pour combler les trous.` },
  spec: { title: 'Spé (spécialisation)', def: `La <b>spécialisation</b> est l'orientation choisie pour sa classe (tank, soins ou DPS, avec une identité propre). Elle détermine la <span data-codex="term|mastery">maîtrise</span>, le sort signature et l'arbre de talents de spécialisation.` },
  mastery: { title: 'Maîtrise (mastery)', def: `La <b>maîtrise</b> est le bonus passif permanent conféré par une spécialisation — par exemple « +10 % de dégâts de mêlée » pour une spé DPS. Elle est active dès que la spécialisation est choisie.` },
  uptime: { title: 'Uptime', def: `L'<b>uptime</b> d'un effet est le pourcentage du combat pendant lequel il est actif. « Garder un bon uptime » sur un DoT ou un debuff, c'est le réappliquer juste avant qu'il n'expire, sans gaspiller de temps.` },
  elite: { title: 'Élite', def: `Un monstre <b>élite</b> est nettement plus coriace que les monstres normaux de son niveau — prévu pour être affronté en groupe. Les monstres <b>rares</b> sont des élites uniques à long temps de réapparition, avec du butin dédié.` },
  ferry: { title: 'Ferry', def: `Le <b>ferry</b> consistait à faire tuer le boss final d'un donjon héroïque par un groupe rodé pendant que des « passagers » attendaient dehors pour ramasser la récompense. La v0.24.0 y a mis fin : le kill verrouille tout le groupe, présent ou non.` },
  threat: { title: 'Menace (threat)', def: `Chaque action en combat génère de la <b>menace</b> : les dégâts en génèrent, les soins aussi (moitié moins, répartie sur les ennemis). Le monstre attaque toujours celui qui a le plus de menace — voir <span data-codex="term|aggro">aggro</span>.` },
};
const GLOSSARY = LANG === 'en' ? GLOSSARY_EN : GLOSSARY_FR;
/* alias → entrée du glossaire (les deux langues confondues) */
const GLOSSARY_ALIAS = {
  'specialization': 'spec', 'speciality': 'spec', 'item set': 'set', 'sets': 'set',
  'lie a l’ame': 'soulbound', 'lie': 'soulbound', 'item level': 'ilvl', 'niveau d’objet': 'ilvl',
  'internal cooldown': 'icd', 'temps de recharge interne': 'icd', 'procs': 'proc',
  'damage over time': 'dot', 'heal over time': 'hot', 'buffs': 'buff', 'debuffs': 'debuff', 'debuff': 'debuff',
  'menace': 'threat', 'global cooldown': 'gcd', 'critique': 'crit', 'crit rating': 'crit',
  'hate': 'haste', 'haste rating': 'haste', 'attack power': 'ap', 'puissance d’attaque': 'ap',
  'spell power': 'sp', 'puissance des sorts': 'sp', 'best in slot': 'bis',
  'recharge': 'cooldown', 'imprégnation': 'imbue', 'imbuement': 'imbue', 'interruption': 'interrupt',
  'dissipation': 'dispel', 'crowd control': 'cc', 'controle': 'cc', 'soigneur': 'heal', 'healer': 'heal',
  'need': 'needgreed', 'greed': 'needgreed', 'need/greed': 'needgreed',
  'world bosses': 'worldboss', 'delves': 'delve', 'heroic mark': 'heroic marks', 'marks': 'heroic marks',
  'panoplie': 'set', '2p': 'set', '3p': 'set', '4p': 'set', 'specialisation': 'spec', 'spe': 'spec',
  'maitrise': 'mastery', 'rare': 'elite', 'wipes': 'wipe',
};

/* ---------- chargement des données du Codex ---------- */

let dataPromise = null;
const D = {};                 // D.ITEMS = [...], etc.
const byId = {};              // byId.item['swiftfang_talisman'] = {...}
const byName = {};            // byName.item[fold(name)] = entité
const refs = { droppedBy:{}, soldBy:{}, rewardOf:{}, neededBy:{}, killedFor:{}, npcQuests:{}, mobDungeons:{}, setPieces:{}, vendorStock:{}, delveShop:{} };
let talentIndex = null;       // fold(name|id) -> { node, cls, choice? }
let specIndex = null;         // fold(name|id) -> { spec, cls }

function ensureData() {
  return dataPromise ??= Promise.all(
    FILES.map(f => fetch(`${DATA_BASE}/${f}.json`).then(r => r.ok ? r.json() : null).catch(() => null))
  ).then(res => {
    FILES.forEach((f, i) => D[f] = res[i]);
    if (!D.ITEMS) throw new Error('Codex injoignable');
    buildIndexes();
  }).catch(err => {
    // Ne pas mettre l'échec en cache : sans ça, un premier clic hors ligne
    // condamnait tous les suivants jusqu'au rechargement de la page.
    dataPromise = null;
    throw err;
  });
}

function reg(type, list) {
  byId[type] = {}; byName[type] = {};
  for (const e of list) { byId[type][e.id] = e; byName[type][fold(e.name)] = e; }
}

function buildIndexes() {
  reg('item', asList(D.ITEMS));
  reg('mob', asList(D.MOBS));
  reg('npc', asList(D.NPCS));
  reg('quest', asList(D.QUESTS));
  reg('dungeon', asList(D.DUNGEONS));
  reg('delve', asList(D.DELVES));
  reg('set', asList(D.ITEM_SETS));
  reg('zone', asList(D.ZONES));
  reg('ability', asList(D.ABILITIES));

  // Les world bosses sont indexés par l'id du monstre correspondant.
  byId.worldboss = {};
  for (const w of asList(D.WORLD_BOSSES)) byId.worldboss[w.templateId] = w;

  talentIndex = {}; specIndex = {};
  for (const [cls, tree] of Object.entries(D.TALENTS || {})) {
    for (const node of (tree.nodes || [])) {
      talentIndex[fold(node.id)] = { node, cls };
      talentIndex[fold(node.name)] ??= { node, cls };
      for (const ch of (node.choices || [])) {
        talentIndex[fold(ch.id)] = { node, cls, choice: ch };
        talentIndex[fold(ch.name)] ??= { node, cls, choice: ch };
      }
    }
    // Talents 2.0 (v0.27.0) : les rangées de choix arrivent sous tree.rows
    // ({ level, theme|decision, options: [...] }) — on les présente comme des
    // talents « au choix » classiques pour garder les mêmes fiches.
    (tree.rows || []).forEach((row, i) => {
      const node = {
        id: `${cls}_row_${row.level ?? i + 1}`,
        name: row.theme || row.decision || `${T({ fr: 'Rangée', en: 'Row' })} ${i + 1}`,
        kind: 'choice',
        tree: 'class',
        level: row.level,
        choices: row.options || [],
      };
      talentIndex[fold(node.id)] = { node, cls };
      talentIndex[fold(node.name)] ??= { node, cls };
      for (const ch of node.choices) {
        talentIndex[fold(ch.id)] = { node, cls, choice: ch };
        talentIndex[fold(ch.name)] ??= { node, cls, choice: ch };
      }
    });
    for (const s of (tree.specs || [])) {
      specIndex[fold(s.id)] = { spec: s, cls };
      specIndex[fold(s.name)] ??= { spec: s, cls };
    }
  }

  for (const m of asList(D.MOBS))
    for (const l of (m.loot || []))
      if (l.itemId) (refs.droppedBy[l.itemId] ??= []).push({ mob: m, chance: l.chance });
  for (const [mobId, entries] of Object.entries(D.HEROIC_BOSS_LOOT || {})) {
    const m = byId.mob[mobId];
    if (m) for (const l of (entries || []))
      if (l.itemId) (refs.droppedBy[l.itemId] ??= []).push({ mob: m, chance: l.chance, heroic: true });
  }
  for (const n of asList(D.NPCS))
    for (const it of (n.vendorItems || []))
      (refs.soldBy[it] ??= []).push(n);
  // Stock du quartier-maître héroïque (bijoux payés en Heroic Marks) et
  // boutiques de delve : sans eux, ces objets affichaient à tort
  // « Source non répertoriée ».
  for (const e of asList(D.HEROIC_VENDOR_STOCK))
    if (e && e.itemId) refs.vendorStock[e.itemId] = e.marks;
  for (const [delveId, entries] of Object.entries(D.DELVE_SHOPS || {})) {
    const dv = byId.delve[delveId];
    for (const e of (entries || []))
      if (e && e.itemId) (refs.delveShop[e.itemId] ??= []).push({ delve: dv, marks: e.marks, gate: e.gate });
  }
  for (const q of asList(D.QUESTS)) {
    for (const cls in (q.itemRewards || {})) {
      const arr = (refs.rewardOf[q.itemRewards[cls]] ??= []);
      if (!arr.includes(q)) arr.push(q);
    }
    for (const o of (q.objectives || [])) {
      if (o.type === 'collect' && o.itemId) (refs.neededBy[o.itemId] ??= []).push(q);
      if (o.type === 'kill' && o.targetMobId) (refs.killedFor[o.targetMobId] ??= []).push(q);
    }
    if (q.giverNpcId) (refs.npcQuests[q.giverNpcId] ??= []).push(q);
  }
  for (const d of asList(D.DUNGEONS))
    for (const s of (d.spawns || []))
      { const a = (refs.mobDungeons[s.mobId] ??= []); if (!a.includes(d)) a.push(d); }
  for (const it of asList(D.ITEMS))
    if (it.set) (refs.setPieces[it.set] ??= []).push(it);
}

/* ---------- résolution d'une référence ---------- */

function lookup(type, ref) {
  const k = fold(ref.replace(/\s*×\s*\d+\s*$/, ''));   // tolère « Swiftpaw ×2 »
  const k2 = k.replace(/\s*\([^)]*\)\s*$/, '');        // tolère « Ironguard (prot) »
  if (type === 'term') { const g = GLOSSARY[k] || GLOSSARY[GLOSSARY_ALIAS[k]] || GLOSSARY[k2] || GLOSSARY[GLOSSARY_ALIAS[k2]]; return g ? { type:'term', entity:g } : null; }
  if (type === 'talent') { const t = talentIndex[k] || talentIndex[k2]; return t ? { type:'talent', entity:t } : null; }
  if (type === 'spec') { const s = specIndex[k] || specIndex[k2]; return s ? { type:'spec', entity:s } : null; }
  if (type === 'worldboss') type = 'mob';
  if (byId[type]) {
    let e = byId[type][ref] || byId[type][k] || byName[type][k] || byName[type][k2];
    if (!e) {
      // Nom partiel toléré s'il est sans ambiguïté : « Thunzharr » suffit
      // pour « Thunzharr, the Waking Peak ».
      const hits = Object.keys(byName[type]).filter(n => n.startsWith(k) || n.includes(k));
      if (hits.length === 1) e = byName[type][hits[0]];
    }
    return e ? { type, entity:e } : null;
  }
  return null;
}

function resolve(type, ref) {
  if (type !== 'auto') return lookup(type, ref);
  for (const t of ['ability','talent','spec','item','set','mob','npc','quest','dungeon','delve','zone','term'])
    { const r = lookup(t, ref); if (r) return r; }
  return null;
}

/* ---------- briques de rendu ---------- */

const xlink = (type, e, label, cls) =>
  `<span class="cxp-x ${cls||''}" data-codex="${type}|${esc(e.id)}">${esc(label ?? e.name)}</span>`;
const section = (title, inner) => inner ? `<div class="cxp-sec"><h4>${title}</h4>${inner}</div>` : '';
const ul = rows => rows.length ? `<ul class="cxp-list">${rows.join('')}</ul>` : '';
const kvGrid = pairs => {
  const rows = pairs.filter(p => p && p[1] != null && p[1] !== '');
  return rows.length ? `<div class="cxp-kv">${rows.map(([k,v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>` : '';
};
const qColor = q => ({ poor:'#9d9d9d', uncommon:'#1eff00', rare:'#2f8bff', epic:'#a335ee', legendary:'#ff8000' })[q] || '';

/* ---------- fiches par type ---------- */

function itemSheet(it) {
  const q = it.quality || 'common';
  const body = [];
  // Art peint officiel du jeu, embarqué par le site sous assets/items/<id>.webp
  // (une jumelle héroïque partage l'art de sa base). L'image se retire toute
  // seule si l'objet n'a pas encore d'art — un 404 ne casse rien.
  const artId = String(it.id || '').replace(/^heroic_/, '');
  if (artId) body.push(`<img class="cxp-art" src="${SITE_BASE}assets/items/${artId}.webp" alt="" loading="lazy" onerror="this.remove()">`);
  if (it.weapon) body.push(`<div class="cxp-dps">${((it.weapon.min + it.weapon.max) / 2 / (it.weapon.speed || 1)).toFixed(1)} DPS — ${it.weapon.min}–${it.weapon.max} ${T({ fr: 'dégâts, vitesse', en: 'damage, speed' })} ${it.weapon.speed ?? '—'}</div>`);
  const stats = Object.entries(it.stats || {}).map(([k,v]) => `+${v} ${STAT_FR[k] || k}`);
  // Combat ratings + puissance des sorts : stockés HORS de it.stats dans les
  // données, ils étaient invisibles (ex. le Hit Rating ajouté en v0.26).
  const HIT_LBL = T({ fr: 'Précision', en: 'Hit rating' });
  for (const [key, lbl] of [['hitRating', HIT_LBL], ['critRating', STAT_FR.crit], ['hasteRating', STAT_FR.haste], ['spellPower', STAT_FR.sp],
                            ['pvpOffenseRating', T({ fr: 'Offense JcJ', en: 'PvP offense' })], ['pvpDefenseRating', T({ fr: 'Défense JcJ', en: 'PvP defense' })]])
    if (it[key]) stats.push(`+${it[key]} ${lbl}`);
  if (it.shield && it.blockValue) stats.push(`${it.blockValue} ${T({ fr: 'points de blocage', en: 'block value' })}`);
  if (stats.length) body.push(`<div class="cxp-stats">${stats.join('<br>')}</div>`);
  if (it.use) {
    const PROF_FR = LANG === 'en'
      ? { mining:'mining', herbalism:'herbalism', skinning:'skinning', fishing:'fishing' }
      : { mining:'minage', herbalism:'herboristerie', skinning:'dépeçage', fishing:'pêche' };
    const useLbl = it.use.type === 'fishing' ? T({ fr: 'Canne à pêche', en: 'Fishing pole' })
      : it.use.type === 'gatherTool' ? `${T({ fr: 'Outil de récolte', en: 'Gathering tool' })} — ${PROF_FR[it.use.professionId] || it.use.professionId}${it.use.tier ? `, ${T({ fr: 'palier', en: 'tier' })} ${it.use.tier}` : ''}`
      : it.use.type === 'skinSelect' ? T({ fr: 'Débloque un choix d’apparence', en: 'Unlocks an appearance choice' })
      : it.use.type === 'mechChroma' ? T({ fr: 'Coloris de monture mécanique', en: 'Mechanical mount chroma' })
      : null;
    if (useLbl) body.push(`<p class="cxp-note">${T({ fr: 'Utilisation : ', en: 'Use: ' })}${useLbl}</p>`);
  }
  const HP_U = T({ fr: 'PV', en: 'HP' });
  body.push(kvGrid([
    [T({ fr: 'Type', en: 'Type' }), it.shield ? T({ fr: 'Bouclier', en: 'Shield' }) : KIND_FR[it.kind]],
    [T({ fr: 'Emplacement', en: 'Slot' }), it.slot && SLOT_FR[it.slot]],
    [T({ fr: 'Armure', en: 'Armor' }), it.armorType && ARMORTYPE_FR[it.armorType]],
    [T({ fr: 'Contenance', en: 'Capacity' }), it.bagSlots && `${it.bagSlots} ${T({ fr: 'emplacements', en: 'slots' })}`],
    [T({ fr: 'Restaure', en: 'Restores' }), it.foodHp ? `${it.foodHp} ${HP_U}` : it.drinkMana ? `${it.drinkMana} mana` : it.potionHp ? `${it.potionHp} ${HP_U} (potion)` : it.potionMana ? `${it.potionMana} mana (potion)` : null],
    [T({ fr: 'Niveau requis', en: 'Required level' }), it.requiredLevel],
    [T({ fr: 'Classes', en: 'Classes' }), it.requiredClass && it.requiredClass.map(c => CLASS_FR[c] || c).join(', ')],
    [T({ fr: 'Vente', en: 'Sell price' }), it.sellValue && money(it.sellValue)],
  ]));
  if (it.soulbound) body.push(`<p class="cxp-note"><span class="cxp-x" data-codex="term|soulbound">Soulbound</span> — ${T({ fr: 'lié au personnage qui le ramasse.', en: 'bound to the character who picks it up.' })}</p>`);
  const TRIGGER_FR = LANG === 'en'
    ? { weaponCrit: 'weapon critical hit', weaponHit: 'weapon hit', spellDamage: 'spell damage', spellCrit: 'spell critical', heal: 'heal' }
    : { weaponCrit: "coup critique d'arme", weaponHit: "coup d'arme", spellDamage: 'dégâts de sort', spellCrit: 'critique de sort', heal: 'soin' };
  for (const p of (it.weaponProcs || [])) {
    const cond = [p.chance != null && pct(p.chance), TRIGGER_FR[p.trigger] && T({ fr: 'sur ', en: 'on ' }) + TRIGGER_FR[p.trigger]].filter(Boolean).join(' ');
    body.push(`<p class="cxp-note">✦ <span class="cxp-x" data-codex="term|proc">Proc</span> <b>${esc(p.name || '')}</b>${cond ? ` <span class="cxp-dim">— ${cond}</span>` : ''}</p>`);
  }

  if (it.set && byId.set[it.set])
    body.push(section(T({ fr: 'Panoplie', en: 'Item set' }), ul([`<li>${xlink('set', byId.set[it.set])}</li>`])));

  const src = [];
  // Agrégé par monstre (un objet peut occuper plusieurs slots de la table) :
  // une seule ligne par source, avec la chance combinée.
  const byMob = new Map();
  for (const d of (refs.droppedBy[it.id] || [])) {
    const key = (d.mob.id || d.mob.name) + '|' + (d.heroic ? 'h' : 'n');
    if (!byMob.has(key)) byMob.set(key, { mob: d.mob, heroic: d.heroic, chances: [] });
    byMob.get(key).chances.push(d.chance);
  }
  for (const g of byMob.values()) {
    const ch = combinePct(g.chances);
    src.push(`<li>${T({ fr: 'Butin', en: 'Loot' })}${g.heroic ? ` <b class="cxp-hero">${T({ fr: 'héroïque', en: 'heroic' })}</b>` : ''}${T({ fr: ' : ', en: ': ' })}${xlink('mob', g.mob)}${ch ? ` <span class="cxp-dim">· ${ch}</span>` : ''}</li>`);
  }
  for (const n of (refs.soldBy[it.id] || [])) {
    const price = it.buyValue ? money(it.buyValue)
      : it.priceHonor ? `${it.priceHonor} ${T({ fr: 'points d’honneur', en: 'honor points' })}` : '';
    src.push(`<li>${T({ fr: 'Vendu par', en: 'Sold by' })} ${xlink('npc', n)}${price ? ` <span class="cxp-dim">· ${price}</span>` : ''}</li>`);
  }
  if (refs.vendorStock[it.id] != null) {
    const vex = byId.npc['heroic_quartermaster'];
    const who = vex ? xlink('npc', vex) : T({ fr: 'le quartier-maître héroïque', en: 'the heroic quartermaster' });
    src.push(`<li>${T({ fr: 'Vendu par', en: 'Sold by' })} ${who} <span class="cxp-dim">· ${refs.vendorStock[it.id]} <span class="cxp-x" data-codex="term|heroic marks">Heroic Marks</span></span></li>`);
  }
  for (const s of (refs.delveShop[it.id] || [])) {
    const gate = s.gate === 'heroicClear' ? T({ fr: ' (après le clear héroïque)', en: ' (after a heroic clear)' })
      : /^clears:/.test(s.gate || '') ? T({ fr: ` (après ${s.gate.split(':')[1]} clears)`, en: ` (after ${s.gate.split(':')[1]} clears)` }) : '';
    src.push(`<li>${T({ fr: 'Boutique de delve : ', en: 'Delve shop: ' })}${s.delve ? xlink('delve', s.delve) : ''} <span class="cxp-dim">· ${s.marks} Marks${gate}</span></li>`);
  }
  for (const qq of (refs.rewardOf[it.id] || []))
    src.push(`<li>${T({ fr: 'Récompense de quête : ', en: 'Quest reward: ' })}${xlink('quest', qq)}</li>`);
  body.push(section(T({ fr: 'Où l’obtenir', en: 'Where to get it' }), src.length ? ul(src) : `<p class="cxp-dim">${T({ fr: 'Source non répertoriée (fabrication, récolte ou delve).', en: 'Source not listed (crafting, gathering or delve).' })}</p>`));

  return {
    kicker: [T({ fr: 'Objet', en: 'Item' }), QUALITY_FR[q], it.slot && SLOT_FR[it.slot]].filter(Boolean).join(' · '),
    title: it.name, titleColor: qColor(q),
    body: body.join(''), codexHref: `${CODEX_SITE}#item/${it.id}`,
  };
}

function abilitySheet(a) {
  const body = [];
  if (a.description) body.push(`<p class="cxp-desc">${esc(a.description)}</p>`);
  body.push(kvGrid([
    [T({ fr: 'Appris au niveau', en: 'Learned at level' }), a.learnLevel],
    [T({ fr: 'Coût', en: 'Cost' }), a.cost || null],
    [T({ fr: 'Incantation', en: 'Cast time' }), a.castTime ? `${a.castTime} s` : (a.channel ? T({ fr: 'Canalisé', en: 'Channeled' }) : T({ fr: 'Instantané', en: 'Instant' }))],
    [T({ fr: 'Recharge', en: 'Cooldown' }), a.cooldown ? `${a.cooldown} s` : null],
    [T({ fr: 'Portée', en: 'Range' }), a.range ? `${a.range} m` : T({ fr: 'Corps à corps', en: 'Melee' })],
    [T({ fr: 'École', en: 'School' }), SCHOOL_FR[a.school]],
  ]));
  const flags = [];
  if (a.onNextSwing) flags.push(T({ fr: 'se déclenche au prochain coup d’arme', en: 'triggers on your next weapon swing' }));
  if (a.offGcd) flags.push(T({ fr: 'hors', en: 'off' }) + ` <span class="cxp-x" data-codex="term|gcd">GCD</span>`);
  if (a.requiresStealth) flags.push(T({ fr: 'nécessite le camouflage', en: 'requires stealth' }));
  if (a.requiresOutOfCombat) flags.push(T({ fr: 'hors combat uniquement', en: 'out of combat only' }));
  if (flags.length) body.push(`<p class="cxp-note">${flags.join(' · ')}</p>`);
  if (a.ranks && a.ranks.length) {
    const last = a.ranks[a.ranks.length - 1];
    body.push(`<p class="cxp-dim">${T({ fr: `${a.ranks.length + 1} rangs — dernier rang au niveau ${last.level ?? '—'}.`, en: `${a.ranks.length + 1} ranks — final rank at level ${last.level ?? '—'}.` })}</p>`);
  }
  return {
    kicker: [T({ fr: 'Sort', en: 'Ability' }), CLASS_FR[a.class]].filter(Boolean).join(' · '),
    title: a.name, body: body.join(''),
  };
}

function talentSheet({ node, cls, choice }) {
  const body = [];
  if (choice) {
    body.push(`<p class="cxp-desc">${esc(choice.description || '')}</p>`);
    body.push(`<p class="cxp-dim">${T({ fr: 'Option du talent au choix', en: 'Option of the choice talent' })} « ${xlink('talent', node)} ».</p>`);
  } else {
    if (node.description) body.push(`<p class="cxp-desc">${esc(node.description)}</p>`);
    if (node.level) body.push(`<p class="cxp-dim">${T({ fr: `Rangée débloquée au niveau ${node.level}.`, en: `Row unlocked at level ${node.level}.` })}</p>`);
    if (node.maxRank > 1) body.push(`<p class="cxp-dim">${T({ fr: `Jusqu'à ${node.maxRank} rangs.`, en: `Up to ${node.maxRank} ranks.` })}</p>`);
    if (node.kind === 'choice' && node.choices)
      body.push(section(T({ fr: 'Talent au choix — une seule option', en: 'Choice talent — pick one option' }), ul(node.choices.map(ch =>
        `<li><b>${esc(ch.icon || '')} ${esc(ch.name)}</b><br><span class="cxp-dim">${esc(ch.description || '')}</span></li>`))));
  }
  const tree = node.tree === 'class' ? T({ fr: 'Arbre de classe', en: 'Class tree' }) : T({ fr: 'Arbre de spécialisation', en: 'Spec tree' });
  return {
    kicker: ['Talent', CLASS_FR[cls], tree].filter(Boolean).join(' · '),
    title: `${choice ? (choice.icon || '') : (node.icon || '')} ${choice ? choice.name : node.name}`.trim(),
    body: body.join(''),
  };
}

function specSheet({ spec, cls }) {
  const body = [];
  if (spec.description) body.push(`<p class="cxp-desc">${esc(spec.description)}</p>`);
  const sig = spec.signature && byId.ability[spec.signature];
  body.push(kvGrid([
    [T({ fr: 'Rôle', en: 'Role' }), ROLE_FR[spec.role] || spec.role],
    [T({ fr: 'Sort signature', en: 'Signature ability' }), sig ? xlink('ability', sig) : null],
  ]));
  if (spec.mastery) body.push(section(`${T({ fr: 'Maîtrise', en: 'Mastery' })} — ${esc(spec.mastery.name || '')}`,
    `<p class="cxp-desc">${esc(spec.mastery.description || '')}</p>`));
  return {
    kicker: [T({ fr: 'Spécialisation', en: 'Specialisation' }), CLASS_FR[cls]].filter(Boolean).join(' · '),
    title: `${spec.icon || ''} ${spec.name}`.trim(), body: body.join(''),
  };
}

function mobSheet(m) {
  const body = [];
  const rank = m.boss ? 'Boss' : m.elite ? (m.rare ? T({ fr: 'Élite rare', en: 'Rare elite' }) : T({ fr: 'Élite', en: 'Elite' })) : m.rare ? 'Rare' : null;
  const wb = byId.worldboss[m.id];
  body.push(kvGrid([
    [T({ fr: 'Niveau', en: 'Level' }), m.minLevel === m.maxLevel ? m.minLevel : `${m.minLevel}–${m.maxLevel}`],
    [T({ fr: 'Famille', en: 'Family' }), FAMILY_FR[m.family] || m.family],
    [T({ fr: 'Rang', en: 'Rank' }), wb ? 'World boss' : rank],
    [T({ fr: 'Réapparition', en: 'Respawn' }), wb && wb.intervalSeconds ? T({ fr: `toutes les ${Math.round(wb.intervalSeconds / 60)} min`, en: `every ${Math.round(wb.intervalSeconds / 60)} min` }) : null],
  ]));
  const abilities = Object.keys(MOB_ABILITY_FR).filter(k => m[k]);
  if (abilities.length)
    body.push(section(T({ fr: 'Capacités', en: 'Abilities' }), `<p>${abilities.map(k => `<span class="cxp-chip">${MOB_ABILITY_FR[k]}</span>`).join(' ')}</p>`));
  // Butin agrégé par objet (un objet peut occuper plusieurs slots) : une ligne
  // par objet, avec la chance combinée d'en obtenir au moins un.
  const groupLoot = entries => {
    const by = new Map();
    for (const l of (entries || [])) {
      if (!l.itemId || !byId.item[l.itemId]) continue;
      if (!by.has(l.itemId)) by.set(l.itemId, []);
      by.get(l.itemId).push(l.chance);
    }
    return by;
  };
  const loot = [...groupLoot(m.loot).entries()].map(([iid, chs]) => {
    const ch = combinePct(chs);
    return `<li>${xlink('item', byId.item[iid], null, 'q-' + (byId.item[iid].quality || 'common'))}${ch ? ` <span class="cxp-dim">· ${ch}</span>` : ''}</li>`;
  });
  const hloot = [...groupLoot((D.HEROIC_BOSS_LOOT || {})[m.id]).entries()].map(([iid, chs]) => {
    const ch = combinePct(chs);
    return `<li>${xlink('item', byId.item[iid], null, 'q-' + (byId.item[iid].quality || 'common'))} <b class="cxp-hero">${T({ fr: 'héroïque', en: 'heroic' })}</b>${ch ? ` <span class="cxp-dim">· ${ch}</span>` : ''}</li>`;
  });
  body.push(section(T({ fr: 'Butin', en: 'Loot' }), ul([...loot, ...hloot])));
  body.push(section(T({ fr: 'Où le trouver', en: 'Where to find it' }), ul((refs.mobDungeons[m.id] || []).map(d => `<li>${xlink('dungeon', d)}</li>`))));
  body.push(section(T({ fr: 'Quêtes qui le ciblent', en: 'Quests that target it' }), ul((refs.killedFor[m.id] || []).map(q => `<li>${xlink('quest', q)}</li>`))));
  return {
    kicker: [T({ fr: 'Monstre', en: 'Mob' }), rank, wb && 'World boss'].filter(Boolean).join(' · '),
    title: m.name, body: body.join(''), codexHref: `${CODEX_SITE}#mob/${m.id}`,
  };
}

function npcSheet(n) {
  const body = [];
  if (n.greeting) body.push(`<p class="cxp-quote">« ${esc(n.greeting)} »</p>`);
  const sells = (n.vendorItems || []).filter(id => byId.item[id])
    .map(id => `<li>${xlink('item', byId.item[id], null, 'q-' + (byId.item[id].quality || 'common'))}${byId.item[id].buyValue ? ` <span class="cxp-dim">· ${money(byId.item[id].buyValue)}</span>` : ''}</li>`);
  body.push(section(T({ fr: 'Vend', en: 'Sells' }), ul(sells)));
  body.push(section(T({ fr: 'Donne les quêtes', en: 'Gives the quests' }), ul((refs.npcQuests[n.id] || []).map(q => `<li>${xlink('quest', q)}</li>`))));
  if (n.banker) body.push(`<p class="cxp-note">🏦 ${T({ fr: 'Banquier — donne accès à votre coffre personnel.', en: 'Banker — grants access to your personal vault.' })}</p>`);
  return {
    kicker: [T({ fr: 'PNJ', en: 'NPC' }), n.title].filter(Boolean).join(' · '),
    title: n.name, body: body.join(''), codexHref: `${CODEX_SITE}#npc/${n.id}`,
  };
}

function questSheet(q) {
  const body = [];
  if (q.text) body.push(`<p class="cxp-quote">« ${esc(q.text).replace(/\$N/g, T({ fr: 'aventurier', en: 'adventurer' }))} »</p>`);
  const giver = byId.npc[q.giverNpcId], turnIn = byId.npc[q.turnInNpcId];
  body.push(kvGrid([
    [T({ fr: 'Donnée par', en: 'Given by' }), giver && xlink('npc', giver)],
    [T({ fr: 'À rendre à', en: 'Turn in to' }), turnIn && turnIn !== giver ? xlink('npc', turnIn) : null],
  ]));
  const obj = (q.objectives || []).map(o => {
    if (o.type === 'kill' && byId.mob[o.targetMobId]) return `<li>${T({ fr: 'Tuer', en: 'Kill' })} ${o.count ? o.count + ' × ' : ''}${xlink('mob', byId.mob[o.targetMobId])}</li>`;
    if (o.type === 'collect' && byId.item[o.itemId]) return `<li>${T({ fr: 'Rapporter', en: 'Bring back' })} ${o.count ? o.count + ' × ' : ''}${xlink('item', byId.item[o.itemId])}</li>`;
    return `<li>${esc(o.label || o.type || T({ fr: 'Objectif', en: 'Objective' }))}</li>`;
  });
  body.push(section(T({ fr: 'Objectifs', en: 'Objectives' }), ul(obj)));
  const rewards = [];
  if (q.xpReward) rewards.push(`<li><b class="cxp-xp">${q.xpReward} XP</b></li>`);
  if (q.copperReward) rewards.push(`<li>${money(q.copperReward)}</li>`);
  for (const [cls, itId] of Object.entries(q.itemRewards || {}))
    if (byId.item[itId]) rewards.push(`<li>${xlink('item', byId.item[itId], null, 'q-' + (byId.item[itId].quality || 'common'))} <span class="cxp-dim">(${CLASS_FR[cls] || cls})</span></li>`);
  body.push(section(T({ fr: 'Récompenses', en: 'Rewards' }), ul(rewards)));
  return {
    kicker: T({ fr: 'Quête', en: 'Quest' }), title: q.name, body: body.join(''), codexHref: `${CODEX_SITE}#quest/${q.id}`,
  };
}

function dungeonSheet(d) {
  const body = [];
  if (d.enterText) body.push(`<p class="cxp-quote">« ${esc(d.enterText)} »</p>`);
  body.push(kvGrid([[T({ fr: 'Joueurs conseillés', en: 'Suggested players' }), d.suggestedPlayers]]));
  const seen = new Set();
  const bosses = (d.spawns || []).map(s => byId.mob[s.mobId])
    .filter(m => m && (m.boss || m.elite) && !seen.has(m.id) && seen.add(m.id))
    .map(m => `<li>${xlink('mob', m)}${m.boss ? ' <b class="cxp-hero">boss</b>' : ''}</li>`);
  body.push(section(T({ fr: 'Boss & élites', en: 'Bosses & elites' }), ul(bosses)));
  return { kicker: T({ fr: 'Donjon', en: 'Dungeon' }), title: d.name, body: body.join(''), codexHref: `${CODEX_SITE}#dungeon/${d.id}` };
}

function delveSheet(d) {
  const body = [];
  if (d.enterText) body.push(`<p class="cxp-quote">« ${esc(d.enterText)} »</p>`);
  body.push(kvGrid([
    [T({ fr: 'Niveau minimum', en: 'Minimum level' }), d.minLevel],
    [T({ fr: 'Joueurs', en: 'Players' }), d.maxPlayers ? `1–${d.maxPlayers}` : d.suggestedPlayers],
    [T({ fr: 'Paliers de difficulté', en: 'Difficulty tiers' }), d.tiers && d.tiers.length],
  ]));
  const bosses = (d.bosses || []).map(id => byId.mob[id]).filter(Boolean).map(m => `<li>${xlink('mob', m)}</li>`);
  body.push(section('Boss', ul(bosses)));
  return { kicker: 'Delve', title: d.name, body: body.join(''), codexHref: `${CODEX_SITE}#delve/${d.id}` };
}

function setSheet(s) {
  const body = [];
  body.push(section('Bonus', ul((s.bonuses || []).map(b => `<li><b>${b.pieces} ${T({ fr: 'pièces', en: 'pieces' })}</b> — ${esc(b.text || b.description || '')}</li>`))));
  const pieces = (refs.setPieces[s.id] || []).map(it => `<li>${xlink('item', it, null, 'q-' + (it.quality || 'common'))}</li>`);
  body.push(section(`${T({ fr: 'Pièces', en: 'Pieces' })} (${pieces.length})`, ul(pieces)));
  return { kicker: T({ fr: 'Panoplie', en: 'Item set' }), title: s.name, body: body.join(''), codexHref: `${CODEX_SITE}#set/${s.id}` };
}

function zoneSheet(z) {
  const body = [];
  body.push(kvGrid([
    [T({ fr: 'Biome', en: 'Biome' }), BIOME_FR[z.biome] || z.biome],
    [T({ fr: 'Niveaux', en: 'Levels' }), z.levelRange && `${z.levelRange[0]}–${z.levelRange[1]}`],
    [T({ fr: 'Capitale', en: 'Hub' }), z.hub && z.hub.name],
  ]));
  body.push(section(T({ fr: 'Points d’intérêt', en: 'Points of interest' }), ul((z.pois || []).map(p => `<li>${esc(p.label)}</li>`))));
  return { kicker: 'Zone', title: z.name, body: body.join(''), codexHref: `${CODEX_SITE}#zone/${z.id}` };
}

function termSheet(g) {
  return { kicker: T({ fr: 'Glossaire', en: 'Glossary' }), title: g.title, body: `<p class="cxp-desc">${g.def}</p>` };
}

const SHEETS = {
  item: itemSheet, ability: abilitySheet, talent: talentSheet, spec: specSheet,
  mob: mobSheet, npc: npcSheet, quest: questSheet, dungeon: dungeonSheet,
  delve: delveSheet, set: setSheet, zone: zoneSheet, term: termSheet,
};

/* ---------- l'interface (dialog natif : passe au-dessus des modales) ---------- */

const CSS = `
  [data-codex] { border-bottom: 1px dotted rgba(200,160,75,.75); cursor: pointer; }
  [data-codex]:hover, [data-codex]:focus-visible { color: #e6c37a; border-bottom-color: #e6c37a; outline: none; }
  dialog.cxp {
    background: #141822; color: #dfe3ea; border: 1px solid rgba(200,160,75,.4);
    border-radius: 14px; padding: 0; width: min(440px, 92vw); max-height: 82vh;
    box-shadow: 0 24px 70px rgba(0,0,0,.6); font-size: .92rem; line-height: 1.5;
  }
  dialog.cxp::backdrop { background: rgba(5,7,11,.65); backdrop-filter: blur(2px); }
  dialog.cxp[open] { display: flex; flex-direction: column; }
  .cxp-head { display: flex; gap: 10px; align-items: flex-start; padding: 16px 18px 12px;
    border-bottom: 1px solid rgba(200,160,75,.18); position: sticky; top: 0; background: #141822; z-index: 1; }
  .cxp-head-txt { flex: 1; min-width: 0; }
  .cxp-kicker { font-size: .68rem; text-transform: uppercase; letter-spacing: .09em; color: #c8a04b; margin-bottom: 3px; }
  .cxp-title { margin: 0; font-size: 1.12rem; font-weight: 700; line-height: 1.25; }
  .cxp-btn { flex: none; background: none; border: 1px solid rgba(139,147,163,.35); color: #8b93a3;
    border-radius: 8px; width: 30px; height: 30px; cursor: pointer; font-size: .95rem; line-height: 1; }
  .cxp-btn:hover { color: #e6c37a; border-color: rgba(200,160,75,.5); }
  .cxp-body { padding: 14px 18px 16px; overflow-y: auto; flex: 1; }
  .cxp-body p { margin: 0 0 10px; } .cxp-body p:last-child { margin-bottom: 0; }
  .cxp-desc { color: #c9cfda; }
  .cxp-quote { color: #aab1bf; font-style: italic; }
  .cxp-note { color: #aab1bf; font-size: .86rem; }
  .cxp-dim { color: #8b93a3; font-size: .86rem; }
  .cxp-dps { font-weight: 600; margin-bottom: 8px; }
  .cxp-art { display: block; width: 96px; height: 96px; border-radius: 10px; margin: 0 0 10px;
    border: 1px solid rgba(200,160,75,.35); background: #0b0d12; object-fit: cover; }
  .cxp-stats { color: #1eff00cc; margin-bottom: 8px; }
  .cxp-kv { display: grid; grid-template-columns: 1fr; gap: 4px 14px; margin: 8px 0; }
  .cxp-kv div { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px dashed rgba(139,147,163,.16); padding: 3px 0; }
  .cxp-kv span { color: #8b93a3; }
  .cxp-sec { margin-top: 14px; }
  .cxp-sec h4 { margin: 0 0 6px; font-size: .72rem; text-transform: uppercase; letter-spacing: .08em; color: #c8a04b; }
  .cxp-list { margin: 0; padding: 0; list-style: none; }
  .cxp-list li { padding: 4px 0; border-bottom: 1px dashed rgba(139,147,163,.14); }
  .cxp-list li:last-child { border-bottom: none; }
  .cxp-x { border-bottom: 1px dotted rgba(200,160,75,.75); cursor: pointer; }
  .cxp-x:hover { color: #e6c37a; }
  .cxp-x.q-poor { color: #9d9d9d; } .cxp-x.q-uncommon { color: #1eff00; }
  .cxp-x.q-rare { color: #2f8bff; } .cxp-x.q-epic { color: #a335ee; } .cxp-x.q-legendary { color: #ff8000; }
  .cxp-chip { display: inline-block; background: rgba(200,160,75,.1); border: 1px solid rgba(200,160,75,.25);
    border-radius: 20px; padding: 1px 9px; margin: 2px 2px 2px 0; font-size: .78rem; }
  .cxp-hero { color: #ff8000; font-size: .78rem; }
  .cxp-xp { color: #b58cf5; }
  .cxp-po { color: #ffd76e; } .cxp-pa { color: #c8ccd6; } .cxp-pc { color: #d29d6b; }
  .cxp-foot { padding: 10px 18px 14px; border-top: 1px solid rgba(200,160,75,.18); font-size: .82rem; }
  .cxp-foot a { color: #c8a04b; text-decoration: none; }
  .cxp-foot a:hover { color: #e6c37a; text-decoration: underline; }
  .cxp-load { padding: 26px 18px; text-align: center; color: #8b93a3; }
`;

let dlg = null;
let stack = [];      // pile de fiches pour le bouton « ← »
let styleDone = false;

// La feuille de style contient aussi l'affordance des [data-codex] (pointillé
// doré + curseur) : elle doit être présente dès le chargement, pas seulement au
// premier clic — sinon rien n'indique quels mots sont cliquables.
function ensureStyle() {
  if (styleDone) return;
  styleDone = true;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
}

function ensureDialog() {
  if (dlg) return dlg;
  ensureStyle();
  dlg = document.createElement('dialog');
  dlg.className = 'cxp';
  dlg.setAttribute('aria-label', T({ fr: 'Fiche du Codex', en: 'Codex sheet' }));
  document.body.appendChild(dlg);
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => { stack = []; delete dlg.dataset.cur; });
  return dlg;
}

function render(sheet, fromBack) {
  const d = ensureDialog();
  if (!fromBack && d.dataset.cur) stack.push(d.dataset.cur);
  d.dataset.cur = JSON.stringify(sheet.ref);
  d.innerHTML = `
    <div class="cxp-head">
      ${stack.length ? `<button class="cxp-btn cxp-back" aria-label="${T({ fr: 'Fiche précédente', en: 'Previous sheet' })}" title="${T({ fr: 'Fiche précédente', en: 'Previous sheet' })}">←</button>` : ''}
      <div class="cxp-head-txt">
        <div class="cxp-kicker">${esc(sheet.kicker || '')}</div>
        <h3 class="cxp-title" ${sheet.titleColor ? `style="color:${sheet.titleColor}"` : ''}>${esc(sheet.title)}</h3>
      </div>
      <button class="cxp-btn cxp-close" aria-label="${T({ fr: 'Fermer', en: 'Close' })}" title="${T({ fr: 'Fermer', en: 'Close' })}">✕</button>
    </div>
    <div class="cxp-body">${sheet.body || ''}</div>
    ${sheet.codexHref ? `<div class="cxp-foot"><a href="${sheet.codexHref}" target="_blank" rel="noopener">${T({ fr: 'Fiche complète dans le Codex ↗', en: 'Full entry in the Codex ↗' })}</a></div>` : ''}`;
  d.querySelector('.cxp-close').onclick = () => d.close();
  const back = d.querySelector('.cxp-back');
  if (back) back.onclick = () => {
    const prev = JSON.parse(stack.pop());
    openRef(prev[0], prev[1], true);
  };
  if (!d.open) (typeof d.showModal === 'function' ? d.showModal() : d.setAttribute('open', ''));
  d.querySelector('.cxp-body').scrollTop = 0;
}

function openRef(type, ref, fromBack) {
  const d = ensureDialog();
  if (!d.open) {
    d.innerHTML = `<div class="cxp-load">${T({ fr: 'Consultation du Codex…', en: 'Consulting the Codex…' })}</div>`;
    (typeof d.showModal === 'function' ? d.showModal() : d.setAttribute('open', ''));
  }
  ensureData().then(() => {
    const hit = resolve(type, ref);
    if (!hit) {
      render({ ref: [type, ref], kicker: 'Codex', title: ref,
        body: `<p class="cxp-dim">${T({ fr: `Pas de fiche trouvée pour « ${esc(ref)} ».`, en: `No entry found for “${esc(ref)}”.` })}</p>
               <p><a class="cxp-x" href="${CODEX_SITE}" target="_blank" rel="noopener" style="border:none">${T({ fr: 'Chercher dans le Codex ↗', en: 'Search the Codex ↗' })}</a></p>` }, fromBack);
      return;
    }
    const sheet = SHEETS[hit.type](hit.entity);
    sheet.ref = [type, ref];
    render(sheet, fromBack);
  }).catch(() => {
    render({ ref: [type, ref], kicker: 'Codex', title: T({ fr: 'Codex injoignable', en: 'Codex unreachable' }),
      body: `<p class="cxp-dim">${T({ fr: 'Impossible de charger les données du jeu pour le moment.', en: 'Could not load the game data right now.' })}</p>
             <p><a class="cxp-x" href="${CODEX_SITE}" target="_blank" rel="noopener" style="border:none">${T({ fr: 'Ouvrir le Codex ↗', en: 'Open the Codex ↗' })}</a></p>` }, fromBack);
  });
}

/* ---------- déclenchement : clic ou clavier sur [data-codex] ---------- */

function refOf(el) {
  const [type, ...rest] = el.dataset.codex.split('|');
  return [type.trim(), rest.join('|').trim() || el.textContent.trim()];
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-codex]');
  if (!el) return;
  e.preventDefault();
  e.stopPropagation();
  openRef(...refOf(el));
}, true);

document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const el = e.target.closest?.('[data-codex]');
  if (!el) return;
  e.preventDefault();
  e.stopPropagation();
  openRef(...refOf(el));
}, true);

/* Rend les éléments marqués focusables au clavier (à rappeler après un rendu dynamique). */
function enhance(root) {
  (root || document).querySelectorAll('[data-codex]:not([tabindex])').forEach(el => {
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
    if (!el.title) el.title = T({ fr: 'Voir la fiche', en: 'View the sheet' });
  });
}
/* Les liens de navigation vers le Codex sont écrits pour laclauderie.fr
   (« /codex/ ») ; ailleurs (miroir GitHub Pages, dev local), on les repointe
   vers l'adresse du Codex propre à l'environnement. */
function fixCodexLinks() {
  if (onLaclauderie) return;
  document.querySelectorAll('a[href^="/codex/"]').forEach(a => {
    a.setAttribute('href', CODEX_SITE + a.getAttribute('href').slice('/codex/'.length));
  });
}

const boot = () => {
  ensureStyle();
  enhance();
  fixCodexLinks();
  // Les pages injectent des [data-codex] après leurs fetch (accueil, builds…) :
  // on ré-applique enhance() sur les ajouts pour garder l'accès clavier.
  new MutationObserver(muts => {
    for (const m of muts) for (const n of m.addedNodes)
      if (n.nodeType === 1 && (n.matches?.('[data-codex]') || n.querySelector?.('[data-codex]'))) { enhance(n); return; }
  }).observe(document.body, { childList: true, subtree: true });
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

window.CodexPopup = { open: openRef, enhance };

})();
