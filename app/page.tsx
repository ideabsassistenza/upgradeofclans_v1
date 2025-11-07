'use client';

import React, { useEffect, useRef, useState } from 'react';

/** Upgrade Planner – FIX “lista vuota”
 * - Parsing tollerante (anche frammenti tipo `"heroes2":[...]`)
 * - Rileva TH: campi espliciti → Municipio (data=1000001) → weapon → fallback pets=14
 * - ID→Nome ITA ampliato (difese + strutture chiave)
 * - Caps TH10→TH17 per le voci principali (eroi, difese chiave, laboratorio, castello)
 * - Mostra WAR/FARM
 */

function safeParse(text: string): any {
  let t = (text || '').trim();
  if (!t) return {};
  if (t.startsWith('{') || t.startsWith('[')) {
    try { return JSON.parse(t); } catch {}
  }
  // Consenti frammenti: es. `"heroes2":[{...}], "buildings2":[...]`
  if (!t.startsWith('{')) t = '{' + t + '}';
  // rimuovi virgole finali
  t = t.replace(/,(\s*[}\]])/g, '$1');
  // bilancia parentesi quadre/graffe
  const b = (s: string, o: string, c: string) =>
    (s.match(new RegExp('\\' + o, 'g')) || []).length - (s.match(new RegExp('\\' + c, 'g')) || []).length;
  let d = b(t, '{', '}'); if (d > 0) t += '}'.repeat(d); else if (d < 0) t = t.slice(0, d);
  d = b(t, '[', ']');     if (d > 0) t += ']'.repeat(d); else if (d < 0) t = t.slice(0, d);
  try { return JSON.parse(t); } catch { return {}; }
}

function deepFindNumber(obj: any, keys: string[]): number | undefined {
  try {
    const stack = [obj];
    while (stack.length) {
      const cur = stack.pop();
      if (!cur || typeof cur !== 'object') continue;
      for (const k of keys) {
        if (Object.prototype.hasOwnProperty.call(cur, k) && typeof (cur as any)[k] === 'number') {
          return Number((cur as any)[k]);
        }
      }
      for (const v of Object.values(cur)) if (v && typeof v === 'object') stack.push(v as any);
    }
  } catch {}
  return undefined;
}

function detectTH(json: any): number | undefined {
  const explicit = deepFindNumber(json, ['townHallLevel','th','thLevel','town_hall']);
  if (explicit && explicit >=1 && explicit <= 20) return explicit;

  const scanTownHall = (arr?: any[]) => {
    if (!Array.isArray(arr)) return;
    for (const it of arr) {
      if (it && Number(it.data) === 1000001 && typeof it.lvl === 'number') {
        const th = Number(it.lvl);
        if (th >= 1 && th <= 20) return th;
      }
    }
  };
  const thFromTH = scanTownHall(json.buildings) ?? scanTownHall(json.buildings2);
  if (thFromTH) return thFromTH;

  const scanWeapon = (arr?: any[]) => {
    if (!Array.isArray(arr)) return;
    for (const it of arr) {
      if (it && 'weapon' in it && typeof it.lvl === 'number') {
        const th = Number(it.lvl);
        if (th >= 1 && th <= 20) return th;
      }
    }
  };
  const thFromWeapon = scanWeapon(json.buildings) ?? scanWeapon(json.buildings2);
  if (thFromWeapon) return thFromWeapon;

  if (Array.isArray(json.pets) && json.pets.length) return 14;
  return undefined;
}

// ---- ID → Nome ITA (copre le voci principali che vogliamo mostrare) ----
const ID2NAME: Record<number, string> = {
  // Eroi
  28000000: 'Re Barbaro',
  28000001: 'Regina degli Arcieri',
  28000002: 'Gran Sorvegliante',
  28000004: 'Campionessa Reale',

  // Muri
  1000010: 'Muro',

  // Difese “classiche”
  1000008: 'Cannone',
  1000009: 'Torre degli Arcieri',
  1000011: 'Torre dello Stregone',
  1000012: 'Difesa Aerea',
  1000013: 'Mortaio',
  1000019: 'Tesla Nascosta',
  1000021: 'Balestra',
  1000027: 'Torre Infernale',
  1000028: 'Spingiaria Aerea',
  1000032: 'Torre delle Bombe',
  1000031: 'Artiglieria Aquila',
  1000067: 'Lanciascaglie',
  1000072: 'Torre degli Incantesimi',
  1000077: 'Monolite',
  1000084: 'Torre Multi-Arceri',
  1000085: 'Cannone Rimbalzo',
  1000079: 'Torre Multi-Ingranaggi',
  1000089: 'Sputafuoco',

  // Strutture chiave extra
  1000014: 'Castello del Clan',
  1000007: 'Laboratorio',
  1000015: 'Capanna del Costruttore',

  // Municipio
  1000001: 'Municipio (Giga)',
};

