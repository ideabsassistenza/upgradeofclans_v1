'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * Upgrade Tracker – modalità “Sundell-like”
 *
 * - TH detection: esplicito → buildings.weapon → fallback pets=14
 * - Parsing: heroes + heroes2, buildings + buildings2, traps2, pets, equipment
 * - Nomi in ITALIANO (eroi, strutture, risorse, trappole)
 * - Cap TH14 già impostati dove sono stabili/affidabili:
 *      Eroi (BK/AQ/GW/RC), Pets classici, Equip eroico,
 *      e un sottoinsieme di difese molto note: Municipio (Giga), Aquila, Lanciascaglie, Infernali, Balestra,
 *      Capanna del Costruttore, Torre degli Arcieri, Cannone, Mortaio, Torre dello Stregone,
 *      Difesa Aerea, Tesla Nascosta, Torre delle Bombe, Spingiaria Aerea, Muri.
 * - Edifici NON disponibili a TH14 (Monolite, Torre Incantesimi, Multi-Arceri, Cannone Rimbalzo,
 *   Torre Multi-Ingranaggi, Sputafuoco ecc.) → esclusi dagli upgrade (cap=0).
 * - Tutto il resto: se riconosciuto ma cap non impostato, appare nel pannello “Manca cap TH14”.
 */

