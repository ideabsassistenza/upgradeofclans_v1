'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

/**
 * ZERO-CLICK: incolli il JSON (anche frammento) → appare subito l’elenco degli upgrade.
 * Nessun bottone, nessun filtro, solo la lista "Nome  x/y → liv. a → b".
 *
 * Copertura immediata:
 *  - EROI (King, Queen) con livelli massimi tipici a TH17
 *  - PETS (max 10 come baseline attuale)
 *  - HERO EQUIPMENT (baseline cap 20: molti equip arrivano a 20)
 *
 * Buildings/Traps: per calcolarli serve la mappa ID→Nome (gli export usano data-id numerici).
 * Il codice sotto ha l’hook già pronto (ID_NAME_MAP). Appena aggiungiamo le coppie reali,
 * compariranno automaticamente in elenco con i loro max.
 */

// ========================= MAX by NAME =========================
// Base "come su internet" (baseline attuale molto diffusa).
const MAX_BY_NAME: Record<string, number> = {
  // Heroes
  'Barbarian King': 100,
  'Archer Queen': 100,
  'Grand Warden': 75,
  'Royal Champion': 50,

  // Pets (baseline attuale: 10)
  'Pet: L.A.S.S.I': 10,
  'Pet: Electro Owl': 10,
  'Pet: Mighty Yak': 10,
  'Pet: Unicorn': 10,

  // Hero Equipment (molti equip arrivano a 20)
  'Equipment': 20, // default cap per equip se non distinguiamo per nome
};

// ========================= ID → NAME =========================
// Primo gancio per risolvere rapidamente gli ID presenti nel tuo dump.
// Aggiungi qui man mano (o dimmene 10 per volta e li inserisco io).
const ID_NAME_MAP: Record<string, { name: string; cat: 'hero' | 'pet' | 'equipment' | 'building' | 'trap' | 'unit' | 'other' }> = {
  // --- HEROES (dal tuo dump) ---
  '28000003': { name: 'Barbarian King', cat: 'hero' },
  '28000005': { name: 'Archer Queen',   cat: 'hero' },

  // --- PETS (dal tuo dump: 73000000..03) ---
  '73000000': { name: 'Pet: L.A.S.S.I',     cat: 'pet' },
  '73000001': { name: 'Pet: Electro Owl',   cat: 'pet' },
  '73000002': { name: 'Pet: Mighty Yak',    cat: 'pet' },
  '73000003': { name: 'Pet: Unicorn',       cat: 'pet' },

  // --- HERO EQUIPMENT (range 90000000..90000049 nel tuo dump)
  // Se non distinguiamo per nome specifico, usiamo il cap Equipment=20.
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

  // --- PLACEHOLDER buildings/traps/units (da riempire con nomi reali) ---
  // Esempio (quando li sapremo):
  // '1000049': { name: 'Inferno Tower', cat: 'building' },
  // '1000048': { name: 'X-Bow',         cat: 'building' },
  // '1000044': { name: 'Archer Tower',  cat: 'building' },
  // '12000010': { name: 'Giant Bomb',   cat: 'trap'     },
};

// ========================= Parser frammenti JSON =========================
function tryParse<T = any>(s: string): T { return JSON.parse(s); }

/** Accetta:
 *  - JSON completo:           { "buildings2":[...], ... }
 *  - Frammenti:               "buildings2":[...], "traps2":[...], ...  (senza graffe)
 *  - Virgole finali, spazi vari
 */
function sanitizeToJSONObject(rawText: string): any {
  let t = (rawText || '').trim();
  if (t.startsWith('{') || t.startsWith('[')) {
    try { return tryParse(t); } catch { /* continua */ }
  }
  if (/^["a-zA-Z]/.test(t) && !t.startsWith('{')) t = '{' + t + '}';
  t = t.replace(/,(\s*[}\]])/g, '$1');

  const opens = (t.match(/{/g) || []).length;
  const closes = (t.match(/}/g) || []).length;
  if (opens > closes) t = t + '}'.repeat(opens - closes);
  else if (closes > opens) {
    let extra = closes - opens;
    while (extra-- > 0 && t.endsWith('}')) t = t.slice(0, -1);
  }

  const oBr = (t.match(/\[/g) || []).length;
  const cBr = (t.match(/\]/g) || []).length;
  if (oBr > cBr) t = t + ']'.repeat(oBr - cBr);
  else if (cBr > oBr) {
    let extra = cBr - oBr;
    while (extra-- > 0 && t.endsWith(']')) t = t.slice(0, -1);
  }

  return tryParse(t);
}

// ========================= Raccolta record dai blocchi noti =========================
type RawEntry = { data?: number; lvl?: number; cnt?: number };

