'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * ZERO-CLICK PASTE → AUTO UPGRADE LIST (TH-AWARE)
 *
 * Novità:
 * - Riconoscimento TH dal JSON se presente (campi: townHallLevel / town_hall / th / thLevel, anche annidati).
 * - Max levels filtrati per TH (Heroes / Pets / Equipment) invece che globali.
 * - Se il TH non è deducibile dal frammento incollato → fallback “TH sconosciuto (uso max globali)”.
 *
 * NOTE:
 * - Per Buildings/Traps serve sempre la mappa ID→Nome + tabella max per TH (hook già pronto sotto).
 * - Per ora copriamo bene Heroes+Pets+Equipment; Buildings/Traps compariranno appena aggiungiamo le mappe ID.
 */

// ---------------------------------------------------------------
// TH detection: cerco in più campi comuni e anche annidati
// ---------------------------------------------------------------
function deepFindNumber(obj: any, keys: string[]): number | undefined {
  try {
    const stack = [obj];
    while (stack.length) {
      const cur = stack.pop();
      if (!cur || typeof cur !== 'object') continue;
      for (const k of keys) {
        if (cur && Object.prototype.hasOwnProperty.call(cur, k)) {
          const v = cur[k];
          if (typeof v === 'number') return v;
        }
      }
      for (const v of Object.values(cur)) {
        if (v && typeof v === 'object') stack.push(v);
      }
    }
  } catch {}
  return undefined;
}

/** Prova a dedurre il TH dal JSON incollato. */
function detectTownHall(json: any): number | undefined {
  // Campi “classici” che alcuni export includono
  const direct = deepFindNumber(json, ['townHallLevel', 'town_hall', 'th', 'thLevel']);
  if (typeof direct === 'number' && direct >= 1 && direct <= 20) return direct;

  // Fallback: nulla di certo → undefined (userà max globali).
  return undefined;
}

// ---------------------------------------------------------------
// MAX LEVELS PER TH (Heroes / Pets / Equipment)
// Fonti generali community 2024–2025 (TH17): Hero caps e Pets ~10, Equipment cap ~20.
// (Eroi per TH chiave: Warden dal TH11, RC dal TH13; qui imponiamo i cap-by-TH noti/pratici.)
// ---------------------------------------------------------------
type Caps = { [name: string]: number };

const CAPS_BY_TH: Record<number, Caps> = {
  // NB: includiamo solo ciò che usiamo ora (Heroes/Pets/Equipment). Estendibile in futuro.
  11: { 'Barbarian King': 50, 'Archer Queen': 50, 'Grand Warden': 20, 'Royal Champion': 0,  'Pet: L.A.S.S.I': 0, 'Pet: Electro Owl': 0, 'Pet: Mighty Yak': 0, 'Pet: Unicorn': 0, 'Equipment': 15 },
  12: { 'Barbarian King': 65, 'Archer Queen': 65, 'Grand Warden': 40, 'Royal Champion': 0,  'Pet: L.A.S.S.I': 0, 'Pet: Electro Owl': 0, 'Pet: Mighty Yak': 0, 'Pet: Unicorn': 0, 'Equipment': 15 },
  13: { 'Barbarian King': 75, 'Archer Queen': 75, 'Grand Warden': 50, 'Royal Champion': 25, 'Pet: L.A.S.S.I': 0, 'Pet: Electro Owl': 0, 'Pet: Mighty Yak': 0, 'Pet: Unicorn': 0, 'Equipment': 18 },
  14: { 'Barbarian King': 80, 'Archer Queen': 80, 'Grand Warden': 55, 'Royal Champion': 30, 'Pet: L.A.S.S.I': 10,'Pet: Electro Owl': 10,'Pet: Mighty Yak': 10,'Pet: Unicorn': 10,'Equipment': 18 },
  15: { 'Barbarian King': 85, 'Archer Queen': 85, 'Grand Warden': 60, 'Royal Champion': 35, 'Pet: L.A.S.S.I': 10,'Pet: Electro Owl': 10,'Pet: Mighty Yak': 10,'Pet: Unicorn': 10,'Equipment': 20 },
  16: { 'Barbarian King': 95, 'Archer Queen': 95, 'Grand Warden': 70, 'Royal Champion': 45, 'Pet: L.A.S.S.I': 10,'Pet: Electro Owl': 10,'Pet: Mighty Yak': 10,'Pet: Unicorn': 10,'Equipment': 20 },
  17: { 'Barbarian King':100, 'Archer Queen':100, 'Grand Warden': 75, 'Royal Champion': 50, 'Pet: L.A.S.S.I': 10,'Pet: Electro Owl': 10,'Pet: Mighty Yak': 10,'Pet: Unicorn': 10,'Equipment': 20 },
};

// Max globali (se TH sconosciuto): stessi cap “internet standard” TH17
const GLOBAL_CAPS: Caps = {
  'Barbarian King': 100,
  'Archer Queen': 100,
  'Grand Warden': 75,
  'Royal Champion': 50,
  'Pet: L.A.S.S.I': 10,
  'Pet: Electro Owl': 10,
  'Pet: Mighty Yak': 10,
  'Pet: Unicorn': 10,
  'Equipment': 20,
};

