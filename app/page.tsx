'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * ZERO-CLICK PASTE → AUTO UPGRADE LIST (TH-AWARE + FARM/WAR)
 *
 * Novità:
 * - TH detection:
 *    1) prova a leggere campi noti: townHallLevel / town_hall / th / thLevel (anche annidati)
 *    2) fallback: se trovo "pets":[...] ⇒ TH=14 (heuristic robusta per il tuo caso)
 * - Mostra elenco upgrade limitato ai cap del TH
 * - Aggiunge "Consiglio FARM" e "Consiglio WAR" per TH14
 */

// -------------------- TH detection helpers --------------------
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

function detectTownHallExplicit(json: any): number | undefined {
  const n = deepFindNumber(json, ['townHallLevel', 'town_hall', 'th', 'thLevel']);
  if (typeof n === 'number' && n >= 1 && n <= 20) return n;
  return undefined;
}

function hasPets(json: any): boolean {
  const pets = json?.pets;
  return Array.isArray(pets) && pets.length > 0;
}

// -------------------- Caps per TH (Heroes/Pets/Equipment) --------------------
type Caps = { [name: string]: number };

const CAPS_BY_TH: Record<number, Caps> = {
  11: { 'Barbarian King': 50, 'Archer Queen': 50, 'Grand Warden': 20, 'Royal Champion': 0,  'Pet: L.A.S.S.I': 0,  'Pet: Electro Owl': 0,  'Pet: Mighty Yak': 0,  'Pet: Unicorn': 0,  'Equipment': 15 },
  12: { 'Barbarian King': 65, 'Archer Queen': 65, 'Grand Warden': 40, 'Royal Champion': 0,  'Pet: L.A.S.S.I': 0,  'Pet: Electro Owl': 0,  'Pet: Mighty Yak': 0,  'Pet: Unicorn': 0,  'Equipment': 15 },
  13: { 'Barbarian King': 75, 'Archer Queen': 75, 'Grand Warden': 50, 'Royal Champion': 25, 'Pet: L.A.S.S.I': 0,  'Pet: Electro Owl': 0,  'Pet: Mighty Yak': 0,  'Pet: Unicorn': 0,  'Equipment': 18 },
  14: { 'Barbarian King': 85, 'Archer Queen': 85, 'Grand Warden': 60, 'Royal Champion': 30, 'Pet: L.A.S.S.I': 10, 'Pet: Electro Owl': 10, 'Pet: Mighty Yak': 10, 'Pet: Unicorn': 10, 'Equipment': 20 },
  15: { 'Barbarian King': 85, 'Archer Queen': 85, 'Grand Warden': 65, 'Royal Champion': 40, 'Pet: L.A.S.S.I': 10, 'Pet: Electro Owl': 10, 'Pet: Mighty Yak': 10, 'Pet: Unicorn': 10, 'Equipment': 20 },
  16: { 'Barbarian King': 95, 'Archer Queen': 95, 'Grand Warden': 70, 'Royal Champion': 45, 'Pet: L.A.S.S.I': 10, 'Pet: Electro Owl': 10, 'Pet: Mighty Yak': 10, 'Pet: Unicorn': 10, 'Equipment': 20 },
  17: { 'Barbarian King':100, 'Archer Queen':100, 'Grand Warden': 75, 'Royal Champion': 50, 'Pet: L.A.S.S.I': 10, 'Pet: Electro Owl': 10, 'Pet: Mighty Yak': 10, 'Pet: Unicorn': 10, 'Equipment': 20 },
};
const GLOBAL_CAPS: Caps = CAPS_BY_TH[17];

