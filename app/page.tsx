'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * Upgrade Planner Clash of Clans – compatibile con Next.js 14
 * Funzionalità:
 *  • incolli il JSON (anche incompleto)
 *  • rileva TH da campo o dal Municipio (data=1000001)
 *  • mostra solo ciò che è migliorabile per il tuo TH
 *  • due profili: FARM o WAR
 */

function tryParse(s: string) {
  try { return JSON.parse(s); } catch { return null; }
}

function sanitizeToJSONObject(rawText: string): any {
  let t = (rawText || '').trim();
  if (!t.startsWith('{')) t = '{' + t + '}';
  t = t.replace(/,(\s*[}\]])/g, '$1');
  try { return JSON.parse(t); } catch { return {}; }
}

function deepFindNumber(obj: any, keys: string[]): number | undefined {
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
    for (const v of Object.values(cur)) if (v && typeof v === 'object') stack.push(v);
  }
  return undefined;
}

/** 🔍 Rilevamento TH (funziona anche con JSON TH10) */
function detectTH(json: any): number | undefined {
  const explicit = deepFindNumber(json, ['townHallLevel', 'th', 'thLevel']);
  if (explicit) return explicit;
  const scan = (a?: any[]) => {
    if (!Array.isArray(a)) return;
    for (const it of a)
      if (it && typeof it === 'object' && Number(it.data) === 1000001)
        return Number(it.lvl);
  };
  return scan(json.buildings2) || scan(json.buildings);
}

/** Mappa ID → nome in ITA */
const IDMAP: Record<number, string> = {
  28000000: 'Re Barbaro',
  28000001: 'Regina degli Arcieri',
  28000002: 'Gran Sorvegliante',
  28000004: 'Campionessa Reale',
  1000008: 'Cannone',
  1000009: 'Torre degli Arcieri',
  1000010: 'Muro',
  1000011: 'Torre dello Stregone',
  1000012: 'Difesa Aerea',
  1000013: 'Mortaio',
  1000019: 'Tesla Nascosta',
  1000021: 'Balestra',
  1000027: 'Torre Infernale',
  1000031: 'Artiglieria Aquila',
  1000067: 'Lanciascaglie',
  1000072: 'Torre degli Incantesimi',
  1000077: 'Monolite',
  1000084: 'Torre Multi-Arceri',
  1000085: 'Cannone Rimbalzo',
};

/** Livelli massimi principali per TH10-TH17 (semplificato, base reale) */
const CAPS: Record<number, Record<string, number>> = {
  10: { 'Re Barbaro': 40, 'Regina degli Arcieri': 40, 'Gran Sorvegliante': 0, 'Campionessa Reale': 0, 'Cannone': 13, 'Torre degli Arcieri': 13, 'Torre dello Stregone': 9, 'Difesa Aerea': 8, 'Tesla Nascosta': 8, 'Balestra': 4, 'Torre Infernale': 3, 'Muro': 11 },
  11: { 'Re Barbaro': 50, 'Regina degli Arcieri': 50, 'Gran Sorvegliante': 20, 'Cannone': 15, 'Torre degli Arcieri': 15, 'Balestra': 5, 'Torre Infernale': 5, 'Muro': 12 },
  12: { 'Re Barbaro': 65, 'Regina degli Arcieri': 65, 'Gran Sorvegliante': 40, 'Cannone': 17, 'Torre degli Arcieri': 17, 'Balestra': 6, 'Torre Infernale': 6, 'Muro': 13 },
  13: { 'Re Barbaro': 75, 'Regina degli Arcieri': 75, 'Gran Sorvegliante': 50, 'Campionessa Reale': 25, 'Cannone': 19, 'Torre degli Arcieri': 19, 'Balestra': 8, 'Torre Infernale': 7, 'Muro': 14 },
  14: { 'Re Barbaro': 85, 'Regina degli Arcieri': 85, 'Gran Sorvegliante': 60, 'Campionessa Reale': 30, 'Cannone': 20, 'Torre degli Arcieri': 20, 'Balestra': 9, 'Torre Infernale': 8, 'Muro': 15 },
  15: { 'Re Barbaro': 90, 'Regina degli Arcieri': 90, 'Gran Sorvegliante': 65, 'Campionessa Reale': 40, 'Cannone': 21, 'Torre degli Arcieri': 21, 'Balestra': 10, 'Torre Infernale': 9, 'Muro': 16 },
  16: { 'Re Barbaro': 95, 'Regina degli Arcieri': 95, 'Gran Sorvegliante': 70, 'Campionessa Reale': 45, 'Cannone': 22, 'Torre degli Arcieri': 22, 'Balestra': 11, 'Torre Infernale': 10, 'Muro': 17 },
  17: { 'Re Barbaro': 100, 'Regina degli Arcieri': 100, 'Gran Sorvegliante': 75, 'Campionessa Reale': 50, 'Cannone': 23, 'Torre degli Arcieri': 23, 'Balestra': 12, 'Torre Infernale': 11, 'Muro': 18 },
};

