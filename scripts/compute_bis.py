#!/usr/bin/env python3
# -----------------------------------------------------------------------------
# Calcul du BiS (Best in Slot) de La Clauderie — avec bonus de sets.
#
# Toutes les formules sont portées du code du jeu (World of ClaudeCraft,
# tag v0.23.0, fichiers src/sim/entity.ts, types.ts, combat/auto_attack.ts,
# item_level.ts, equipment_rules.ts) :
#   - AP mêlée : guerrier/paladin/chaman/druide = 2×For ; voleur/chasseur =
#     For+Agi ; casters = For. AP distance (chasseur) = 2×Agi.
#   - Puissance des sorts = 0.5×Int + SP fixe des objets/sets.
#   - Crit = 5% + 0.05%/Agi + rating/10 (10 rating = 1%). Crit mêlée ×2,
#     crit sort ×1.5 (hypothèse classic, le multiplicateur exact des sorts
#     n'est pas dans les fichiers audités).
#   - Hâte = rating/10 en %. Accélère attaques ET incantations.
#   - Armure : gear + 2×Agi ; mitigation = armure/(armure + 85×20 + 400),
#     plafonnée à 75% (attaquant niveau 20).
#   - PV = baseHp + hpPerLevel×19 + End (20 premières ×1, ensuite ×10).
#   - Mana = baseMana + manaPerLevel×19 + Int (20 premières ×1, ensuite ×15).
#   - Swing = moyenne d'arme + AP/14×vitesse ; Auto Shot chasseur : 0.6×arme.
#   - Formes druide : ours (armure ×1.9, PV ×1.15, AP +15+1.5×Agi),
#     félin (AP +8+2×niveau, +10 Agi ; les dégâts de l'arme ne comptent pas).
#
# Les procs de set 4P sont valorisés en espérance (uptime estimée à partir de
# chance / ICD / durée et d'un rythme de coups réaliste) — détails en bas.
#
# Usage :  python3 compute_bis.py <dossier data de la knowledge base> > bis.json
# -----------------------------------------------------------------------------
import json, sys, itertools, copy, math

# Math.round de JS (x,5 arrondi vers le haut) — le round() de Python arrondit
# au pair (49,5 → 50 mais 50,5 → 50), ce qui crée de faux plateaux : un +2 Int
# pouvait valoir 0 puis 2 de puissance des sorts au lieu de toujours 1 comme en
# jeu (entity.ts : Math.round(int × 0.5)). Utilisé partout où le jeu arrondit.
def jround(x): return math.floor(x + 0.5)

DATA = sys.argv[1] if len(sys.argv) > 1 else '../wocc-knowledge-base/data'
ITEMS = json.load(open(f'{DATA}/ITEMS.json'))
SETS = json.load(open(f'{DATA}/ITEM_SETS.json'))

# --- sources d'obtention (pour la fiche au clic sur le site) ------------------
def _load(name, default):
    try: return json.load(open(f'{DATA}/{name}.json'))
    except FileNotFoundError: return default

_MOBS = _load('MOBS', {})
_NPCS = _load('NPCS', {})
_QUESTS = _load('QUESTS', {})
_HEROIC = _load('HEROIC_BOSS_LOOT', {})
_DUNGEONS = _load('DUNGEONS', {})
# Enchantements (v0.29 : l'enchantement est en jeu ; KB : data/ENCHANTS.json,
# source src/sim/content/enchants.ts). statBonus ne contient que des clés de la
# feuille de stats (str/agi/sta/int/spi/armor) — vérifié sur les données.
ENCHANTS = _load('ENCHANTS', {})

# --- obtenabilité des jumelles héroïques (port de loot/loot_roll.ts) ----------
# Le jeu n'échange un drop contre sa variante « heroic_<id> » que si :
#   1. le mob meurt dans une instance en difficulté héroïque — les 4 donjons
#      5-joueurs et l'arène du raid Nythraxis (dungeon_difficulty.ts) ; les
#      élites du monde ouvert et le boss mondial Thunzharr, jamais ;
#   2. l'ilvl de la variante dépasse celui de la base (item_level.ts : niveau
#      de la source + bonus de qualité, +3 si raid). Variante = source 27 si la
#      base est au butin de Nythraxis, sinon 22 ; base = niveau max du mob
#      (+3 pour le raid). D'où « raid epics, already ilvl 29, are left as-is » :
#      les pièces de set du boss mondial (ilvl 29) ne s'échangent jamais.
# Une jumelle qui ne satisfait pas les deux conditions n'existe pas en jeu :
# hors du pool BiS, et pas de provenance « Butin héroïque ».
_HEROIC_INSTANCES = {'hollow_crypt', 'sunken_bastion', 'drowned_temple',
                     'gravewyrm_sanctum', 'nythraxis_boss_arena'}
_RAID_BOSS = 'nythraxis_scourge_of_thornpeak'
_INSTANCE_MOBS = {  # boss finaux + mini-boss scripté (zone1.ts), hors spawns
    'morthen', 'vael_the_mistcaller', 'ysolei', 'korzul_the_gravewyrm',
    _RAID_BOSS, 'wraithbinder_maldrec',
}
for _did, _dg in _DUNGEONS.items():
    if _did in _HEROIC_INSTANCES:
        _INSTANCE_MOBS.update(_sp['mobId'] for _sp in _dg.get('spawns', []))

