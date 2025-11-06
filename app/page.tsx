'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * PASTE → AUTO LIST (TH-aware) + Consigli FARM/WAR
 * - TH: esplicito → buildings.weapon → fallback pets=14
 * - ID→Nome: ITALIANO (eroi, strutture, trappole, risorse) dai tuoi ID
 * - Mostra:
 *    1) Elenco upgrade (solo dove conosciamo il max per il tuo TH)
 *    2) Pannello “Elementi senza max definito (TH14)” → ti dice cosa manca per completare i cap
 *
 * NOTE: per ora i max TH li abbiamo completi per Eroi, Pets, Equipaggiamento.
 *       Per strutture/trappole/risorse non inserisco valori “a caso”: li elenchiamo nel pannello “manca max”.
 *       Appena mi confermi i max TH14 per qualche voce, li aggiungo e appariranno nell’elenco upgrade.
 */

// -------------------- Utils: parse frammenti JSON --------------------
function tryParse<T = any>(s: string): T { return JSON.parse(s); }

/** Accetta JSON completi o frammenti tipo:
 *   "heroes2":[...], "pets":[...], "equipment":[...], ...
 * tollera virgole pendenti e bilancia parentesi/graffe se mancano.
 */
function sanitizeToJSONObject(rawText: string): any {
  let t = (rawText || '').trim();
  if (t.startsWith('{') || t.startsWith('[')) {
    try { return tryParse(t); } catch { /* continua */ }
  }
  if (/^["a-zA-Z]/.test(t) && !t.startsWith('{')) t = '{' + t + '}';
  t = t.replace(/,(\s*[}\]])/g, '$1');

  const o1 = (t.match(/{/g) || []).length, c1 = (t.match(/}/g) || []).length;
  if (o1 > c1) t = t + '}'.repeat(o1 - c1);
  else if (c1 > o1) { let d = c1 - o1; while (d-- > 0 && t.endsWith('}')) t = t.slice(0, -1); }

  const o2 = (t.match(/\[/g) || []).length, c2 = (t.match(/\]/g) || []).length;
  if (o2 > c2) t = t + ']'.repeat(o2 - c2);
  else if (c2 > o2) { let d = c2 - o2; while (d-- > 0 && t.endsWith(']')) t = t.slice(0, -1); }

  return tryParse(t);
}

// -------------------- TH detection --------------------
function deepFindNumber(obj: any, keys: string[]): number | undefined {
  try {
    const stack = [obj];
    while (stack.length) {
      const cur = stack.pop();
      if (!cur || typeof cur !== 'object') continue;
      for (const k of keys) {
        if (Object.prototype.hasOwnProperty.call(cur, k)) {
          const v = (cur as any)[k];
          if (typeof v === 'number') return v;
        }
      }
      for (const v of Object.values(cur)) {
        if (v && typeof v === 'object') stack.push(v as any);
      }
    }
  } catch {}
  return undefined;
}

/** Rileva il TH in tre modi:
 *  1) campi espliciti (townHallLevel / town_hall / th / thLevel)
 *  2) buildings/buildings2 → record con "weapon": il suo lvl è il TH (Giga)
 *  3) fallback: se trovo "pets" → TH14
 */
function detectTownHall(json: any): number | undefined {
  // 1) esplicito
  const explicit = deepFindNumber(json, ['townHallLevel', 'town_hall', 'th', 'thLevel']);
  if (typeof explicit === 'number' && explicit >= 1 && explicit <= 20) return explicit;

  // 2) dal blocco buildings/buildings2
  const scan = (arr: any[]) => {
    for (const it of arr) {
      if (it && typeof it === 'object' && ('weapon' in it) && typeof it.lvl === 'number') {
        const th = Number(it.lvl);
        if (th >= 1 && th <= 20) return th;
      }
    }
    return undefined;
  };
  const thFromBuildings =
    (Array.isArray(json?.buildings) && scan(json.buildings)) ||
    (Array.isArray(json?.buildings2) && scan(json.buildings2));
  if (thFromBuildings) return thFromBuildings;

  // 3) fallback: pets presenti → TH14
  if (Array.isArray(json?.pets) && json.pets.length > 0) return 14;

  return undefined;
}

// -------------------- Caps per TH (ITA) — completi per Eroi/Pets/Equip --------------------
type Caps = { [name: string]: number };