// -------------------- ID → NAME (copriamo heroes/pets/equipment del tuo dump) --------------------
const ID_NAME_MAP: Record<string, { name: string; cat: 'hero'|'pet'|'equipment'|'building'|'trap'|'unit'|'other' }> = {
  // HEROES
  '28000003': { name: 'Barbarian King', cat: 'hero' },
  '28000005': { name: 'Archer Queen',   cat: 'hero' },
  // PETS
  '73000000': { name: 'Pet: L.A.S.S.I',   cat: 'pet' },
  '73000001': { name: 'Pet: Electro Owl', cat: 'pet' },
  '73000002': { name: 'Pet: Mighty Yak',  cat: 'pet' },
  '73000003': { name: 'Pet: Unicorn',     cat: 'pet' },
  // EQUIPMENT (generico → cap 20)
  '90000000': { name: 'Equipment', cat: 'equipment' },
  '90000001': { name: 'Equipment', cat: 'equipment' },
  '90000002': { name: 'Equipment', cat: 'equipment' },
  '90000003': { name: 'Equipment', cat: 'equipment' },
  '90000004': { name: 'Equipment', cat: 'equipment' },
  '90000005': { name: 'Equipment', cat: 'equipment' },
  '90000006': { name: 'Equipment', cat: 'equipment' },
  '90000007': { name: 'Equipment', cat: 'equipment' },
  '90000008': { name: 'Equipment', cat: 'equipment' },
  '90000009': { name: 'Equipment', cat: 'equipment' },
  '90000010': { name: 'Equipment', cat: 'equipment' },
  '90000011': { name: 'Equipment', cat: 'equipment' },
  '90000013': { name: 'Equipment', cat: 'equipment' },
  '90000014': { name: 'Equipment', cat: 'equipment' },
  '90000015': { name: 'Equipment', cat: 'equipment' },
  '90000017': { name: 'Equipment', cat: 'equipment' },
  '90000019': { name: 'Equipment', cat: 'equipment' },
  '90000020': { name: 'Equipment', cat: 'equipment' },
  '90000022': { name: 'Equipment', cat: 'equipment' },
  '90000024': { name: 'Equipment', cat: 'equipment' },
  '90000032': { name: 'Equipment', cat: 'equipment' },
  '90000034': { name: 'Equipment', cat: 'equipment' },
  '90000035': { name: 'Equipment', cat: 'equipment' },
  '90000039': { name: 'Equipment', cat: 'equipment' },
  '90000040': { name: 'Equipment', cat: 'equipment' },
  '90000041': { name: 'Equipment', cat: 'equipment' },
  '90000042': { name: 'Equipment', cat: 'equipment' },
  '90000043': { name: 'Equipment', cat: 'equipment' },
  '90000044': { name: 'Equipment', cat: 'equipment' },
  '90000047': { name: 'Equipment', cat: 'equipment' },
  '90000048': { name: 'Equipment', cat: 'equipment' },
  '90000049': { name: 'Equipment', cat: 'equipment' },
};

// -------------------- Parsing frammenti JSON --------------------
function tryParse<T = any>(s: string): T { return JSON.parse(s); }
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