_RAID_BASES = {_l['itemId'] for _l in _MOBS.get(_RAID_BOSS, {}).get('loot', [])
               if isinstance(_l, dict) and _l.get('itemId')}

def _heroic_obtainable(hid):
    base = hid[len('heroic_'):]
    variant_src = 27 if base in _RAID_BASES else 22
    ok = False
    for _m in _MOBS.values():
        if _m['id'] not in _INSTANCE_MOBS: continue
        if not any(isinstance(_l, dict) and _l.get('itemId') == base for _l in _m.get('loot', [])): continue
        base_src = (_m.get('maxLevel') or 0) + (3 if _m['id'] == _RAID_BOSS else 0)
        if variant_src > base_src: ok = True
    return ok

HEROIC_OK = {i for i in ITEMS if i.startswith('heroic_') and i[len('heroic_'):] in ITEMS
             and _heroic_obtainable(i)}
UNOBTAINABLE = {i for i in ITEMS if i.startswith('heroic_') and i[len('heroic_'):] in ITEMS
                and i not in HEROIC_OK}
# S'y ajoutent, une fois toutes les provenances construites (plus bas), les
# équipements « héritage » : définis dans les données mais placés nulle part
# dans le jeu (ex. Crossroads Saber) — un BiS ne doit rien recommander
# d'impossible à obtenir. Rempli après la construction de SOURCES.

SOURCES = {}  # iid -> liste de lignes prêtes à afficher (dédupliquées)
def _add(iid, line):
    if line not in SOURCES.setdefault(iid, []):
        SOURCES[iid].append(line)

# Un même objet occupe souvent PLUSIEURS emplacements de la table de butin d'un
# boss (ex. Nythraxis liste une épaulière 4× à 16-17 %). On agrège par source
# pour n'afficher qu'UNE ligne, avec la probabilité d'en obtenir au moins un sur
# le kill : 1 − Π(1 − chance_i). Sans ça, on voyait la même source en double.
def _pct_combined(chances):
    cs = [c for c in chances if c]
    if not cs:
        return ''
    p = 1.0
    for c in cs:
        p *= (1 - c)
    return f" · {round((1 - p) * 100)} %"

def _loot_by_item(entries):
    by = {}
    for _l in entries or []:
        if isinstance(_l, dict) and _l.get('itemId'):
            by.setdefault(_l['itemId'], []).append(_l.get('chance'))
    return by

for _m in _MOBS.values():
    for _iid, _chs in _loot_by_item(_m.get('loot')).items():
        _add(_iid, f"Butin : {_m['name']}{_pct_combined(_chs)}")
for _bid, _entries in _HEROIC.items():
    _bname = _MOBS.get(_bid, {}).get('name', _bid)
    for _iid, _chs in _loot_by_item(_entries).items():
        _add(_iid, f"Butin héroïque : {_bname}{_pct_combined(_chs)}")
for _n in _NPCS.values():
    for _iid in _n.get('vendorItems', []):
        _add(_iid, f"Vendu par {_n['name']}")
# Quartier-maître héroïque : bijoux payés en Heroic Marks (heroic_vendor.ts) —
# la seule source des cous/anneaux épiques hors butin.
_VEX = _MOBS.get('heroic_quartermaster', {}).get('name') or 'Quartermaster Vex'
for _o in _load('HEROIC_VENDOR_STOCK', []):
    _add(_o['itemId'], f"Vendu par {_VEX} · {_o['marks']} Heroic Marks")
# Boutiques de delve (payées en Marks, shop.ts) et reliquaire « bountiful » du
# rite final du Drowned Litany (drowned_litany_loot.ts, 3 % — les trois épiques).
_DELVE_NAMES = {d['id']: d['name'] for d in _load('DELVES', {}).values()}
for _did, _entries in _load('DELVE_SHOPS', {}).items():
    for _o in _entries:
        _add(_o['itemId'], f"Boutique du delve {_DELVE_NAMES.get(_did, _did)} · {_o['marks']} marks")
for _iid in ('blackwater_vanguard_chest', 'siltstep_leggings', 'sunken_reliquary_hood'):
    _add(_iid, f"Reliquaire bountiful du delve {_DELVE_NAMES.get('drowned_litany', 'The Drowned Litany')} · 3 %")
for _iid in ('deacon_reliquary_helm', 'varric_shadow_cowl', 'reliquary_plate_chest', 'reliquary_cloth_chest',
             'reliquary_leather_chest', 'reliquary_gloves_rog', 'reliquary_legs', 'reliquary_helm', 'reliquary_shoulder'):
    _add(_iid, f"Coffre verrouillé (crochetage) du delve {_DELVE_NAMES.get('collapsed_reliquary', 'The Collapsed Reliquary')}")
for _iid in ('siltguard_helm', 'bulwark_rusted_pauldrons', 'nhalias_bell_maul', 'reedstalker_jerkin', 'mirejaw_fang_knife',
             'widow_silk_hood', 'cantors_drowned_sash', 'corpse_candle_focus', 'nhalias_litany_rod'):
    _add(_iid, f"Reliquaire du rite final du delve {_DELVE_NAMES.get('drowned_litany', 'The Drowned Litany')}")
# Fabrication (ALL_RECIPES), équipement de départ (CLASSES) et stock permanent
# du Marché mondial (market.ts, seedHouseListings — table inline du jeu).
for _r in _load('ALL_RECIPES', []):
    if _r.get('resultItemId'):
        _add(_r['resultItemId'], f"Fabrication : {_r.get('professionId', 'métier')}")