// TH14 caps usati per la tua base (fonte community; non invento per strutture finché non me li confermi)
const CAPS_BY_TH: Record<number, Caps> = {
  14: {
    // EROI
    'Re Barbaro': 85,
    'Regina degli Arcieri': 85,
    'Gran Sorvegliante': 60,
    'Campionessa Reale': 30,
    // PETS (classici)
    'L.A.S.S.I': 10,
    'Gufo Elettrico': 10,
    'Yak Potente': 10,
    'Unicorno': 10,
    // EQUIPAGGIAMENTO (cap a TH14)
    'Equipaggiamento Eroe': 20,
  },
  // fallback globali (TH17) li gestiamo unendo con GLOBAL_CAPS più sotto
};

// Max “globali” (usati solo se TH non è deducibile)
const GLOBAL_CAPS: Caps = {
  'Re Barbaro': 100,
  'Regina degli Arcieri': 100,
  'Gran Sorvegliante': 75,
  'Campionessa Reale': 50,
  'L.A.S.S.I': 10,
  'Gufo Elettrico': 10,
  'Yak Potente': 10,
  'Unicorno': 10,
  'Equipaggiamento Eroe': 20,
};

// -------------------- ID → NOME (ITALIANO) --------------------
/** NOTA: ho tradotto tutto in italiano.
 *  Gli eroi ora sono completi: Re Barbaro, Regina degli Arcieri, Gran Sorvegliante, Campionessa Reale.
 *  Per strutture/trappole ho usato le denominazioni italiane standard di gioco.
 */
const ID_NAME_MAP: Record<
  string,
  { name: string; cat: 'hero' | 'pet' | 'equipment' | 'building' | 'trap' | 'resource' | 'other' }
