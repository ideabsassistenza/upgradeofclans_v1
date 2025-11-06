'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * ZERO-CLICK PASTE → AUTO UPGRADE LIST (TH-AWARE) + CONSIGLI FARM/WAR
 *
 * - Incolli un JSON o frammento: l’app sanifica, parse e genera subito l’elenco.
 * - Rilevo il TH:
 *    1) cerco campi: townHallLevel / town_hall / th / thLevel (anche annidati)
 *    2) se non trovati: cerco nel blocco buildings/buildings2 l’entry con "weapon" → il suo lvl è il TH (Giga)
 *    3) se ancora niente: se trovo "pets" → assumo TH=14 (heuristica valida)
 * - Mostro solo elementi con nome e cap noti (Heroes, Pets, Hero Equipment) **limitati al tuo TH**.
 * - Sotto trovi due liste: consigli **FARM** e **WAR**, calcolate sui tuoi deficit.
 *
 * NOTE FUTURE:
 * - Per far apparire anche difese/trappole/strutture serve la crosswalk ID→Nome + cap-per-TH.
 *   Il codice è pronto per estenderla (vedi ID_NAME_MAP e CAPS_BY_TH), ma qui NON
 *   metto nomi “indovinati”: preferisco essere corretto piuttosto che sbagliare etichette.
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

// -------------------- Caps per TH (Heroes / Pets / Equipment) --------------------
type Caps = { [name: string]: number };

/** Cap-by-TH (fonti community 2024–2025):
 *  - Pets compaiono da TH14 (max ~10)
 *  - Equipment via Blacksmith: cap fino a ~20 a TH14+
 *  - Eroi: TH14 → BK/AQ 85, GW 60, RC 30; TH17 → BK/AQ 100, GW 75, RC 50
 *  (NB: qui copriamo i principali per la tua UI; estendibile senza toccare la logica)
 */
const CAPS_BY_TH: Record<number, Caps> = {
  11: { 'Barbarian King': 50, 'Archer Queen': 50, 'Grand Warden': 20, 'Royal Champion': 0,  'Pet: L.A.S.S.I': 0,  'Pet: Electro Owl': 0,  'Pet: Mighty Yak': 0,  'Pet: Unicorn': 0,  'Equipment': 15 },
  12: { 'Barbarian King': 65, 'Archer Queen': 65, 'Grand Warden': 40, 'Royal Champion': 0,  'Pet: L.A.S.S.I': 0,  'Pet: Electro Owl': 0,  'Pet: Mighty Yak': 0,  'Pet: Unicorn': 0,  'Equipment': 15 },
  13: { 'Barbarian King': 75, 'Archer Queen': 75, 'Grand Warden': 50, 'Royal Champion': 25, 'Pet: L.A.S.S.I': 0,  'Pet: Electro Owl': 0,  'Pet: Mighty Yak': 0,  'Pet: Unicorn': 0,  'Equipment': 18 },
  14: { 'Barbarian King': 85, 'Archer Queen': 85, 'Grand Warden': 60, 'Royal Champion': 30, 'Pet: L.A.S.S.I': 10, 'Pet: Electro Owl': 10, 'Pet: Mighty Yak': 10, 'Pet: Unicorn': 10, 'Equipment': 20 },
  15: { 'Barbarian King': 85, 'Archer Queen': 85, 'Grand Warden': 65, 'Royal Champion': 40, 'Pet: L.A.S.S.I': 10, 'Pet: Electro Owl': 10, 'Pet: Mighty Yak': 10, 'Pet: Unicorn': 10, 'Equipment': 20 },
  16: { 'Barbarian King': 95, 'Archer Queen': 95, 'Grand Warden': 70, 'Royal Champion': 45, 'Pet: L.A.S.S.I': 10, 'Pet: Electro Owl': 10, 'Pet: Mighty Yak': 10, 'Pet: Unicorn': 10, 'Equipment': 20 },
  17: { 'Barbarian King':100, 'Archer Queen':100, 'Grand Warden': 75, 'Royal Champion': 50, 'Pet: L.A.S.S.I': 10, 'Pet: Electro Owl': 10, 'Pet: Mighty Yak': 10, 'Pet: Unicorn': 10, 'Equipment': 20 },
};
// Max “globali” usati solo se TH non è deducibile
const GLOBAL_CAPS: Caps = CAPS_BY_TH[17];

// -------------------- ID → NAME per gli elementi che copriamo ora --------------------
const ID_NAME_MAP: Record<
  string,
  { name: string; cat: 'hero' | 'pet' | 'equipment' | 'building' | 'trap' | 'unit' | 'other' }