function tryParse<T = any>(s: string): T { return JSON.parse(s); }
function sanitizeToJSONObject(rawText: string): any {
  let t = (rawText || '').trim();
  if (t.startsWith('{') || t.startsWith('[')) { try { return tryParse(t); } catch {} }
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

function detectTownHall(json: any): number | undefined {
  const explicit = deepFindNumber(json, ['townHallLevel', 'town_hall', 'th', 'thLevel']);
  if (typeof explicit === 'number' && explicit >= 1 && explicit <= 20) return explicit;
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
  if (Array.isArray(json?.pets) && json.pets.length > 0) return 14;
  return undefined;
}

// -------------------- Cap per TH (ITA) --------------------
type Caps = { [name: string]: number };

// Cap stabili e ben noti per TH14 (nessun “guess” su roba TH15+)
const CAPS_TH14: Caps = {
  // Eroi
  'Re Barbaro': 85,
  'Regina degli Arcieri': 85,
  'Gran Sorvegliante': 60,
  'Campionessa Reale': 30,

  // Pets classici
  'L.A.S.S.I': 10,
  'Gufo Elettrico': 10,
  'Yak Potente': 10,
  'Unicorno': 10,

  // Equip eroi
  'Equipaggiamento Eroe': 20,

  // Difese principali e strutture note a TH14
  'Municipio (Giga)': 5,            // potenziamento Giga (TH14)
  'Artiglieria Aquila': 5,
  'Lanciascaglie': 3,
  'Torre Infernale': 9,
  'Balestra': 8,
  'Capanna del Costruttore': 4,
  'Torre degli Arcieri': 20,
  'Cannone': 20,
  'Mortaio': 14,
  'Torre dello Stregone': 14,
  'Difesa Aerea': 12,
  'Tesla Nascosta': 13,
  'Torre delle Bombe': 8,
  'Spingiaria Aerea': 7,
  'Muro': 15,

  // Edifici non disponibili a TH14 → 0 (così non compaiono negli upgrade)
  'Monolite': 0,
  'Torre degli Incantesimi': 0,
  'Torre Multi-Arceri': 0,
  'Cannone Rimbalzo': 0,
  'Torre Multi-Ingranaggi': 0,
  'Sputafuoco': 0,
};

const GLOBAL_CAPS: Caps = {
  // fallback (non usati quando TH=14)
  'Re Barbaro': 100,
  'Regina degli Arcieri': 100,
  'Gran Sorvegliante': 75,
  'Campionessa Reale': 50,
  'L.A.S.S.I': 10, 'Gufo Elettrico': 10, 'Yak Potente': 10, 'Unicorno': 10,
  'Equipaggiamento Eroe': 20,
};

const ID_NAME_MAP: Record<
  string,
  { name: string; cat: 'hero'|'pet'|'equipment'|'building'|'trap'|'resource'|'other' }
> = {
  // EROI
  '28000003': { name: 'Re Barbaro', cat: 'hero' },
  '28000005': { name: 'Regina degli Arcieri', cat: 'hero' },
  '28000004': { name: 'Gran Sorvegliante', cat: 'hero' },
  '28000006': { name: 'Campionessa Reale', cat: 'hero' },

  // PETS
  '73000000': { name: 'L.A.S.S.I', cat: 'pet' },
  '73000001': { name: 'Gufo Elettrico', cat: 'pet' },
  '73000002': { name: 'Yak Potente', cat: 'pet' },
  '73000003': { name: 'Unicorno', cat: 'pet' },

  // EQUIPAGGIAMENTO
  '90000000': { name: 'Equipaggiamento Eroe', cat: 'equipment' },
  '90000001': { name: 'Equipaggiamento Eroe', cat: 'equipment' },
  '90000002': { name: 'Equipaggiamento Eroe', cat: 'equipment' },
  '90000003': { name: 'Equipaggiamento Eroe', cat: 'equipment' },
  '90000004': { name: 'Equipaggiamento Eroe', cat: 'equipment' },
  '90000005': { name: 'Equipaggiamento Eroe', cat: 'equipment' },
  '90000006': { name: 'Equipaggiamento Eroe', cat: 'equipment' },
  '90000007': { name: 'Equipaggiamento Eroe', cat: 'equipment' },
  '90000008': { name: 'Equipaggiamento Eroe', cat: 'equipment' },
  '90000009': { name: 'Equipaggiamento Eroe', cat: 'equipment' },
  '90000010': { name: 'Equipaggiamento Eroe', cat: 'equipment' },
  '90000011': { name: 'Equipaggiamento Eroe', cat: 'equipment' },
  '90000013': { name: 'Equipaggiamento Eroe', cat: 'equipment' },
  '90000014': { name: 'Equipaggiamento Eroe', cat: 'equipment' },
  '90000015': { name: 'Equipaggiamento Eroe', cat: 'equipment' },
  '90000017': { name: 'Equipaggiamento Eroe', cat: 'equipment' },
  '90000019': { name: 'Equipaggiamento Eroe', cat: 'equipment' },
  '90000020': { name: 'Equipaggiamento Eroe', cat: 'equipment' },
  '90000022': { name: 'Equipaggiamento Eroe', cat: 'equipment' },
  '90000024': { name: 'Equipaggiamento Eroe', cat: 'equipment' },
  '90000032': { name: 'Equipaggiamento Eroe', cat: 'equipment' },
  '90000034': { name: 'Equipaggiamento Eroe', cat: 'equipment' },
  '90000035': { name: 'Equipaggiamento Eroe', cat: 'equipment' },
  '90000039': { name: 'Equipaggiamento Eroe', cat: 'equipment' },
  '90000040': { name: 'Equipaggiamento Eroe', cat: 'equipment' },
  '90000041': { name: 'Equipaggiamento Eroe', cat: 'equipment' },
  '90000042': { name: 'Equipaggiamento Eroe', cat: 'equipment' },
  '90000043': { name: 'Equipaggiamento Eroe', cat: 'equipment' },
  '90000044': { name: 'Equipaggiamento Eroe', cat: 'equipment' },
  '90000047': { name: 'Equipaggiamento Eroe', cat: 'equipment' },
  '90000048': { name: 'Equipaggiamento Eroe', cat: 'equipment' },
  '90000049': { name: 'Equipaggiamento Eroe', cat: 'equipment' },

  // STRUTTURE (ITA)
  '1000001': { name: 'Municipio (Giga)', cat: 'building' },
  '1000008': { name: 'Cannone', cat: 'building' },
  '1000009': { name: 'Torre degli Arcieri', cat: 'building' },
  '1000013': { name: 'Mortaio', cat: 'building' },
  '1000012': { name: 'Difesa Aerea', cat: 'building' },
  '1000011': { name: 'Torre dello Stregone', cat: 'building' },
  '1000028': { name: 'Spingiaria Aerea', cat: 'building' },
  '1000019': { name: 'Tesla Nascosta', cat: 'building' },
  '1000032': { name: 'Torre delle Bombe', cat: 'building' },
  '1000021': { name: 'Balestra', cat: 'building' },
  '1000027': { name: 'Torre Infernale', cat: 'building' },
  '1000031': { name: 'Artiglieria Aquila', cat: 'building' },
  '1000067': { name: 'Lanciascaglie', cat: 'building' },
  '1000015': { name: 'Capanna del Costruttore', cat: 'building' },
  '1000010': { name: 'Muro', cat: 'building' },

  // Strutture NON TH14 (cap 0 → le escludiamo dagli upgrade)
  '1000072': { name: 'Torre degli Incantesimi', cat: 'building' },
  '1000077': { name: 'Monolite', cat: 'building' },
  '1000084': { name: 'Torre Multi-Arceri', cat: 'building' },
  '1000085': { name: 'Cannone Rimbalzo', cat: 'building' },
  '1000079': { name: 'Torre Multi-Ingranaggi', cat: 'building' },
  '1000089': { name: 'Sputafuoco', cat: 'building' },

  // RISORSE & SUPPORTO (non calcolo cap minuziosi qui: li mostriamo nel pannello “manca cap”)
  '1000004': { name: "Miniera d'Oro", cat: 'resource' },
  '1000002': { name: "Estrattore d'Elisir", cat: 'resource' },
  '1000005': { name: "Deposito d'Oro", cat: 'resource' },
  '1000003': { name: "Deposito d'Elisir", cat: 'resource' },
  '1000023': { name: "Trivella d'Elisir Nero", cat: 'resource' },
  '1000024': { name: "Deposito d'Elisir Nero", cat: 'resource' },
  '1000014': { name: 'Castello del Clan', cat: 'resource' },
  '1000000': { name: 'Campo d’Addestramento', cat: 'resource' },
  '1000006': { name: 'Caserma', cat: 'resource' },
  '1000026': { name: 'Caserma Nera', cat: 'resource' },
  '1000007': { name: 'Laboratorio', cat: 'resource' },
  '1000020': { name: 'Fabbrica degli Incantesimi', cat: 'resource' },
  '1000029': { name: 'Fabbrica degli Incantesimi Oscuri', cat: 'resource' },
  '1000070': { name: 'Fucina', cat: 'resource' },
  '1000059': { name: 'Officina d’Assedio', cat: 'resource' },
  '1000068': { name: 'Casa degli Animali', cat: 'resource' },

  // TRAPPOLE (cap non impostati: le faremo apparire nel pannello “manca cap”)
  '12000000': { name: 'Bomba', cat: 'trap' },
  '12000001': { name: 'Trappola a Molla', cat: 'trap' },
  '12000002': { name: 'Bomba Gigante', cat: 'trap' },
  '12000005': { name: 'Bomba Aerea', cat: 'trap' },
  '12000006': { name: 'Mina Aerea a Ricerca', cat: 'trap' },
  '12000008': { name: 'Trappola Scheletrica', cat: 'trap' },
  '12000016': { name: 'Trappola Tornado', cat: 'trap' },
  '12000020': { name: 'Giga Bomba', cat: 'trap' },
};

type RawEntry = { data?: number; lvl?: number; cnt?: number };
function collectEntries(json: any): RawEntry[] {
  const out: RawEntry[] = [];
  const KEYS = ['buildings2', 'buildings', 'traps2', 'units2', 'heroes2', 'heroes', 'pets', 'equipment'];
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

// Priorità consigli stile “farm/war” (restano utili per ordinare a parità di deficit)
const FARM_ORDER = [
  'Laboratorio','Castello del Clan','Casa degli Animali','Fucina','Equipaggiamento',
  'Re Barbaro','Regina degli Arcieri','Gran Sorvegliante','Campionessa Reale',
  'Capanna del Costruttore','Balestra','Difesa Aerea','Torre dello Stregone','Torre delle Bombe',
  'Torre degli Arcieri','Cannone','Mura',
];
const WAR_ORDER = [
  'Municipio','Giga','Artiglieria Aquila','Lanciascaglie','Torre Infernale',
  'Capanna del Costruttore','Balestra','Difesa Aerea',
  'Castello del Clan','Laboratorio','Fucina','Equipaggiamento',
  'Re Barbaro','Regina degli Arcieri','Gran Sorvegliante','Campionessa Reale',
];

type Row = { name: string; have: number; max: number; countAtLevel: number; totalByName: number; deficit: number; };

export default function Page() {
  const [pasted, setPasted] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [missingCaps, setMissingCaps] = useState<{ name: string; have: number; count: number }[]>([]);
  const [error, setError] = useState('');
  const [th, setTh] = useState<number | undefined>(undefined);

  const timer = useRef<any>(null);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => generate(pasted), 250);
    return () => clearTimeout(timer.current);
  }, [pasted]);

  function getCapsForTH(th?: number): Caps {
    if (th === 14) return { ...GLOBAL_CAPS, ...CAPS_TH14 };
    if (!th) return GLOBAL_CAPS;
    // per altri TH usiamo solo i cap globali noti (eroi/pets/equip)
    return GLOBAL_CAPS;
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

    const detectedTH = detectTownHall(json);
    setTh(detectedTH);

    const entries = collectEntries(json);
    if (!entries.length) { setRows([]); return; }

    const totalById = new Map<string, number>();
    for (const e of entries) {
      const id = String(e.data);
      totalById.set(id, (totalById.get(id) || 0) + (e.cnt || 1));
    }

    const caps = getCapsForTH(detectedTH);

    const map = new Map<string, Row>();
    const missing: { name: string; have: number; count: number }[] = [];

    for (const e of entries) {
      const id = String(e.data);
      const meta = ID_NAME_MAP[id];
      if (!meta) continue;

      const name = meta.name;
      const have = e.lvl || 0;
      const count = e.cnt || 1;
      const tot = totalById.get(id) || count;

      // Se l'edificio è “non disponibile a TH14” → max 0 (non mostrato negli upgrade)
      const hard0 = (detectedTH === 14) && CAPS_TH14[name] === 0;
      if (hard0) continue;

      const max = typeof caps[name] === 'number' ? caps[name] : undefined;

      if (typeof max !== 'number') {
        // riconosciuto ma senza cap per questo TH → elenco nel pannello “manca cap”
        missing.push({ name, have, count });
        continue;
      }

      if (!(have < max)) continue;

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

    const typeRank = (n: string) =>
      /re barbaro|regina degli arcieri|gran sorvegliante|campionessa reale/i.test(n) ? 5 :
      /l\.a\.s\.s\.i|gufo elettrico|yak potente|unicorno/i.test(n) ? 4 :
      /equipaggiamento/i.test(n) ? 3 :
      /municipio|giga|artiglieria aquila|lanciascaglie|infernale|balestra|capanna del costruttore/i.test(n) ? 2 :
      1;

    const sorted = Array.from(map.values()).sort((a, b) => {
      if (typeRank(b.name) !== typeRank(a.name)) return typeRank(b.name) - typeRank(a.name);
      if (b.deficit !== a.deficit) return b.deficit - a.deficit;
      if (a.name !== b.name) return a.name.localeCompare(b.name, 'it');
      return a.have - b.have;
    });

    // Pannello “manca cap” – aggrega per nome, livello minimo visto
    const agg = new Map<string, { name: string; have: number; count: number }>();
    for (const m of missing) {
      const prev = agg.get(m.name);
      if (!prev) agg.set(m.name, m);
      else agg.set(m.name, { name: m.name, have: Math.min(prev.have, m.have), count: prev.count + m.count });
    }

    setRows(sorted);
    setMissingCaps(Array.from(agg.values()).sort((a, b) => a.name.localeCompare(b.name, 'it')));
  }

  function rankName(list: string[], n: string): number {
    const i = list.findIndex(x => n.toLowerCase().includes(x.toLowerCase()));
    return i === -1 ? 999 : i;
  }
  const farmAdvice = rows
    .map(r => ({ r, score: rankName(FARM_ORDER, r.name) }))
    .sort((a, b) => a.score - b.score || b.r.deficit - a.r.deficit)
    .map(x => x.r).slice(0, 12);

  const warAdvice = rows
    .map(r => ({ r, score: rankName(WAR_ORDER, r.name) }))
    .sort((a, b) => a.score - b.score || b.r.deficit - a.r.deficit)
    .map(x => x.r).slice(0, 12);

  return (
    <div className="wrap">
      <h1>CoC – Upgrade per TH{th ?? '??'} (in tempo reale)</h1>
      <div className="muted small" style={{marginBottom: 8}}>
        Incolla l’export del villaggio: rilevo TH, categorizzo e mostro solo ciò che puoi ancora upgradare a TH{th ?? '??'}.
      </div>

      <div className="panel">
        <textarea
          className="input"
          rows={12}
          placeholder='Incolla qui tutto o frammenti ("heroes2":[...], "buildings2":[...], ecc.).'
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
        />
        <div className="thbadge">
          {th ? <>TH rilevato: <b>{th}</b></> : <>TH non rilevato (uso cap globali minimi finché non è deducibile)</>}
        </div>
      </div>

      {error && <div className="err small" style={{ margin: '10px 0' }}>{error}</div>}

      {/* Upgrade calcolati */}
      <div className="grid1" style={{ marginTop: 8 }}>
        {rows.length === 0 ? (
          <div className="muted small">
            Nessun upgrade da mostrare con i cap attuali. Se mancano cap per qualche struttura, controlla il pannello sotto.
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

      {/* Consigli */}
      {rows.length > 0 && (
        <>
          <div className="panel" style={{ marginTop: 16 }}>
            <div className="title">Consiglio FARM</div>
            {farmAdvice.length === 0 ? (
              <div className="muted small">Nessuna raccomandazione disponibile.</div>
            ) : (
              <ul className="list">
                {farmAdvice.map((r, i) => (
                  <li key={i}><b>{r.name}</b> — {r.countAtLevel}/{r.totalByName} → {r.have} → {r.max}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel" style={{ marginTop: 12 }}>
            <div className="title">Consiglio WAR</div>
            {warAdvice.length === 0 ? (
              <div className="muted small">Nessuna raccomandazione disponibile.</div>
            ) : (
              <ul className="list">
                {warAdvice.map((r, i) => (
                  <li key={i}><b>{r.name}</b> — {r.countAtLevel}/{r.totalByName} → {r.have} → {r.max}</li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {/* Cosa manca per avere il 100% come sul sito di riferimento */}
      {missingCaps.length > 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="title">Elementi riconosciuti ma senza cap TH14</div>
          <div className="muted small" style={{marginBottom: 8}}>
            Questi elementi sono stati rilevati dal tuo JSON ma non hanno (ancora) un cap impostato per TH14 in questo tool.
          </div>
          <ul className="list">
            {missingCaps.map((m, i) => (
              <li key={i}><b>{m.name}</b> — livello attuale {m.have} (×{m.count})</li>
            ))}
          </ul>
        </div>
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