// ---------------------------------------------------------------
// ID → NAME per quello che copriamo ora (heroes/pets/equipment)
// ---------------------------------------------------------------
const ID_NAME_MAP: Record<
  string,
  { name: string; cat: 'hero' | 'pet' | 'equipment' | 'building' | 'trap' | 'unit' | 'other' }
> = {
  // HEROES
  '28000003': { name: 'Barbarian King', cat: 'hero' },
  '28000005': { name: 'Archer Queen',   cat: 'hero' },
  // (Se in futuro hai Warden/RC: aggiungeremo i loro ID alla mappa)

  // PETS (classici 4)
  '73000000': { name: 'Pet: L.A.S.S.I',   cat: 'pet' },
  '73000001': { name: 'Pet: Electro Owl', cat: 'pet' },
  '73000002': { name: 'Pet: Mighty Yak',  cat: 'pet' },
  '73000003': { name: 'Pet: Unicorn',     cat: 'pet' },

  // HERO EQUIPMENT (range visto nel tuo dump)
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

  // Buildings/Traps: hook da riempire quando aggiungiamo la crosswalk
};

// ---------------------------------------------------------------
// Parser frammenti JSON e raccolta
// ---------------------------------------------------------------
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
          out.push({ data: Number(it.data), lvl: Number(it.lvl), cnt: Number((it as any).cnt || 1) });
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------
// Calcolo righe
// ---------------------------------------------------------------
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
    // prendo la riga migliore disponibile ≤ th, e poi upmerge con global per eventuali chiavi mancanti
    const keys = Object.keys(GLOBAL_CAPS);
    const base: Caps = {};
    for (const k of keys) base[k] = GLOBAL_CAPS[k];
    const thCaps = CAPS_BY_TH[th] || CAPS_BY_TH[
      [17,16,15,14,13,12,11].find(x => x <= (th||0)) || 11
    ];
    return { ...base, ...thCaps };
  }

  function generate(text: string) {
    setError('');
    setRows([]);
    setTh(undefined);

    if (!text.trim()) return;

    let json: any;
    try { json = sanitizeToJSONObject(text); }
    catch (e: any) { setError('JSON non valido: ' + (e?.message || 'errore di parsing')); return; }

    // 1) Deduci TH (se possibile)
    const detectedTH = detectTownHall(json);
    setTh(detectedTH);

    // 2) Raccogli voci
    const entries = collectEntries(json);
    if (!entries.length) { setError('Nessun blocco riconoscibile (buildings2/traps2/units2/heroes2/pets/equipment).'); return; }

    // 3) Conta totale occorrenze per ID
    const totalById = new Map<string, number>();
    for (const e of entries) {
      const id = String(e.data);
      totalById.set(id, (totalById.get(id) || 0) + (e.cnt || 1));
    }

    // 4) Caps in funzione del TH
    const caps = getCapsForTH(detectedTH);

    // 5) Genera righe solo per elementi con nome noto + cap per TH
    const map = new Map<string, Row>();
    for (const e of entries) {
      const id = String(e.data);
      const meta = ID_NAME_MAP[id];
      if (!meta) continue; // non mappato → salto

      const name = meta.name;
      const max = typeof caps[name] === 'number' ? caps[name] : undefined;
      if (!max || max <= 0) continue;

      const have = e.lvl || 0;
      if (!(have < max)) continue; // già al cap per il TUO TH → non mostrare

      const key = name + '__' + have;
      const prev = map.get(key);
      const row: Row = prev || {
        name,
        have,
        max,
        countAtLevel: 0,
        totalByName: totalById.get(id) || (e.cnt || 1),
        deficit: Math.max(0, max - have),
      };
      row.countAtLevel += e.cnt || 1;
      map.set(key, row);
    }

    const arr = Array.from(map.values()).sort((a, b) => {
      // Heroes prima, poi Pets, poi Equipment
      const rank = (n: string) =>
        /king|queen|warden|champion/i.test(n) ? 3 :
        /^pet:/i.test(n) ? 2 : (n === 'Equipment' ? 1 : 0);
      if (rank(b.name) !== rank(a.name)) return rank(b.name) - rank(a.name);
      if (b.deficit !== a.deficit) return b.deficit - a.deficit;
      if (a.name !== b.name) return a.name.localeCompare(b.name);
      return a.have - b.have;
    });

    setRows(arr);
  }

  return (
    <div className="wrap">
      <h1>CoC – Upgrade (cap per TH)</h1>
      <div className="muted small" style={{marginBottom: 8}}>
        Incolla il JSON/frammento del villaggio. L’elenco compare sotto, limitato ai max del tuo Town Hall.
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
          {th ? <>TH rilevato: <b>{th}</b></> : <>TH sconosciuto: uso <b>max globali</b> finché non è deducibile</>}
        </div>
      </div>

      {error && <div className="err small" style={{ margin: '10px 0' }}>{error}</div>}

      <div className="grid1" style={{ marginTop: 8 }}>
        {rows.length === 0 ? (
          <div className="muted small">
            Nessun upgrade da mostrare con le info attuali. Se mancano Buildings/Traps, serve mappa ID→Nome.
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
      `}</style>
    </div>
  );
}