> = {
  // HEROES
  '28000003': { name: 'Barbarian King', cat: 'hero' },
  '28000005': { name: 'Archer Queen',   cat: 'hero' },

  // PETS (TH14+ classici)
  '73000000': { name: 'Pet: L.A.S.S.I',   cat: 'pet' },
  '73000001': { name: 'Pet: Electro Owl', cat: 'pet' },
  '73000002': { name: 'Pet: Mighty Yak',  cat: 'pet' },
  '73000003': { name: 'Pet: Unicorn',     cat: 'pet' },

  // HERO EQUIPMENT (generico → cap per TH, di base 20 da TH14)
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

// -------------------- Consigli FARM / WAR (TH14) --------------------
const FARM_PRIORITY_TH14 = [
  'Laboratory', 'Clan Castle', 'Pet House', 'Blacksmith', 'Equipment',
  'Army Camp', 'Barracks', 'Factory', 'Workshop',
  'Barbarian King', 'Archer Queen', 'Grand Warden', 'Royal Champion',
  'Builder’s Hut', 'X-Bow', 'Air Defense', 'Wizard Tower', 'Bomb Tower'
];

const WAR_PRIORITY_TH14 = [
  'Giga', 'Town Hall', 'Eagle Artillery', 'Scattershot', 'Inferno Tower',
  'Builder’s Hut', 'X-Bow', 'Air Defense',
  'Clan Castle', 'Laboratory', 'Blacksmith', 'Equipment',
  'Barbarian King', 'Archer Queen', 'Grand Warden', 'Royal Champion',
];

// -------------------- UI --------------------
type Row = { name: string; have: number; max: number; countAtLevel: number; totalByName: number; deficit: number; };

export default function Page() {
  const [pasted, setPasted] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
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
    const best = [17,16,15,14,13,12,11].find(x => x <= (th || 0)) || 11;
    return { ...GLOBAL_CAPS, ...(CAPS_BY_TH[best] || {}) };
  }

  function generate(text: string) {
    setError('');
    setRows([]);
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

    // 3) totali per ID
    const totalById = new Map<string, number>();
    for (const e of entries) {
      const id = String(e.data);
      totalById.set(id, (totalById.get(id) || 0) + (e.cnt || 1));
    }

    // 4) caps in base al TH
    const caps = getCapsForTH(detectedTH);

    // 5) righe (solo elementi mappati + cap noto)
    const map = new Map<string, Row>();
    for (const e of entries) {
      const id = String(e.data);
      const meta = ID_NAME_MAP[id];
      if (!meta) continue; // non mappato → salto (evito nomi sbagliati)

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

    // Ordine base: eroi > pets > equipment, poi per deficit
    const baseSorted = Array.from(map.values()).sort((a, b) => {
      const rank = (n: string) =>
        /king|queen|warden|champion/i.test(n) ? 3 :
        /^pet:/i.test(n) ? 2 :
        (n === 'Equipment' ? 1 : 0);
      if (rank(b.name) !== rank(a.name)) return rank(b.name) - rank(a.name);
      if (b.deficit !== a.deficit) return b.deficit - a.deficit;
      if (a.name !== b.name) return a.name.localeCompare(b.name);
      return a.have - b.have;
    });

    setRows(baseSorted);
  }

  // Suggerimenti (su TH14 hanno senso pieno; per altri TH rimangono indicativi)
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
        Incolla il JSON/frammento del villaggio. Rilevo il TH e mostro solo ciò che puoi ancora portare al massimo per il tuo TH.
      </div>

      <div className="panel">
        <textarea
          className="input"
          rows={12}
          placeholder='Incolla qui. Esempio: "heroes2":[...], "pets":[...], "equipment":[...], ...  (anche senza graffe)'
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
        />
        <div className="thbadge">
          {th ? <>TH rilevato: <b>{th}</b></> : <>TH non rilevato (uso cap globali finché non è deducibile)</>}
        </div>
      </div>

      {error && <div className="err small" style={{ margin: '10px 0' }}>{error}</div>}

      <div className="grid1" style={{ marginTop: 8 }}>
        {rows.length === 0 ? (
          <div className="muted small">
            Nessun upgrade da mostrare con le info attuali. (Per difese/trappole/strutture, va aggiunta la mappa ID→Nome).
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

      {rows.length > 0 && (
        <>
          <div className="panel" style={{ marginTop: 16 }}>
            <div className="title">Consiglio FARM</div>
            <div className="muted small" style={{marginBottom: 8}}>
              Priorità per farming: offense/economia (Lab, CC, Pet House, Blacksmith/Equipment, eserciti) → difese utili a proteggere risorse.
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
            <div className="title">Consiglio WAR</div>
            <div className="muted small" style={{marginBottom: 8}}>
              Priorità per guerra: Giga/Town Hall, Eagle, Scatter, Inferno, Builder’s Hut, X-Bow; in parallelo CC/Lab/Equipment ed eroi.
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