const FARM_ORDER = ['Laboratorio', 'Castello', 'Eroi', 'Cannone', 'Torre degli Arcieri', 'Muro'];
const WAR_ORDER = ['Municipio', 'Eroi', 'Balestra', 'Torre Infernale', 'Difesa', 'Torre dello Stregone'];

export default function Page() {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<{ name: string; lvl: number; max: number }[]>([]);
  const [th, setTH] = useState<number>();
  const [mode, setMode] = useState<'FARM' | 'WAR'>('FARM');
  const [error, setError] = useState('');

  const timer = useRef<any>();
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => analyze(text), 300);
    return () => clearTimeout(timer.current);
  }, [text, mode]);

  function analyze(raw: string) {
    setError('');
    if (!raw.trim()) { setRows([]); return; }
    const json = sanitizeToJSONObject(raw);
    const thv = detectTH(json);
    setTH(thv);

    const entries = (json.buildings2 || []).concat(json.heroes2 || []).concat(json.traps2 || []);
    const cap = thv ? CAPS[thv] || {} : {};
    const out: { name: string; lvl: number; max: number }[] = [];

    for (const e of entries) {
      const id = Number(e.data);
      const name = IDMAP[id];
      if (!name) continue;
      const lvl = e.lvl || 0;
      const max = cap[name] || 0;
      if (max > 0 && lvl < max) out.push({ name, lvl, max });
    }

    const order = mode === 'WAR' ? WAR_ORDER : FARM_ORDER;
    out.sort((a, b) => {
      const ia = order.findIndex(o => a.name.includes(o));
      const ib = order.findIndex(o => b.name.includes(o));
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });

    setRows(out);
  }

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: 20 }}>
      <h1>Upgrade Planner {th ? `(TH${th})` : ''}</h1>
      <textarea
        style={{
          width: '100%', minHeight: 200, background: '#0a0a0a', color: '#e5e5e5',
          border: '1px solid #333', borderRadius: 8, padding: 10, fontFamily: 'monospace'
        }}
        placeholder="Incolla qui il JSON del villaggio..."
        value={text}
        onChange={e => setText(e.target.value)}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
        <div>
          {th ? <>TH rilevato: <b>{th}</b></> : <span style={{ color: '#f87171' }}>TH non rilevato</span>}
        </div>
        <div>
          <button
            onClick={() => setMode('FARM')}
            style={{
              marginRight: 6, padding: '6px 14px', borderRadius: 8,
              border: '1px solid #555', background: mode === 'FARM' ? '#22c55e33' : 'transparent',
              color: '#e5e5e5', cursor: 'pointer'
            }}
          >FARM</button>
          <button
            onClick={() => setMode('WAR')}
            style={{
              padding: '6px 14px', borderRadius: 8,
              border: '1px solid #555', background: mode === 'WAR' ? '#22c55e33' : 'transparent',
              color: '#e5e5e5', cursor: 'pointer'
            }}
          >WAR</button>
        </div>
      </div>

      {error && <div style={{ color: '#f87171', marginTop: 8 }}>{error}</div>}

      <ul style={{ marginTop: 12, lineHeight: 1.5 }}>
        {rows.map((r, i) => (
          <li key={i}>
            <b>{r.name}</b> — livello {r.lvl} → <b>{r.max}</b>
          </li>
        ))}
        {!rows.length && !error && <div style={{ color: '#9ca3af', fontSize: 13, marginTop: 6 }}>Nessun upgrade disponibile o JSON vuoto.</div>}
      </ul>
    </main>
  );
}