// ---- Caps TH10 → TH17 (solo le voci elencate sopra) ----
type Caps = Record<string, number>;
const CAPS: Record<number, Caps> = {
  10: {
    'Re Barbaro': 40, 'Regina degli Arcieri': 40, 'Gran Sorvegliante': 0, 'Campionessa Reale': 0,
    'Cannone': 13, 'Torre degli Arcieri': 13, 'Torre dello Stregone': 9, 'Difesa Aerea': 8, 'Mortaio': 8,
    'Tesla Nascosta': 8, 'Balestra': 4, 'Torre Infernale': 3, 'Spingiaria Aerea': 5, 'Torre delle Bombe': 5,
    'Muro': 11, 'Castello del Clan': 6, 'Laboratorio': 8,
    'Artiglieria Aquila': 0, 'Lanciascaglie': 0,'Torre degli Incantesimi': 0,'Monolite': 0,'Torre Multi-Arceri': 0,'Cannone Rimbalzo': 0,'Torre Multi-Ingranaggi': 0,'Sputafuoco': 0,'Capanna del Costruttore': 0,'Municipio (Giga)': 0
  },
  11: {
    'Re Barbaro': 50, 'Regina degli Arcieri': 50, 'Gran Sorvegliante': 20, 'Campionessa Reale': 0,
    'Cannone': 15, 'Torre degli Arcieri': 15, 'Torre dello Stregone': 10, 'Difesa Aerea': 9, 'Mortaio': 11,
    'Tesla Nascosta': 9, 'Balestra': 5, 'Torre Infernale': 5, 'Spingiaria Aerea': 6, 'Torre delle Bombe': 6,
    'Muro': 12, 'Castello del Clan': 7, 'Laboratorio': 9,
    'Artiglieria Aquila': 2, 'Lanciascaglie': 0,'Torre degli Incantesimi': 0,'Monolite': 0,'Torre Multi-Arceri': 0,'Cannone Rimbalzo': 0,'Torre Multi-Ingranaggi': 0,'Sputafuoco': 0,'Capanna del Costruttore': 0,'Municipio (Giga)': 0
  },
  12: {
    'Re Barbaro': 65, 'Regina degli Arcieri': 65, 'Gran Sorvegliante': 40, 'Campionessa Reale': 0,
    'Cannone': 17, 'Torre degli Arcieri': 17, 'Torre dello Stregone': 11, 'Difesa Aerea': 10, 'Mortaio': 12,
    'Tesla Nascosta': 10, 'Balestra': 6, 'Torre Infernale': 6, 'Spingiaria Aerea': 7, 'Torre delle Bombe': 7,
    'Muro': 13, 'Castello del Clan': 8, 'Laboratorio': 10,
    'Artiglieria Aquila': 3, 'Lanciascaglie': 0,'Torre degli Incantesimi': 0,'Monolite': 0,'Torre Multi-Arceri': 0,'Cannone Rimbalzo': 0,'Torre Multi-Ingranaggi': 0,'Sputafuoco': 0,'Capanna del Costruttore': 0,'Municipio (Giga)': 5
  },
  13: {
    'Re Barbaro': 75, 'Regina degli Arcieri': 75, 'Gran Sorvegliante': 50, 'Campionessa Reale': 25,
    'Cannone': 19, 'Torre degli Arcieri': 19, 'Torre dello Stregone': 13, 'Difesa Aerea': 11, 'Mortaio': 13,
    'Tesla Nascosta': 12, 'Balestra': 8, 'Torre Infernale': 7, 'Spingiaria Aerea': 7, 'Torre delle Bombe': 8,
    'Muro': 14, 'Castello del Clan': 9, 'Laboratorio': 11,
    'Artiglieria Aquila': 4, 'Lanciascaglie': 2,'Torre degli Incantesimi': 0,'Monolite': 0,'Torre Multi-Arceri': 0,'Cannone Rimbalzo': 0,'Torre Multi-Ingranaggi': 0,'Sputafuoco': 0,'Capanna del Costruttore': 0,'Municipio (Giga)': 5
  },
  14: {
    'Re Barbaro': 85, 'Regina degli Arcieri': 85, 'Gran Sorvegliante': 60, 'Campionessa Reale': 30,
    'Cannone': 20, 'Torre degli Arcieri': 20, 'Torre dello Stregone': 14, 'Difesa Aerea': 12, 'Mortaio': 14,
    'Tesla Nascosta': 13, 'Balestra': 9, 'Torre Infernale': 8, 'Spingiaria Aerea': 7, 'Torre delle Bombe': 9,
    'Muro': 15, 'Castello del Clan': 10, 'Laboratorio': 12,
    'Artiglieria Aquila': 5, 'Lanciascaglie': 3,'Torre degli Incantesimi': 0,'Monolite': 0,'Torre Multi-Arceri': 0,'Cannone Rimbalzo': 0,'Torre Multi-Ingranaggi': 0,'Sputafuoco': 0,'Capanna del Costruttore': 4,'Municipio (Giga)': 5
  },
  15: {
    'Re Barbaro': 90, 'Regina degli Arcieri': 90, 'Gran Sorvegliante': 65, 'Campionessa Reale': 40,
    'Cannone': 21, 'Torre degli Arcieri': 21, 'Torre dello Stregone': 15, 'Difesa Aerea': 13, 'Mortaio': 15,
    'Tesla Nascosta': 14, 'Balestra': 10, 'Torre Infernale': 9, 'Spingiaria Aerea': 8, 'Torre delle Bombe': 10,
    'Muro': 16, 'Castello del Clan': 11, 'Laboratorio': 13,
    'Artiglieria Aquila': 6, 'Lanciascaglie': 4,'Torre degli Incantesimi': 3,'Monolite': 2,'Torre Multi-Arceri': 0,'Cannone Rimbalzo': 0,'Torre Multi-Ingranaggi': 0,'Sputafuoco': 0,'Capanna del Costruttore': 5,'Municipio (Giga)': 5
  },
  16: {
    'Re Barbaro': 95, 'Regina degli Arcieri': 95, 'Gran Sorvegliante': 70, 'Campionessa Reale': 45,
    'Cannone': 22, 'Torre degli Arcieri': 22, 'Torre dello Stregone': 16, 'Difesa Aerea': 14, 'Mortaio': 16,
    'Tesla Nascosta': 15, 'Balestra': 11, 'Torre Infernale': 10, 'Spingiaria Aerea': 8, 'Torre delle Bombe': 11,
    'Muro': 17, 'Castello del Clan': 12, 'Laboratorio': 14,
    'Artiglieria Aquila': 6, 'Lanciascaglie': 4,'Torre degli Incantesimi': 4,'Monolite': 3,'Torre Multi-Arceri': 2,'Cannone Rimbalzo': 2,'Torre Multi-Ingranaggi': 2,'Sputafuoco': 2,'Capanna del Costruttore': 5,'Municipio (Giga)': 5
  },
  17: {
    'Re Barbaro': 100, 'Regina degli Arcieri': 100, 'Gran Sorvegliante': 75, 'Campionessa Reale': 50,
    'Cannone': 23, 'Torre degli Arcieri': 23, 'Torre dello Stregone': 17, 'Difesa Aerea': 15, 'Mortaio': 17,
    'Tesla Nascosta': 16, 'Balestra': 12, 'Torre Infernale': 11, 'Spingiaria Aerea': 8, 'Torre delle Bombe': 12,
    'Muro': 18, 'Castello del Clan': 12, 'Laboratorio': 15,
    'Artiglieria Aquila': 7, 'Lanciascaglie': 5,'Torre degli Incantesimi': 5,'Monolite': 4,'Torre Multi-Arceri': 3,'Cannone Rimbalzo': 3,'Torre Multi-Ingranaggi': 3,'Sputafuoco': 3,'Capanna del Costruttore': 5,'Municipio (Giga)': 5
  },
};