function collectEntries(json: any): RawEntry[] {
  const out: RawEntry[] = [];
  const CANDIDATE_KEYS = ['buildings2', 'traps2', 'units2', 'heroes2', 'pets', 'equipment'];
  for (const k of CANDIDATE_KEYS) {
    const arr = json?.[k];
    if (Array.isArray(arr)) {
      for (const it of arr) {
        if (typeof it === 'object' && it && ('data' in it) && ('lvl' in it)) {
          out.push({ data: Number(it.data), lvl: Number(it.lvl), cnt: Number(it.cnt || 1) });
        }
      }
    }
  }
  return out;
}

// ========================= Calcolo righe output =========================
type Row = {
  name: string;
  have: number;
  max: number;
  countAtLevel: number;
  totalByName: number;
  deficit: number;
};

export default function Page() {
  const [pasted, setPasted] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');

  // Debounce leggero: genera 300ms dopo che smetti di scrivere/incollare
  const timer = useRef<any>(null);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => generate(pasted), 300);
    return () => clearTimeout(timer.current);
  }, [pasted]);

  function generate(text: string) {
    setError('');
    if (!text.trim()) { setRows([]); return; }

    let json: any;
    try {
      json = sanitizeToJSONObject(text);
    } catch (e: any) {
      setRows([]);
      setError('JSON non valido: ' + (e?.message || 'errore di parsing'));
      return;
    }

    const entries = collectEntries(json);
    if (!entries.length) {
      setRows([]);
      setError('Nessun blocco riconoscibile (buildings2/traps2/units2/heroes2/pets/equipment).');
      return;
    }

    // Totali per ID
    const totalById = new Map<string, number>();
    for (const e of entries) {
      const id = String(e.data);
      totalById.set(id, (totalById.get(id) || 0) + (e.cnt || 1));
    }

    // Raggruppo per (nome, livello) solo se ho nome + max
    const map = new Map<string, Row>(); // key = name__have
    for (const e of entries) {
      const id = String(e.data);
      const meta = ID_NAME_MAP[id];
      if (!meta) continue; // non so il nome → salto

      const name = meta.name;
      // max preferibilmente specifico per nome; se equipment generico, usa cap equipment
      const max =
        MAX_BY_NAME[name] ??
        (meta.cat === 'equipment' ? (MAX_BY_NAME['Equipment'] || 20) : undefined);

      if (!max) continue; // se non ho un max affidabile → salto

      const have = e.lvl || 0;
      if (!(have < max)) continue; // già al max → non mostrare

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

    // Ordinamento consigliato: Heroes > equip/pets > resto; poi deficit, poi nome
    function categoryWeight(name: string) {
      const n = name.toLowerCase();
      if (/king|queen|warden|champion/.test(n)) return 100;
      if (n.startsWith('pet:')) return 70;
      if (name === 'Equipment') return 60;
      return 20;
    }

    const arr = Array.from(map.values());
    arr.sort((a, b) => {
      const ca = categoryWeight(a.name);
      const cb = categoryWeight(b.name);
      if (cb !== ca) return cb - ca;
      if (b.deficit !== a.deficit) return b.deficit - a.deficit;
      if (a.name !== b.name) return a.name.localeCompare(b.name);
      return a.have - b.have;
    });

    setRows(arr);
  }

  return (
    <div className="wrap">
      <h1>CoC – Elenco upgrade automatici</h1>

      <div className="panel">
        <div className="muted small" style={{ marginBottom: 8 }}>
          Incolla qui il JSON/frammento dal gioco. L’elenco compare sotto automaticamente.
        </div>
        <textarea
          className="input"
          rows={12}
          placeholder='Esempio: "pets":[{...}],"equipment":[{...}],...  (anche senza graffe)'
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
        />
      </div>

      {error && <div className="err small" style={{ margin: '10px 0' }}>{error}</div>}

      <div className="grid1" style={{ marginTop: 8 }}>
        {rows.length === 0 ? (
          <div className="muted small">Nessun upgrade da mostrare (oppure servono ID→Nome per buildings/traps).</div>
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
        h1 { font-size:22px; margin:0 0 12px; }
        .panel { background:#0f0f0f; border:1px solid #1f1f1f; border-radius:12px; padding:16px; margin-top:8px; }
        .muted { color:#9ca3af; }
        .small { font-size:12px; }
        .grid1 { display:grid; gap:10px; grid-template-columns:1fr; }
        .item { display:grid; gap:8px; grid-template-columns:1fr 1fr 1fr; background:#121212; border:1px solid #242424; padding:12px; border-radius:12px; }
        .k { font-weight:600; }
        .input { width:100%; background:#0a0a0a; border:1px solid #2c2c2c; border-radius:8px; padding:10px; color:#e5e5e5; }
        textarea.input { min-height: 230px; line-height: 1.3; }
        .err { color:#fca5a5; }
      `}</style>
    </div>
  );
}