_FRCLS = {'warrior':'Guerrier','paladin':'Paladin','shaman':'Chaman','druid':'Druide','priest':'Prêtre',
          'mage':'Mage','warlock':'Démoniste','rogue':'Voleur','hunter':'Chasseur'}
for _cid, _c in _load('CLASSES', {}).items():
    for _iid in (_c.get('startWeapon'), _c.get('startChest')):
        if _iid: _add(_iid, f"Équipement de départ ({_FRCLS.get(_cid, _cid)})")
for _iid in ('roadwardens_helm', 'wayfarers_hood', 'acolytes_circlet', 'reinforced_pauldrons', 'embroidered_mantle',
             'sturdy_belt', 'silk_sash', 'roughspun_gloves', 'outrider_brigandine', 'caravan_quilted_vest',
             'outrider_legguards', 'pilgrims_leggings', 'outrider_sabatons', 'tradesman_hatchet', 'drovers_staff',
             'caravan_warden_dirk', 'greyjaw_pelt_cloak', 'oiled_boots', 'quilted_trousers'):
    _add(_iid, "Marché mondial (stock permanent de la maison)")
for _q in _QUESTS.values():
    for _iid in set((_q.get('itemRewards') or {}).values()):
        _add(_iid, f"Récompense de quête : « {_q['name']} »")
# Jumelles héroïques obtenables : le jeu échange le drop en place au kill
# héroïque (loot_roll.ts), donc même mob et même taux que la base — mais
# uniquement pour les mobs des instances héroïques (jamais le monde ouvert).
for _iid in sorted(HEROIC_OK):
    _base = _iid[len('heroic_'):]
    for _m in _MOBS.values():
        if _m['id'] not in _INSTANCE_MOBS: continue
        _chs = [_l.get('chance') for _l in _m.get('loot', [])
                if isinstance(_l, dict) and _l.get('itemId') == _base]
        if _chs:
            _add(_iid, f"Butin héroïque : {_m['name']}{_pct_combined(_chs)}")

# Butin des Failles (RIFT_LOOT.json, extrait depuis la v0.32.0) : ces
# récompenses sont attribuées PAR LE CODE du jeu à la victoire
# (rift/progression.ts, addRiftClearGearLoot) — aucune table de butin ne les
# liste. Sans ce bloc, elles passaient pour « héritage » inobtenable et le BiS
# les écartait à tort. Toléré absent (données antérieures à la v0.32.0).
_RIFT = _load('RIFT_LOOT', {})
for _iid in _RIFT.get('epicIds', []):
    _add(_iid, "Faille (rang B ou plus) : épique de victoire garanti")
_LEGPCT = _RIFT.get('legendaryChanceS')
for _iid in _RIFT.get('legendaryIds', []):
    _add(_iid, "Faille rang S : légendaire"
         + (f" · {round(_LEGPCT * 100, 1)} % par victoire" if _LEGPCT else ""))
for _iid in _RIFT.get('rareIds', []):
    _add(_iid, "Faille : drop d'ambiance (trash, gros taux sur le boss d'ambiance)")
for _iid in _RIFT.get('gearIds', []):
    _add(_iid, "Faille : first-clear (équipement personnel, améliorable à l'Essence)")
for _tier, _mi in sorted((_RIFT.get('mounts') or {}).items()):
    for _iid in _mi.get('reins', []):
        _ch = _mi.get('chance')
        _add(_iid, f"Faille rang {_tier} : monture"
             + (f" · {round(_ch * 100, 1)} % par victoire" if _ch else ""))

# Héritage : équipement (arme/armure) sans AUCUNE provenance connue — ni butin,
# ni vendeur, ni quête, ni delve, ni marché, ni départ de classe. Vérifié dans
# le code du jeu v0.25.0 : ces objets ne sont placés nulle part. Hors du pool.
UNOBTAINABLE |= {iid for iid, it in ITEMS.items()
                 if it.get('kind') in ('armor', 'weapon')
                 and iid not in SOURCES and not iid.startswith('heroic_')}