> = {
  // --- EROI (dai tuoi dump comuni) ---
  '28000003': { name: 'Re Barbaro',            cat: 'hero' },
  '28000005': { name: 'Regina degli Arcieri',  cat: 'hero' },
  '28000004': { name: 'Gran Sorvegliante',     cat: 'hero' },
  '28000006': { name: 'Campionessa Reale',     cat: 'hero' },

  // --- PETS (TH14+ classici) ---
  '73000000': { name: 'L.A.S.S.I',             cat: 'pet' },
  '73000001': { name: 'Gufo Elettrico',        cat: 'pet' },
  '73000002': { name: 'Yak Potente',           cat: 'pet' },
  '73000003': { name: 'Unicorno',              cat: 'pet' },

  // --- EQUIPAGGIAMENTO EROI (generico) ---
  '90000000': { name: 'Equipaggiamento Eroe',  cat: 'equipment' },
  '90000001': { name: 'Equipaggiamento Eroe',  cat: 'equipment' },
  '90000002': { name: 'Equipaggiamento Eroe',  cat: 'equipment' },
  '90000003': { name: 'Equipaggiamento Eroe',  cat: 'equipment' },
  '90000004': { name: 'Equipaggiamento Eroe',  cat: 'equipment' },
  '90000005': { name: 'Equipaggiamento Eroe',  cat: 'equipment' },
  '90000006': { name: 'Equipaggiamento Eroe',  cat: 'equipment' },
  '90000007': { name: 'Equipaggiamento Eroe',  cat: 'equipment' },
  '90000008': { name: 'Equipaggiamento Eroe',  cat: 'equipment' },
  '90000009': { name: 'Equipaggiamento Eroe',  cat: 'equipment' },
  '90000010': { name: 'Equipaggiamento Eroe',  cat: 'equipment' },
  '90000011': { name: 'Equipaggiamento Eroe',  cat: 'equipment' },
  '90000013': { name: 'Equipaggiamento Eroe',  cat: 'equipment' },
  '90000014': { name: 'Equipaggiamento Eroe',  cat: 'equipment' },
  '90000015': { name: 'Equipaggiamento Eroe',  cat: 'equipment' },
  '90000017': { name: 'Equipaggiamento Eroe',  cat: 'equipment' },
  '90000019': { name: 'Equipaggiamento Eroe',  cat: 'equipment' },
  '90000020': { name: 'Equipaggiamento Eroe',  cat: 'equipment' },
  '90000022': { name: 'Equipaggiamento Eroe',  cat: 'equipment' },
  '90000024': { name: 'Equipaggiamento Eroe',  cat: 'equipment' },
  '90000032': { name: 'Equipaggiamento Eroe',  cat: 'equipment' },
  '90000034': { name: 'Equipaggiamento Eroe',  cat: 'equipment' },
  '90000035': { name: 'Equipaggiamento Eroe',  cat: 'equipment' },
  '90000039': { name: 'Equipaggiamento Eroe',  cat: 'equipment' },
  '90000040': { name: 'Equipaggiamento Eroe',  cat: 'equipment' },
  '90000041': { name: 'Equipaggiamento Eroe',  cat: 'equipment' },
  '90000042': { name: 'Equipaggiamento Eroe',  cat: 'equipment' },
  '90000043': { name: 'Equipaggiamento Eroe',  cat: 'equipment' },
  '90000044': { name: 'Equipaggiamento Eroe',  cat: 'equipment' },
  '90000047': { name: 'Equipaggiamento Eroe',  cat: 'equipment' },
  '90000048': { name: 'Equipaggiamento Eroe',  cat: 'equipment' },
  '90000049': { name: 'Equipaggiamento Eroe',  cat: 'equipment' },

  // --- STRUTTURE / DIFESE (italiano) ---
  '1000008': { name: 'Cannone',                 cat: 'building' },          // Cannon
  '1000009': { name: 'Torre degli Arcieri',     cat: 'building' },          // Archer Tower
  '1000013': { name: 'Mortaio',                 cat: 'building' },          // Mortar
  '1000012': { name: 'Difesa Aerea',            cat: 'building' },          // Air Defense
  '1000011': { name: 'Torre dello Stregone',    cat: 'building' },          // Wizard Tower
  '1000028': { name: 'Spingiaria Aerea',        cat: 'building' },          // Air Sweeper
  '1000019': { name: 'Tesla Nascosta',          cat: 'building' },          // Hidden Tesla
  '1000032': { name: 'Torre delle Bombe',       cat: 'building' },          // Bomb Tower
  '1000021': { name: 'Balestra',                cat: 'building' },          // X-Bow
  '1000027': { name: 'Torre Infernale',         cat: 'building' },          // Inferno Tower
  '1000031': { name: 'Artiglieria Aquila',      cat: 'building' },          // Eagle Artillery
  '1000067': { name: 'Lanciascaglie',           cat: 'building' },          // Scattershot
  '1000015': { name: 'Capanna del Costruttore', cat: 'building' },          // Builder’s Hut
  '1000072': { name: 'Torre degli Incantesimi', cat: 'building' },          // Spell Tower
  '1000077': { name: 'Monolite',                cat: 'building' },          // Monolith
  '1000089': { name: 'Sputafuoco',              cat: 'building' },          // Firespitter
  '1000010': { name: 'Muro',                    cat: 'building' },          // Wall
  '1000084': { name: 'Torre Multi-Arceri',      cat: 'building' },          // Multi-Archer Tower
  '1000085': { name: 'Cannone Rimbalzo',        cat: 'building' },          // Ricochet Cannon
  '1000079': { name: 'Torre Multi-Ingranaggi',  cat: 'building' },          // Multi-Gear Tower
  '1000001': { name: 'Municipio',               cat: 'building' },          // Town Hall

  // --- TRAPPOLE ---
  '12000000': { name: 'Bomba',                   cat: 'trap' },
  '12000001': { name: 'Trappola a Molla',        cat: 'trap' },
  '12000002': { name: 'Bomba Gigante',          cat: 'trap' },
  '12000005': { name: 'Bomba Aerea',             cat: 'trap' },
  '12000006': { name: 'Mina Aerea a Ricerca',    cat: 'trap' },
  '12000008': { name: 'Trappola Scheletrica',    cat: 'trap' },
  '12000016': { name: 'Trappola Tornado',        cat: 'trap' },
  '12000020': { name: 'Giga Bomba',              cat: 'trap' },

  // --- RISORSE / EDIFICI DI SUPPORTO ---
  '1000004': { name: "Miniera d'Oro",            cat: 'resource' },
  '1000002': { name: "Estrattore d'Elisir",      cat: 'resource' },
  '1000005': { name: "Deposito d'Oro",           cat: 'resource' },
  '1000003': { name: "Deposito d'Elisir",        cat: 'resource' },
  '1000023': { name: "Trivella d'Elisir Nero",   cat: 'resource' },
  '1000024': { name: "Deposito d'Elisir Nero",   cat: 'resource' },
  '1000014': { name: 'Castello del Clan',        cat: 'resource' },
  '1000000': { name: 'Campo d’Addestramento',    cat: 'resource' }, // Army Camp
  '1000006': { name: 'Caserma',                  cat: 'resource' },
  '1000026': { name: 'Caserma Nera',             cat: 'resource' },
  '1000007': { name: 'Laboratorio',              cat: 'resource' },
  '1000020': { name: 'Fabbrica degli Incantesimi', cat: 'resource' },
  '1000071': { name: 'Sala degli Eroi',          cat: 'resource' }, // Hero Hall (nuove meccaniche)
  '1000029': { name: 'Fabbrica degli Incantesimi Oscuri', cat: 'resource' },
  '1000070': { name: 'Fucina',                   cat: 'resource' }, // Blacksmith
  '1000059': { name: 'Officina d’Assedio',       cat: 'resource' }, // Workshop
  '1000068': { name: 'Casa degli Animali',       cat: 'resource' }, // Pet House
};