// Ordine di priorità (semplice ma utile)
const FARM_ORDER = [
  'Laboratorio','Castello del Clan','Eroi','Capanna del Costruttore',
  'Balestra','Difesa Aerea','Torre dello Stregone','Torre delle Bombe','Torre degli Arcieri','Cannone','Muro'
];
const WAR_ORDER = [
  'Municipio','Artiglieria Aquila','Lanciascaglie','Torre Infernale','Balestra','Tesla Nascosta',
  'Eroi','Castello del Clan','Capanna del Costruttore','Difesa Aerea','Torre dello Stregone','Muro'
];

type Row = { name: string; have: number; max: number };

export default function Page() {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'FARM'|'WAR'>('FARM');
  const [th, setTH] = useState<number>();
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState('');

  const timer = useRef<any>(null);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => analyze(text), 200);
    return () => clearTimeout(timer.current);
  }, [text, mode]);

  function analyze(raw: string) {
    setErr('');
    const json = safeParse(raw);
    const thv = detectTH(json);
    setTH(thv);

    const entries: any[] = []
      .concat(Array.isArray(json.buildings2) ? json.buildings2 : [])
      .concat(Array.isArray(json.buildings)  ? json.buildings  : [])
      .concat(Array.isArray(json.heroes2)    ? json.heroes2    : [])
      .concat(Array.isArray(json.heroes)     ? json.heroes     : [])
      .concat(Array.isArray(json.traps2)     ? json.traps2     : [])
      .concat(Array.isArray(json.pets)       ? json.pets       : []); // i pets non hanno cap propri qui, ma non danno fastidio

    const caps = (thv && CAPS[thv]) ? CAPS[thv] : {};
    const out: Row[] = [];

    for (const it of entries) {
      const id = Number(it?.data);
      const lvl = Number(it?.lvl ?? 0);
      if (!id || Number.isNaN(lvl)) continue;

      const name = ID2NAME[id];
      if (!name) continue; // non mappato → non lo mostriamo

      const max = caps[name] ?? 0;
      if (max > 0 && lvl < max) {
        out.push({ name, have: lvl, max });
      }
    }

    const order = mode === 'WAR' ? WAR_ORDER : FARM_ORDER;
    out.sort((a, b) => {
      const ra = rank(a.name, order), rb = rank(b.name, order);
      if (ra !== rb) return ra - rb;
      const da = a.max - a.have, db = b.max - b.have; // più “indietro” prima
      if (db !== da) return db - da;
      return a.name.localeCompare(b.name,'it');
    });

    setRows(out);
  }

  function rank(name: string, order: string[]) {
    // euristica: “Eroi” raggruppa i 4 eroi
    if (['Re Barbaro','Regina degli Arcieri','Gran Sorvegliante','Campionessa Reale'].includes(name)) {
      const i = order.indexOf('Eroi');
      return i === -1 ? 999 : i;
    }
    for (let i=0;i<order.length;i++){
      if (name.includes(order[i])) return i;
    }
    return 999;
  }

  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: 20 }}>
      <h1>CoC – Piano Upgrade {th ? `(TH${th})` : ''}</h1>
      <p style={{color:'#9ca3af', marginTop: 0}}>Incolla l’export del villaggio (anche frammenti). Scegli profilo WAR/FARM.</p>

      <textarea
        value={text}
        onChange={(e)=>setText(e.target.value)}
        placeholder='Incolla qui il JSON ("buildings2", "heroes2", "traps2", …)'
        style={{width:'100%', minHeight:220, background:'#0a0a0a', color:'#e5e5e5', border:'1px solid #333', borderRadius:8, padding:10, fontFamily:'monospace'}}
      />

      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:8}}>
        <div>{th ? <>TH rilevato: <b>{th}</b></> : <span style={{color:'#f87171'}}>TH non rilevato</span>}</div>
        <div>
          <button onClick={()=>setMode('FARM')} style={{marginRight:6, padding:'6px 12px', borderRadius:8, border:'1px solid #555', background: mode==='FARM'?'#22c55e33':'transparent', color:'#e5e5e5'}}>FARM</button>
          <button onClick={()=>setMode('WAR')}  style={{padding:'6px 12px', borderRadius:8, border:'1px solid #555', background: mode==='WAR' ?'#22c55e33':'transparent', color:'#e5e5e5'}}>WAR</button>
        </div>
      </div>

      <div style={{marginTop:12, background:'#0f0f0f', border:'1px solid #222', borderRadius:12, padding:12}}>
        {rows.length ? (
          <ul style={{margin:0, paddingLeft:18, lineHeight:1.5}}>
            {rows.map((r,i)=>(
              <li key={i}>
                <b>{r.name}</b> — liv. {r.have} → <b>{r.max}</b>
              </li>
            ))}
          </ul>
        ) : (
          <div style={{color:'#9ca3af'}}>Nessun upgrade disponibile o JSON non riconosciuto dalle mappe.</div>
        )}
      </div>
    </main>
  );
}