type RawEntry = { data?: number; lvl?: number; cnt?: number };
function collectEntries(json: any): RawEntry[] {
  const out: RawEntry[] = [];
  const KEYS = ['buildings2', 'traps2', 'units2', 'heroes2', 'pets', 'equipment'];
  for (const k of KEYS) {
    const arr = json?.[k];
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

// -------------------- Consigli FARM / WAR (TH14) --------------------
const FARM_PRIORITY_TH14 = [
  // Offense & economia per farming
  'Laboratory', 'Clan Castle', 'Pet House', 'Blacksmith/Equipment',
  'Army Camp', 'Barracks/Factory/Workshop',
  'Barbarian King', 'Archer Queen', 'Grand Warden', 'Royal Champion',
  // Difese utili a proteggere risorse
  'Builder’s Hut', 'X-Bow', 'Air Defense', 'Wizard Tower', 'Bomb Tower'
];

const WAR_PRIORITY_TH14 = [
  // Difese core + town hall weapon + offense chiave
  'Giga Inferno (Town Hall)', 'Eagle Artillery', 'Scattershot', 'Inferno Tower',
  'Builder’s Hut', 'X-Bow', 'Air Defense',
  // Offense
  'Clan Castle', 'Laboratory', 'Blacksmith/Equipment',
  'Barbarian King', 'Archer Queen', 'Grand Warden', 'Royal Champion',
];

// Nota: questi elenchi sono linee guida (fonti 2024–2025). Li usiamo come
// "ranking" per suggerire l'ordine a parità di deficit.

// -------------------- UI component --------------------
type Row = { name: string; have: number; max: number; countAtLevel: number; totalByName: number; deficit: number; };

export default function Page() {
  const [pasted, setPasted] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [th, setTh] = useState<number | undefined>(undefined);

  const timer = useRef<any>(null);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => generate(pasted), 250);
    return () => clearTimeout(timer.current);
  }, [pasted]);

  function getCapsForTH(th?: number): Caps {
    if (!th) return GLOBAL_CAPS;
    const fallbackTH = [17,16,15,14,13,12,11].find(x => x <= (th || 0)) || 11;
    return { ...GLOBAL_CAPS, ...(CAPS_BY_TH[fallbackTH] || {}) };
  }

  function generate(text: string) {
    setError('');
    setRows([]);
    setTh(undefined);
    if (!text.trim()) return;

    let json: any;
    try { json = sanitizeToJSONObject(text); }
    catch (e: any) { setError('JSON non valido: ' + (e?.message || 'errore di parsing')); return; }

    // 1) TH esplicito o heuristic da pets
    let detectedTH = detectTownHallExplicit(json);
    if (!detectedTH && hasPets(json)) detectedTH = 14;
    setTh(detectedTH);

    const entries = collectEntries(json);
    if (!entries.length) { setError('Nessun blocco riconoscibile (buildings2/traps2/units2/heroes2/pets/equipment).'); return; }

    // Totali per ID
    const totalById = new Map<string, number>();
    for (const e of entries) {
      const id = String(e.data);
      totalById.set(id, (totalById.get(id) || 0) + (e.cnt || 1));
    }

    const caps = getCapsForTH(detectedTH);

    // Genero righe SOLO per elementi con nome noto + cap per TH
    const map = new Map<string, Row>();
    for (const e of entries) {
      const id = String(e.data);
      const meta = ID_NAME_MAP[id];
      if (!meta) continue;

      const name = meta.name;
      const max = typeof caps[name] === 'number' ? caps[name] : undefined;
      if (!max || max <= 0) continue;

      const have = e.lvl || 0;
      if (!(have < max)) continue;

      const key = name + '__' + have;
      const prev = map.get(key);
      const row: Row = prev || {
        name, have, max,
        countAtLevel: 0,
        totalByName: totalById.get(id) || (e.cnt || 1),
        deficit: Math.max(0, max - have),
      };
      row.countAtLevel += e.cnt || 1;
      map.set(key, row);
    }

    // Ordine base (eroi > pets > equipment), poi deficit
    const baseSorted = Array.from(map.values()).sort((a, b) => {
      const rank = (n: string) =>
        /king|queen|warden|champion/i.test(n) ? 3 :
        /^pet:/i.test(n) ? 2 : (n === 'Equipment' ? 1 : 0);
      if (rank(b.name) !== rank(a.name)) return rank(b.name) - rank(a.name);
      if (b.deficit !== a.deficit) return b.deficit - a.deficit;
      if (a.name !== b.name) return a.name.localeCompare(b.name);
      return a.have - b.have;
    });

    setRows(baseSorted);
  }

  // ---- Suggerimenti FARM/WAR (su TH14) ----
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
        Incolla il JSON/frammento del villaggio. Rilevo il TH (o uso TH=14 se vedo i Pets) e mostro l’elenco limitato ai cap del tuo TH.
      </div>

      <div className="panel">
        <textarea
          className="input"
          rows={12}
          placeholder='Incolla qui. Esempio: "heroes2":[...], "pets":[...], "equipment":[...], ...'
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
        />
        <div className="thbadge">
          {th ? <>TH rilevato: <b>{th}</b></> : <>TH non rilevato: <b>{hasPets(safeTry(() => sanitizeToJSONObject(pasted)) || {}) ? 'uso 14 (pets presenti)' : 'uso max globali'}</b></>}
        </div>
      </div>

      {error && <div className="err small" style={{ margin: '10px 0' }}>{error}</div>}

      <div className="grid1" style={{ marginTop: 8 }}>
        {rows.length === 0 ? (
          <div className="muted small">
            Nessun upgrade da mostrare con le info attuali (per buildings/traps serve mappa ID→Nome).
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
            <div className="title">Consiglio FARM (TH14)</div>
            <div className="muted small" style={{marginBottom: 8}}>
              Priorità orientata a farming: laboratorio, CC, Pet House, equipment, campi/eserciti; poi difese utili a proteggere risorse.
            </div>
            {farmAdvice.length === 0 ? (
              <div className="muted small">Nessuna raccomandazione disponibile dai dati incollati.</div>
            ) : (
              <ul className="list">
                {farmAdvice.map((r, i) => (
                  <li key={i}><b>{r.name}</b> — {r.countAtLevel}/{r.totalByName} → liv. {r.have} → {r.max} (deficit {r.deficit})</li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel" style={{ marginTop: 12 }}>
            <div className="title">Consiglio WAR (TH14)</div>
            <div className="muted small" style={{marginBottom: 8}}>
              Priorità orientata alla guerra: Giga Inferno, Eagle, Scattershot, Inferno, Builder’s Hut, X-Bow; CC/Lab/Equipment ed eroi sempre in alto.
            </div>
            {warAdvice.length === 0 ? (
              <div className="muted small">Nessuna raccomandazione disponibile dai dati incollati.</div>
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

// helper sicuro per leggere lo state in badge TH
function safeTry(fn: () => any) { try { return fn(); } catch { return null; } }