// -------------------- Raccolta entries dal JSON --------------------
type RawEntry = { data?: number; lvl?: number; cnt?: number };

function collectEntries(json: any): RawEntry[] {
  const out: RawEntry[] = [];
  const KEYS = ['buildings2', 'buildings', 'traps2', 'units2', 'heroes2', 'pets', 'equipment'];
  for (const k of KEYS) {
    const arr = (json as any)?.[k];
    if (Array.isArray(arr)) {
      for (const it of arr) {
        if (it && typeof it === 'object' && 'data' in it && 'lvl' in it) {
          out.push({ data: Number((it as any).data), lvl: Number((it as any).lvl), cnt: Number((it as any).cnt || 1) });
        }
      }
    }
  }
  return out;
}

// -------------------- Consigli FARM / WAR (TH14 centrico) --------------------
const FARM_PRIORITY_TH14 = [
  'Laboratorio', 'Castello del Clan', 'Casa degli Animali', 'Fucina', 'Equipaggiamento',
  "Campo d’Addestramento", 'Caserma', 'Fabbrica', 'Officina',
  'Re Barbaro', 'Regina degli Arcieri', 'Gran Sorvegliante', 'Campionessa Reale',
  'Capanna del Costruttore', 'Balestra', 'Difesa Aerea', 'Torre dello Stregone', 'Torre delle Bombe'
];

const WAR_PRIORITY_TH14 = [
  'Giga', 'Municipio', 'Artiglieria Aquila', 'Lanciascaglie', 'Torre Infernale',
  'Capanna del Costruttore', 'Balestra', 'Difesa Aerea',
  'Castello del Clan', 'Laboratorio', 'Fucina', 'Equipaggiamento',
  'Re Barbaro', 'Regina degli Arcieri', 'Gran Sorvegliante', 'Campionessa Reale',
];

// -------------------- UI + Logica --------------------
type Row = { name: string; have: number; max: number; countAtLevel: number; totalByName: number; deficit: number; };