LVL = 20
CLASSES = {
    'warrior': {'base': {'str':23,'agi':20,'sta':22,'int':10,'spi':11,'armor':50}, 'per': {'str':2,'agi':1,'sta':2,'int':0,'spi':0,'armor':12}, 'hp': (50,18), 'mana': (100,0)},
    'paladin': {'base': {'str':22,'agi':17,'sta':22,'int':13,'spi':14,'armor':45}, 'per': {'str':2,'agi':1,'sta':2,'int':1,'spi':1,'armor':12}, 'hp': (55,17), 'mana': (80,20)},
    'shaman':  {'base': {'str':18,'agi':16,'sta':20,'int':18,'spi':18,'armor':40}, 'per': {'str':1,'agi':1,'sta':2,'int':2,'spi':2,'armor':10}, 'hp': (48,15), 'mana': (90,22)},
    'druid':   {'base': {'str':15,'agi':15,'sta':17,'int':19,'spi':20,'armor':30}, 'per': {'str':1,'agi':1,'sta':2,'int':2,'spi':2,'armor':6},  'hp': (45,13), 'mana': (95,22)},
    'priest':  {'base': {'str':10,'agi':11,'sta':13,'int':22,'spi':24,'armor':20}, 'per': {'str':0,'agi':0,'sta':1,'int':2,'spi':3,'armor':4},  'hp': (38,11), 'mana': (110,26)},
    'mage':    {'base': {'str':10,'agi':12,'sta':14,'int':24,'spi':22,'armor':25}, 'per': {'str':0,'agi':0,'sta':1,'int':3,'spi':2,'armor':4},  'hp': (40,12), 'mana': (100,24)},
    'warlock': {'base': {'str':11,'agi':12,'sta':15,'int':21,'spi':21,'armor':22}, 'per': {'str':0,'agi':0,'sta':1,'int':3,'spi':2,'armor':4},  'hp': (42,12), 'mana': (105,25)},
    'rogue':   {'base': {'str':17,'agi':25,'sta':17,'int':11,'spi':12,'armor':40}, 'per': {'str':1,'agi':3,'sta':1,'int':0,'spi':0,'armor':8},  'hp': (45,15), 'mana': (100,0)},
    'hunter':  {'base': {'str':14,'agi':25,'sta':19,'int':13,'spi':14,'armor':45}, 'per': {'str':1,'agi':3,'sta':2,'int':1,'spi':1,'armor':8},  'hp': (50,15), 'mana': (80,18)},
}
ROLES = {
    'warrior': ['tank','dps'], 'paladin': ['tank','heal','dps'], 'shaman': ['heal','dps'],
    # mage : la Chronomancie (v0.27.0) fait du Mage un vrai soigneur.
    'druid': ['tank','heal','dps'], 'priest': ['heal','dps'], 'mage': ['dps','heal'],
    'warlock': ['dps'], 'rogue': ['dps'], 'hunter': ['dps'],
}
MAIL = {'warrior','paladin','shaman'}; LEATHER = {'druid','rogue','hunter'}
ARMOR_RANK = {'cloth':0,'leather':1,'mail':2}
W_WAR = {'warrior','rogue','hunter','shaman','paladin'}
W_CAST = {'mage','priest','warlock','shaman','paladin','druid'}
W_ROGUE = {'rogue','hunter'}
SLOTS = ['mainhand','offhand','helmet','shoulder','chest','waist','legs','gloves','feet','neck','ring1','ring2']

def max_armor(cls): return 2 if cls in MAIL else 1 if cls in LEATHER else 0

# Port exact de canEquipItem (equipment_rules.ts) : pour une armure avec
# armorType, SEUL le rang d'armure compte (le jeu ignore requiredClass là-dessus,
# la mention de classe du tooltip est purement indicative). Les bijoux (pas
# d'armorType) et les armes hors groupes passent par requiredClass.
def can_equip(cls, it):
    at = it.get('armorType') if it.get('kind') == 'armor' else None
    rc = it.get('requiredClass')
    if at: return ARMOR_RANK[at] <= max_armor(cls)
    if it.get('kind') == 'weapon' and rc:
        s = set(rc)
        if s == W_WAR: return cls in W_WAR
        if s == W_CAST: return cls in W_CAST
        if s == W_ROGUE: return cls in W_ROGUE
    if rc: return cls in rc
    return True

def slot_key(it):
    return it.get('slot')