export default function Page() {
  const [pasted, setPasted] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [missingCaps, setMissingCaps] = useState<{ name: string; have: number; count: number }[]>([]);
  const [error, setError] = useState('');
  const [th, setTh] = useState<number | undefined>(undefined);

  // Debounce leggero
  const timer = useRef<any>(null);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => generate(pasted), 250);
    return () => clearTimeout(timer.current);
  }, [pasted]);

  function getCapsForTH(th?: number): Caps {
    if (!th) return GLOBAL_CAPS;
    const capsTH = CAPS_BY_TH[th] || {};
    return { ...GLOBAL_CAPS, ...capsTH }; // unione: preferisce i valori del TH se presenti
  }

  function generate(text: string) {
    setError('');
    setRows([]);
    setMissingCaps([]);
    setTh(undefined);
    if (!text.trim()) return;

    let json: any;
    try { json = sanitizeToJSONObject(text); }
    catch (e: any) { setError('JSON non valido: ' + (e?.message || 'errore di parsing')); return; }

    // 1) TH detection (esplicito → buildings.weapon → pets=14)
    const detectedTH = detectTownHall(json);
    setTh(detectedTH);

    // 2) entries
    const entries = collectEntries(json);
    if (!entries.length) { setRows([]); return; }

    // totali per ID (per colonne x/y)
    const totalById = new Map<string, number>();
    for (const e of entries) {
      const id = String(e.data);
      totalById.set(id, (totalById.get(id) || 0) + (e.cnt || 1));
    }

    const caps = getCapsForTH(detectedTH);

    // raggruppo
    const map = new Map<string, Row>();
    const missingList: { name: string; have: number; count: number }[] = [];

    for (const e of entries) {
      const id = String(e.data);
      const meta = ID_NAME_MAP[id];
      if (!meta) continue; // non mappato → ignoro (non sporco UI)

      const name = meta.name;

      // max per nome (se definito per questo TH)
      const max = typeof caps[name] === 'number' ? caps[name] : undefined;

      const have = e.lvl || 0;
      const count = e.cnt || 1;
      const tot = totalById.get(id) || count;

      if (typeof max !== 'number') {
        // riconosciuto ma senza max definito per TH → segnalo nel pannello "mancano max"
        missingList.push({ name, have, count });
        continue;
      }

      if (!(have < max)) continue; // già al cap per il TUO TH

      const key = name + '__' + have;
      const prev = map.get(key);
      const row: Row = prev || {
        name, have, max,
        countAtLevel: 0,
        totalByName: tot,
        deficit: Math.max(0, max - have),
      };
      row.countAtLevel += count;
      map.set(key, row);
    }

    // Ordine: eroi > pets > equip > buildings/traps/resources, poi deficit
    const categoryRank = (n: string) =>
      /re barbaro|regina degli arcieri|gran sorvegliante|campionessa reale/i.test(n) ? 4 :
      /l\.a\.s\.s\.i|gufo elettrico|yak potente|unicorno/i.test(n) ? 3 :
      /equipaggiamento/i.test(n) ? 2 : 1;

    const baseSorted = Array.from(map.values()).sort((a, b) => {
      if (categoryRank(b.name) !== categoryRank(a.name)) return categoryRank(b.name) - categoryRank(a.name);
      if (b.deficit !== a.deficit) return b.deficit - a.deficit;
      if (a.name !== b.name) return a.name.localeCompare(b.name, 'it');
      return a.have - b.have;
    });

    // missing caps: raggruppa per nome (mostro solo una riga per nome col livello minimo rilevato)
    const aggMissing = new Map<string, { name: string; have: number; count: number }>();
    for (const m of missingList) {
      const prev = aggMissing.get(m.name);
      if (!prev) aggMissing.set(m.name, m);
      else {
        // tieni il livello minimo che abbiamo visto (per prudenza) e somma count
        aggMissing.set(m.name, { name: m.name, have: Math.min(prev.have, m.have), count: prev.count + m.count });
      }
    }

    setRows(baseSorted);
    setMissingCaps(Array.from(aggMissing.values()).sort((a, b) => a.name.localeCompare(b.name, 'it')));
  }

  // Suggerimenti (su TH14 hanno senso pieno; per altri TH restano indicativi)
  function rankName(list: string[], n: string): number {
    const i = list.findIndex(x => n.toLowerCase().includes(x.toLowerCase()));
    return i === -1 ? 999 : i;
  }
  const farmAdvice = rows
    .map(r => ({ r, score: rankName(FARM_PRIORITY_TH14, r.name) }))
    .sort((a, b) => a.score - b.score || b.r.deficit - a.r.deficit)
    .map(x => x.r)
    .slice(0, 10);

  const warAdvice = rows
    .map(r => ({ r, score: rankName(WAR_PRIORITY_TH14, r.name) }))
    .sort((a, b) => a.score - b.score || b.r.deficit - a.r.deficit)
    .map(x => x.r)
    .slice(0, 10);

  return (
    <div className="wrap">
      <h1>CoC – Upgrade (cap per TH) + Consigli Farm/War</h1>
      <div className="muted small" style={{marginBottom: 8}}>
        Incolla il JSON/frammento del villaggio. TH rilevato automaticamente; elenco limitato ai cap del tuo TH.
      </div>

      <div className="panel">
        <textarea
          className="input"
          rows={12}
          placeholder='Incolla qui. Esempio: "heroes2":[...], "pets":[...], "equipment":[...], "buildings2":[...], ...'
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
        />
        <div className="thbadge">
          {th ? <>TH rilevato: <b>{th}</b></> : <>TH non rilevato (uso cap globali finché non è deducibile)</>}
        </div>
      </div>

      {error && <div className="err small" style={{ margin: '10px 0' }}>{error}</div>}

      {/* Elenco upgrade calcolati */}
      <div className="grid1" style={{ marginTop: 8 }}>
        {rows.length === 0 ? (
          <div className="muted small">
            Nessun upgrade da mostrare con le info attuali. (Se non vedi difese/trappole, vedi pannello sotto: “mancano max TH14”.)
          </div>
        ) : (
          rows.map((r, i) => (
            <div key={i} className="item">
              <div className="k">{r.name}</div>
              <div>{r.countAtLevel}/{r.totalByName} → liv. {r.have} → {r.max}</div>
              <div className="small muted">deficit: {r.deficit}</div>
            </div>
          ))
        )}
      </div>

      {/* Pannello: cosa manca (riconosciuto ma senza max per TH14) */}
      {missingCaps.length > 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="title">Elementi senza max definito (TH14)</div>
          <div className="muted small" style={{marginBottom: 8}}>
            Sono riconosciuti ma manca il livello massimo per TH14. Dimmi i max (o confermali) e li attivo subito:
          </div>
          <ul className="list">
            {missingCaps.map((m, i) => (
              <li key={i}>
                <b>{m.name}</b> — rilevato livello {m.have} (x{m.count})
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Consigli */}
      {rows.length > 0 && (
        <>
          <div className="panel" style={{ marginTop: 16 }}>
            <div className="title">Consiglio FARM</div>
            <div className="muted small" style={{marginBottom: 8}}>
              Offense/economia (Laboratorio, Castello del Clan, Casa degli Animali, Fucina/Equipaggiamento) → Eroi → difese anti-loot.
            </div>
            {farmAdvice.length === 0 ? (
              <div className="muted small">Nessuna raccomandazione disponibile.</div>
            ) : (
              <ul className="list">
                {farmAdvice.map((r, i) => (
                  <li key={i}><b>{r.name}</b> — {r.countAtLevel}/{r.totalByName} → liv. {r.have} → {r.max} (deficit {r.deficit})</li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel" style={{ marginTop: 12 }}>
            <div className="title">Consiglio WAR</div>
            <div className="muted small" style={{marginBottom: 8}}>
              Giga/Municipio, Aquila, Lanciascaglie, Infernali, Balestra/Capanna → CC/Lab/Fucina → Eroi.
            </div>
            {warAdvice.length === 0 ? (
              <div className="muted small">Nessuna raccomandazione disponibile.</div>
            ) : (
              <ul className="list">
                {warAdvice.map((r, i) => (
                  <li key={i}><b>{r.name}</b> — {r.countAtLevel}/{r.totalByName} → liv. {r.have} → {r.max} (deficit {r.deficit})</li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <style jsx global>{`
        :root { color-scheme: dark; }
        body { background:#0a0a0a; color:#e5e5e5; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
        .wrap { max-width:1000px; margin:0 auto; padding:24px; }
        h1 { font-size:22px; margin:0 0 8px; }
        .muted { color:#9ca3af; }
        .small { font-size:12px; }
        .panel { background:#0f0f0f; border:1px solid #1f1f1f; border-radius:12px; padding:16px; margin-top:8px; }
        .input { width:100%; background:#0a0a0a; border:1px solid #2c2c2c; border-radius:8px; padding:10px; color:#e5e5e5; }
        textarea.input { min-height: 230px; line-height: 1.3; }
        .thbadge { margin-top:8px; font-size:12px; color:#cbd5e1; }
        .err { color:#fca5a5; }
        .grid1 { display:grid; gap:10px; grid-template-columns:1fr; }
        .item { display:grid; gap:8px; grid-template-columns:1fr 1fr 1fr; background:#121212; border:1px solid #242424; padding:12px; border-radius:12px; }
        .k { font-weight:600; }
        .title { font-weight:600; margin-bottom:6px; }
        .list { margin: 0; padding-left: 18px; line-height: 1.4; }
      `}</style>
    </div>
  );
}