# --- feuille de personnage complète (port de recalcPlayerStats) --------------
# extra : stats additives hors objets (les enchantements) — fusionnées comme des
# stats d'équipement (donc AVANT l'armure d'Agi et les formes druide, comme le
# fait le jeu : l'enchant s'ajoute au rolled.stats de la copie instanciée).
def sheet(cls, role, equip, extra=None):
    cd = CLASSES[cls]
    s = {k: cd['base'][k] + cd['per'][k]*(LVL-1) for k in ('str','agi','sta','int','spi','armor')}
    sp_flat = 0; crit_r = 0; haste_r = 0; hit_r = 0
    counts = {}
    for slot, iid in equip.items():
        if not iid: continue
        it = ITEMS[iid]
        if it.get('set'): counts[it['set']] = counts.get(it['set'],0)+1
        sp_flat += it.get('spellPower',0); crit_r += it.get('critRating',0); haste_r += it.get('hasteRating',0)
        hit_r += it.get('hitRating',0)
        for k,v in (it.get('stats') or {}).items():
            if k in s: s[k] += v
    for k,v in (extra or {}).items():
        if k in s: s[k] += v
    ap_bonus = 0; procs = []
    for sid, n in counts.items():
        for b in SETS[sid]['bonuses']:
            if b['pieces'] <= n:
                e = b['effect']
                for k in ('str','agi','sta','int','spi'):
                    s[k] += e.get(k,0)
                sp_flat += e.get('sp',0); ap_bonus += e.get('ap',0)
                crit_r += e.get('critRating',0); haste_r += e.get('hasteRating',0)
                hit_r += e.get('hitRating',0)
                if 'proc' in e: procs.append(e['proc'])
    s['armor'] += 2*s['agi']
    bear = (cls=='druid' and role=='tank'); cat = (cls=='druid' and role=='dps')
    if bear:
        s['armor'] = jround(s['armor']*1.9); ap_bonus += 15 + jround(s['agi']*1.5)
    if cat:
        ap_bonus += 8 + 2*LVL; s['agi'] += max(2, LVL//2)
    ap_stats = (2*s['str'] if cls in ('warrior','paladin','shaman','druid')
                else s['str']+s['agi'] if cls in ('rogue','hunter') else s['str'])
    ap = max(0, ap_stats + ap_bonus)
    rap = max(0, 2*s['agi'] + ap_bonus) if cls=='hunter' else 0
    sp = max(0, jround(s['int']*0.5 + sp_flat))
    crit = 0.05 + s['agi']*0.0005 + crit_r/1000
    haste = haste_r/1000
    # Hit (v0.26, port de types.ts/entity.ts) : hitFractionFromRating = rating /
    # (HIT_RATING_PER_PCT × 100) = rating/1000. La fraction se SOUSTRAIT du miss
    # (swingMissChance) et du resist des sorts (spell_resist.ts) ; les soins ne
    # ratent jamais. Le hit n'a pas de suppression au-dessus du niveau (contrairement au crit).
    hit = hit_r/1000
    hp = cd['hp'][0] + cd['hp'][1]*(LVL-1) + min(s['sta'],20) + max(0,s['sta']-20)*10
    if bear: hp = jround(hp*1.15)
    mana = cd['mana'][0] + cd['mana'][1]*(LVL-1) + min(s['int'],20) + max(0,s['int']-20)*15
    w = ITEMS[equip['mainhand']]['weapon'] if equip.get('mainhand') and ITEMS[equip['mainhand']].get('weapon') else {'min':1,'max':2,'speed':2}
    return dict(stats=s, ap=ap, rap=rap, sp=sp, crit=crit, haste=haste, hit=hit, hp=hp, mana=mana, w=w, procs=procs, counts=counts)

# --- valorisation des procs de set (espérance, hypothèses documentées) -------
def proc_value(p, sh, kind):
    # rythme d'événements : mêlée ~1.6 coups d'arme/cycle de swing (blanc+jaune),
    # casters : un sort ~2.5 s.
    if p['trigger'] == 'weaponCrit':
        swings_per_s = (1+sh['haste']) * 1.6 / max(1.0, sh['w']['speed'])
        crit_events = swings_per_s * sh['crit'] * p.get('chance',1)
        ttp = 1/max(crit_events, 1e-9)
        period = p.get('icd',0) + ttp
        uptime = min(1.0, p.get('duration',0)/period) if p.get('aura','').startswith('buff') else 0
        if p['aura'] == 'buff_ap': return ('ap', p['value']*uptime)
        if p['aura'] == 'buff_haste': return ('haste', (p['value']-1)*uptime)
        if p['aura'] == 'dot':
            # dot moyen : monte en stacks si les crits s'enchaînent plus vite que 12 s
            stacks = min(p.get('maxStacks',1), max(1.0, p['duration']/max(ttp,1e-9)))
            return ('dps', p['value']/p['tickInterval']*min(1.0, stacks))
    if p['trigger'] == 'spellCast':
        cast_t = 2.5
        ttp = cast_t/max(p.get('chance',1),1e-9)
        period = max(p.get('icd',0), 0) + ttp
        if p['aura'] == 'buff_spellpower':
            return ('sp', p['value']*min(1.0, p.get('duration',0)/period))
        if p['aura'] == 'next_cast_free':
            return ('mana_pct', p.get('chance',1))  # ~10% d'économie de mana
    return ('none', 0)

# --- objectifs par rôle -------------------------------------------------------
# Point de fonctionnement du BiS : boss héroïque, +3 niveaux au-dessus du
# joueur (le « Heroic +3 above-level penalty » de entity.ts). Notes v0.26 :
# les pénalités passent à ≈ 26 % de miss (mêlée/distance) et ≈ 25 % de resist
# (sorts). Le hit s'y soustrait, l'efficacité étant plafonnée à 100 % (cap :
# 260 de rating en mêlée, 250 pour les sorts — au-delà, un point de hit ne
# vaut RIEN, et l'optimiseur doit le savoir). Les soins ne ratent jamais.
MISS_HEROIC = 0.26
RESIST_HEROIC = 0.25

def objective(cls, role, sh):
    bonus = {'ap':0,'sp':0,'haste':0,'dps':0,'mana_pct':0}
    for p in sh['procs']:
        k,v = proc_value(p, sh, role)
        if k in bonus: bonus[k]+=v
    crit=sh['crit']; haste=sh['haste']+bonus['haste']
    land_m = min(1.0, (1 - MISS_HEROIC) + sh['hit'])    # coups de mêlée/distance qui touchent
    land_s = min(1.0, (1 - RESIST_HEROIC) + sh['hit'])  # sorts non résistés
    if role=='dps':
        if cls in ('mage','warlock') or (cls=='priest'):
            spd=(60+(sh['sp']+bonus['sp'])*0.714)/2.5*(1+haste)*(1+0.5*crit)
            return spd*land_s
        if cls=='hunter':
            w=sh['w']; avg=0.6*(w['min']+w['max'])/2
            per=avg+(sh['rap']+bonus['ap'])/14*w['speed']
            return ((per/w['speed'])*(1+haste)*(1+crit)+bonus['dps'])*land_m
        if cls=='druid':  # félin : l'arme ne compte que par ses stats
            return (((sh['ap']+bonus['ap'])/14)*(1+haste)*(1+crit)*3.0+bonus['dps'])*land_m
        w=sh['w']; avg=(w['min']+w['max'])/2
        per=avg+(sh['ap']+bonus['ap'])/14*w['speed']
        return ((per/w['speed'])*(1+haste)*(1+crit)+bonus['dps'])*land_m
    if role=='tank':
        mit=min(0.75, sh['stats']['armor']/(sh['stats']['armor']+85*LVL+400))
        ehp=sh['hp']/(1-mit)
        w=sh['w']; avg=(w['min']+w['max'])/2
        threat=(avg+(sh['ap']+bonus['ap'])/14*w['speed'])/w['speed']*(1+haste)*(1+crit)*land_m
        return ehp + 6.0*threat   # l'EHP domine, la menace départage
    if role=='heal':
        hps=(80+(sh['sp']+bonus['sp'])*0.714)/2.5*(1+haste)*(1+0.5*crit)
        sustain=sh['mana']+15*sh['stats']['spi']
        sustain*= (1+bonus['mana_pct'])
        return hps*(0.7+0.3*sustain/2500)
    return 0

# --- candidats par slot --------------------------------------------------------
# Main gauche (port d'equipment_rules.ts v0.27.2) : le slot accepte
#   1. les boucliers (kind armor + shield) et les objets « tenus en main
#      gauche » (kind held_offhand) — éligibilité par requiredClass SEULEMENT
#      (le jeu ignore l'armorType pour ces deux familles) ;
#   2. une arme à une main en double manche — voleur (toujours) et guerrier
#      Fureur (donc rôle dps) uniquement. Titan's Grip (deux-mains en main
#      gauche, Fureur) n'est pas modélisé : depuis la v0.27.2 il coûte −12 %
#      de dégâts physiques et le modèle ne compte de toute façon que l'arme
#      principale dans le swing — le double une-main reste la référence.
# Le modèle valorise la main gauche par ses stats (armure du bouclier
# comprise) ; les swings de la main gauche ne sont pas simulés.
def _dual_wield(cls, role):
    return cls == 'rogue' or (cls == 'warrior' and role == 'dps')

def candidates(cls, role):
    pool = {sl: [] for sl in SLOTS}
    for iid, it in ITEMS.items():
        sl = slot_key(it)
        if sl not in ('mainhand','offhand','helmet','shoulder','chest','waist','legs','gloves','feet','neck','ring'): continue
        if it.get('kind') not in ('armor','weapon','held_offhand'): continue
        if iid in UNOBTAINABLE: continue   # jumelle héroïque que le jeu ne droppe jamais
        if sl == 'offhand':
            rc = it.get('requiredClass')
            if rc and cls not in rc: continue
            # Un bouclier chez qui double-manche (fury/voleur) sacrifierait la
            # main gauche offensive : on le réserve aux rôles qui ne double-
            # manchent pas (le modèle ne simule pas les swings et croirait
            # sinon le bouclier « gratuit »).
            if it.get('shield') and _dual_wield(cls, role): continue
            pool[sl].append(iid)
            continue
        if not can_equip(cls, it): continue
        if sl == 'mainhand' and it.get('kind') == 'weapon' and _dual_wield(cls, role) \
           and it.get('hand') != 'twohand':
            pool['offhand'].append(iid)   # arme une-main aussi jouable en main gauche
        if sl == 'ring':
            pool['ring1'].append(iid); pool['ring2'].append(iid)
        else:
            pool[sl].append(iid)
    return pool

def evaluate(cls, role, equip):
    # Interdit par le jeu : une main gauche avec une arme à deux mains en main
    # droite (hors Titan's Grip, non modélisé — cf. candidates()).
    mh, oh = equip.get('mainhand'), equip.get('offhand')
    if oh and mh and ITEMS[mh].get('hand') == 'twohand':
        return -1e9
    return objective(cls, role, sheet(cls, role, equip))

# Départage des ex æquo : la puissance des sorts étant arrondie (0.5×Int),
# deux objets peuvent donner un objectif strictement identique (ex. bâtons à
# 12 et 13 Int). À objectif égal, on préfère l'objet aux meilleures stats
# brutes (itemScore du jeu) plutôt que l'ordre d'itération des données.
def iscore(iid):
    it=ITEMS[iid]
    sc=sum(v for k,v in (it.get('stats') or {}).items() if k!='armor')
    sc+=(it.get('stats') or {}).get('armor',0)/12
    if it.get('weapon'):
        w=it['weapon']; sc+=(w['min']+w['max'])/2/w['speed']*0.5
    return sc

def better(v, iid, bs):
    # bs = (valeur, iid) courant ; True si (v, iid) est strictement meilleur
    if bs is None: return True
    if v > bs[0] + 1e-9: return True
    if abs(v - bs[0]) <= 1e-9 and iscore(iid) > iscore(bs[1]) + 1e-9: return True
    return False

def optimize(cls, role):
    pool = candidates(cls, role)
    # pièces de sets pertinentes pour la classe
    class_sets = {}
    for sid in SETS:
        pieces = [iid for iid,it in ITEMS.items() if it.get('set')==sid and can_equip(cls,it)
                  and iid not in UNOBTAINABLE]
        # v0.25 : chaque pièce de set a une jumelle « heroic_<id> » (même set,
        # même slot, stats toutes ≥ — dominance vérifiée sur les données). On
        # ne force que la variante dominante, sinon l'énumération des
        # configurations explose ; les versions normales restent dans le pool
        # (elles ressortent en « Alt. »).
        ps = set(pieces)
        pieces = [iid for iid in pieces if f'heroic_{iid}' not in ps]
        if len(pieces) >= 2: class_sets[sid]=pieces
    # configurations : pour chaque set, sous-ensembles de pièces (0 ou >=2)
    def subsets(pieces):
        out=[()]
        for r in range(2, len(pieces)+1):
            out += list(itertools.combinations(pieces, r))
        return out
    configs=[()]
    for sid, pieces in class_sets.items():
        configs=[c+s for c in configs for s in subsets(pieces)
                 if len(set(ITEMS[i]['slot'] for i in c+s))==len(c+s)]
    best=None
    for forced in configs:
        equip={sl:None for sl in SLOTS}
        used=set()
        ok=True
        for iid in forced:
            sl=ITEMS[iid]['slot']
            if sl=='ring':
                sl='ring1' if not equip['ring1'] else 'ring2' if not equip['ring2'] else None
            if sl is None or equip[sl]: ok=False; break
            equip[sl]=iid; used.add(iid)
        if not ok: continue
        # Remplissage glouton multi-passes des slots libres. La main gauche
        # couple deux slots (bouclier/orbe interdits avec une deux-mains) : un
        # seul passage glouton peut rester coincé sur « deux-mains seule » ou
        # « main gauche d'abord » selon l'ordre. On explore donc les DEUX
        # variantes — offhand remplie en premier, et pas d'offhand du tout —
        # et on garde la meilleure.
        def fill(free_order, allow_offhand):
            eq = dict(equip)
            order = [sl for sl in free_order if allow_offhand or sl != 'offhand']
            for sl in order:
                bs=None
                for iid in pool[sl]:
                    eq[sl]=iid
                    v=evaluate(cls,role,eq)
                    if better(v,iid,bs): bs=(v,iid)
                eq[sl]=bs[1] if bs else None
            for _ in range(4):  # passes de raffinement (slots libres uniquement)
                changed=False
                for sl in order:
                    cur=eq[sl]
                    bs=(evaluate(cls,role,eq),cur)
                    for iid in pool[sl]:
                        if iid==cur: continue
                        eq[sl]=iid
                        v=evaluate(cls,role,eq)
                        if better(v,iid,bs): bs=(v,iid)
                    eq[sl]=bs[1]  # TOUJOURS restaurer le meilleur (bug: le slot restait sur le dernier essayé)
                    if bs[1]!=cur: changed=True
                if not changed: break
            return evaluate(cls,role,eq), eq
        free=[sl for sl in SLOTS if not equip[sl]]
        free_oh_first=(['offhand'] if 'offhand' in free else [])+[sl for sl in free if sl!='offhand']
        for v, eq in (fill(free_oh_first, True), fill(free, False)):
            if best is None or v>best[0]: best=(v,dict(eq))
    # alternatives : le deuxième meilleur objet du slot, strictement — jumelle
    # normale/héroïque du même objet comprise (le badge « héroïque » du site
    # permet de comparer les deux versions, et on sait quoi porter en
    # attendant le kill héroïque).
    score, equip = best

    # Résolution finale de la paire d'anneaux. Le jeu autorise DEUX FOIS le même
    # anneau (pas d'objets « uniques » — vérifié dans equipment_rules.ts), donc
    # le vrai BiS double le meilleur anneau dès que c'est au moins aussi bon.
    # Le remplissage glouton, lui, n'a aucune préférence : quand deux anneaux de
    # même budget donnent un objectif STRICTEMENT identique (fréquent), il pouvait
    # afficher deux anneaux différents au lieu d'en doubler un. On tranche ici en
    # explorant toutes les paires (doublons compris) et en préférant, à objectif
    # égal, la paire DOUBLÉE (puis le meilleur itemScore). On ne garde deux
    # anneaux différents que si le mélange est strictement meilleur.
    rings = pool['ring1']
    if rings:
        best_ring = None  # (objectif, est_doublé, itemScore) -> (a,b)
        for a in rings:
            for b in rings:
                e = dict(equip); e['ring1'] = a; e['ring2'] = b
                v = evaluate(cls, role, e)
                key = (round(v, 6), a == b, iscore(a) if a == b else -1.0)
                if best_ring is None or key > best_ring[0]:
                    best_ring = (key, (a, b))
        equip['ring1'], equip['ring2'] = best_ring[1]
        score = evaluate(cls, role, equip)

    # Alternatives : le TOP 4 derrière la pièce retenue, classé — mesuré comme
    # le reste (l'objet remplacé dans la panoplie complète), jumelles
    # normales/héroïques comprises. Quatre remplaçants + le best = les 5
    # meilleurs objets du slot : de quoi s'adapter quand les premiers drops
    # se font attendre.
    alts={}
    for sl in SLOTS:
        cur=equip[sl]; ranked=[]
        for iid in pool[sl]:
            if iid==cur: continue
            if sl not in ('ring1','ring2') and iid in equip.values(): continue
            if sl in ('ring1','ring2') and iid in (equip['ring1'],equip['ring2']): continue
            e2=dict(equip); e2[sl]=iid
            v=evaluate(cls,role,e2)
            ranked.append((v, iscore(iid), iid))
        ranked.sort(key=lambda t: (t[0], t[1]), reverse=True)
        if ranked: alts[sl]=[iid for _v,_s,iid in ranked[:4]]
    return score, equip, alts

# --- enchantements recommandés (v0.29) ----------------------------------------
# Un seul enchant par pièce (professions/enchanting.ts : le double-enchant est
# bloqué, pas de remplacement). Le jeu exige slot de l'objet = itemSlot de
# l'enchant (resolveApplyEnchant) : la main gauche n'a donc AUCUN enchant
# (aucune entrée « offhand » dans ENCHANTS)… sauf une arme une-main portée à
# gauche (voleur/guerrier Fureur), dont le def reste slot 'mainhand' — le jeu
# l'enchante comme n'importe quelle arme, et le modèle aussi.
# Choix par slot : l'enchant qui maximise l'objectif du rôle (même critère que
# le BiS), cumulé slot après slot. Si aucun n'améliore l'objectif (ex. torse
# d'un DPS caster : il n'existe que End/Esprit/armure), repli « survie » :
# End maxi, puis armure, puis total de stats — marqué fallback pour l'afficher
# honnêtement côté page.
def pick_enchants(cls, role, equip):
    def merged(a, b):
        m = dict(a)
        for k, v in b.items(): m[k] = m.get(k, 0) + v
        return m
    chosen = {}
    extra = {}
    for sl in SLOTS:
        iid = equip.get(sl)
        if not iid: continue
        cands = [e for e in ENCHANTS.values() if e['itemSlot'] == ITEMS[iid].get('slot')]
        if not cands: continue
        base = objective(cls, role, sheet(cls, role, equip, extra))
        best = None  # ((valeur, somme des bonus, id), enchant)
        for e in cands:
            v = objective(cls, role, sheet(cls, role, equip, merged(extra, e['statBonus'])))
            if v <= base + 1e-9: continue
            key = (round(v, 9), sum(e['statBonus'].values()), e['id'])
            if best is None or key > best[0]: best = (key, e)
        fallback = best is None
        if fallback:
            e = max(cands, key=lambda e: (e['statBonus'].get('sta', 0),
                                          e['statBonus'].get('armor', 0),
                                          sum(e['statBonus'].values()), e['id']))
        else:
            e = best[1]
        extra = merged(extra, e['statBonus'])
        entry = {
            'id': e['id'], 'name': e['name'], 'bonus': e['statBonus'],
            'reagents': [{'id': r['itemId'], 'count': r['count'],
                          'name': ITEMS.get(r['itemId'], {}).get('name', r['itemId'])}
                         for r in e['reagents']],
        }
        if fallback: entry['fallback'] = True
        chosen[sl] = entry
    return chosen

def item_export(iid, cls):
    it=ITEMS[iid]
    # itemScore du jeu (item_level.ts) : stats primaires + armure/12 + DPS×0.5
    sc=sum(v for k,v in (it.get('stats') or {}).items() if k!='armor')
    sc+=(it.get('stats') or {}).get('armor',0)/12
    if it.get('weapon'):
        w=it['weapon']; sc+=(w['min']+w['max'])/2/w['speed']*0.5
    # Stats affichées = les stats de base PLUS les combat ratings, qui sont
    # stockés à part dans les données (hitRating/critRating/hasteRating) et
    # étaient donc invisibles (ex. le Hit Rating ajouté en v0.26). La puissance
    # des sorts reste dans son champ 'sp' (affiché séparément par la page).
    disp = dict(it.get('stats') or {})
    for _src_key, _disp_key in (('hitRating', 'hit'), ('critRating', 'crit'), ('hasteRating', 'haste')):
        if it.get(_src_key):
            disp[_disp_key] = it[_src_key]
    return {
        'name': it['name'], 'q': it.get('quality','common'),
        'set': SETS[it['set']]['name'] if it.get('set') else None,
        'stats': disp, 'w': it.get('weapon'),
        'sp': it.get('spellPower'), 'id': iid, 'score': round(sc,1),
        'xclass': bool(it.get('armorType') and it.get('requiredClass') and cls not in it['requiredClass']),
        'slot': it.get('slot'), 'src': SOURCES.get(iid, []),
    }

FR={'warrior':'Guerrier','paladin':'Paladin','shaman':'Chaman','druid':'Druide','priest':'Prêtre','mage':'Mage','warlock':'Démoniste','rogue':'Voleur','hunter':'Chasseur'}
out={}
for cls in ROLES:
    out[cls]={'fr':FR[cls],'roles':{}}
    for role in ROLES[cls]:
        score,equip,alts=optimize(cls,role)
        sh=sheet(cls,role,equip)
        setline=[]
        for sid,n in sorted(sh['counts'].items()):
            reached=[b['pieces'] for b in SETS[sid]['bonuses'] if b['pieces']<=n]
            if reached: setline.append({'name':SETS[sid]['name'],'pieces':n,'bonus':max(reached)})
        picks={}
        for sl in SLOTS:
            iid=equip[sl]
            if not iid: continue
            entry={"best":item_export(iid, cls)}
            if sl in alts:
                entry["alts"]=[item_export(a, cls) for a in alts[sl]]
                # rétro-compatibilité : « alt » = le premier remplaçant.
                entry["alt"]=entry["alts"][0]
            picks[sl]=entry
        out[cls]['roles'][role]={'picks':picks,'sets':setline,'score':round(score,1)}
        ench = pick_enchants(cls, role, equip)
        if ench: out[cls]['roles'][role]['enchants'] = ench
        print(f"{cls}/{role}: score={score:.1f} sets={[(s['name'],s['pieces']) for s in setline]}", file=sys.stderr)
json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
