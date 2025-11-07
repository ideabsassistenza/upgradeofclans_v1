'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * Upgrade Planner – Villaggio Principale (TH10→TH17)
 * ✔ JSON incollato (anche frammenti heroes2/buildings2/traps2/…)
 * ✔ Rilevamento TH: esplicito → Municipio (data=1000001) → weapon → fallback pets=14
 * ✔ ESCLUDE completamente:
 *    – Equipaggiamenti degli eroi
 *    – Base del Costruttore (builder base) e relative voci
 * ✔ Copertura larga ID → Nomi ITA (Eroi, Pet, Difese, Trappole, Risorse, Armata)
 * ✔ Caps per TH10..TH17 per tutte le voci principali del Villaggio Principale
 * ✔ Profili FARM / WAR per ordinamento
 */

function tolerantParse(raw: string): any {
  let t = (raw || '').trim();
  if (!t) return {};
  if (t.startsWith('{') || t.startsWith('[')) {
    try { return JSON.parse(t); } catch {}
  } else {
    t = '{' + t + '}';
  }
  t = t.replace(/,(\s*[}\]])/g, '$1');
  const bal = (s: string, o: string, c: string) =>
    (s.match(new RegExp('\\' + o, 'g')) || []).length - (s.match(new RegExp('\\' + c, 'g')) || []).length;
  let d = bal(t, '{', '}'); if (d > 0) t += '}'.repeat(d); else if (d < 0) t = t.slice(0, d);
  d = bal(t, '[', ']');     if (d > 0) t += ']'.repeat(d); else if (d < 0) t = t.slice(0, d);
  try { return JSON.parse(t); } catch { return {}; }
}

function deepFindNumber(obj: any, keys: string[]): number | undefined {
  try {
    const st = [obj];
    while (st.length) {
      const cur = st.pop();
      if (!cur || typeof cur !== 'object') continue;
      for (const k of keys) {
        if (Object.prototype.hasOwnProperty.call(cur, k)) {
          const v = (cur as any)[k];
          if (typeof v === 'number') return v;
        }
      }
      for (const v of Object.values(cur)) if (v && typeof v === 'object') st.push(v);
    }
  } catch {}
  return undefined;
}

/** TH detection: explicit → TownHall entry (data=1000001) → weapon on TH → pets fallback */
function detectTH(json: any): number | undefined {
  const explicit = deepFindNumber(json, ['townHallLevel', 'th', 'thLevel', 'town_hall']);
  if (explicit && explicit >= 1 && explicit <= 20) return explicit;

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

/** Filtri esclusione (equip eroi, builder base) */
function isBuilderBaseId(id: number): boolean {
  // Builder Base ID tendono a vivere in namespace separati (non affidabile al 100%),
  // ma il nostro input tipico (heroes2/buildings2/…) è del Villaggio Principale.
  // Se arrivano voci esplicite di builder base, scartale qui aggiungendo i loro id.
  // Per sicurezza, escludiamo categorie non presenti nel nostro IDMAP (default).
  return false;
}

/** Dizionario ID → Nome ITA + categoria */
type Cat = 'hero'|'pet'|'defense'|'trap'|'resource'|'army'|'townhall'|'other';
type Meta = { name: string; cat: Cat };

const IDMAP: Record<number, Meta> = {
  // --- EROI ---
  28000000: { name: 'Re Barbaro', cat: 'hero' },
  28000001: { name: 'Regina degli Arcieri', cat: 'hero' },
  28000002: { name: 'Gran Sorvegliante', cat: 'hero' },
  28000004: { name: 'Campionessa Reale', cat: 'hero' },

  // --- PET (HV) ---
  73000000: { name: 'L.A.S.S.I', cat: 'pet' },
  73000001: { name: 'Gufo Elettrico', cat: 'pet' },
  73000002: { name: 'Yak Potente', cat: 'pet' },
  73000003: { name: 'Unicorno', cat: 'pet' },

  // --- MUNICIPIO ---
  1000001: { name: 'Municipio (Giga)', cat: 'townhall' },

  // --- DIFESE CLASSICHE ---
  1000008: { name: 'Cannone', cat: 'defense' },
  1000009: { name: 'Torre degli Arcieri', cat: 'defense' },
  1000011: { name: 'Torre dello Stregone', cat: 'defense' },
  1000012: { name: 'Difesa Aerea', cat: 'defense' },
  1000013: { name: 'Mortaio', cat: 'defense' },
  1000019: { name: 'Tesla Nascosta', cat: 'defense' },
  1000021: { name: 'Balestra', cat: 'defense' },
  1000027: { name: 'Torre Infernale', cat: 'defense' },
  1000028: { name: 'Spingiaria Aerea', cat: 'defense' }, // Air Sweeper
  1000031: { name: 'Artiglieria Aquila', cat: 'defense' },
  1000032: { name: 'Torre delle Bombe', cat: 'defense' },
  1000067: { name: 'Lanciascaglie', cat: 'defense' }, // Scattershot
  1000072: { name: 'Torre degli Incantesimi', cat: 'defense' }, // Spell Tower
  1000077: { name: 'Monolite', cat: 'defense' },
  1000084: { name: 'Torre Multi-Arceri', cat: 'defense' },
  1000085: { name: 'Cannone Rimbalzo', cat: 'defense' },
  1000079: { name: 'Torre Multi-Ingranaggi', cat: 'defense' },
  1000089: { name: 'Sputafuoco', cat: 'defense' },

  // --- MURI ---
  1000010: { name: 'Muro', cat: 'defense' },

  // --- TRAPPOLE ---
  12000000: { name: 'Bomba', cat: 'trap' },
  12000001: { name: 'Trappola a Molla', cat: 'trap' },
  12000002: { name: 'Bomba Gigante', cat: 'trap' },
  12000005: { name: 'Bomba Aerea', cat: 'trap' },
  12000006: { name: 'Mina Aerea a Ricerca', cat: 'trap' },
  12000008: { name: 'Trappola Scheletrica', cat: 'trap' },
  12000016: { name: 'Trappola Tornado', cat: 'trap' },
  12000020: { name: 'Giga Bomba', cat: 'trap' }, // parte del TH 17

  // --- RISORSE ---
  1000002: { name: "Estrattore d'Elisir", cat: 'resource' },
  1000003: { name: "Deposito d'Elisir", cat: 'resource' },
  1000004: { name: "Miniera d'Oro", cat: 'resource' },
  1000005: { name: "Deposito d'Oro", cat: 'resource' },
  1000023: { name: "Trivella d'Elisir Nero", cat: 'resource' },
  1000024: { name: "Deposito d'Elisir Nero", cat: 'resource' },

  // --- ARMATA / LAB / CLAN / OFFICINA / PET HOUSE / FUCINA ---
  1000000: { name: 'Campo d’Addestramento', cat: 'army' },
  1000006: { name: 'Caserma', cat: 'army' },
  1000026: { name: 'Caserma Nera', cat: 'army' },
  1000007: { name: 'Laboratorio', cat: 'army' },
  1000020: { name: 'Fabbrica degli Incantesimi', cat: 'army' },
  1000029: { name: 'Fabbrica degli Incantesimi Oscuri', cat: 'army' },
  1000014: { name: 'Castello del Clan', cat: 'army' },
  1000059: { name: 'Officina d’Assedio', cat: 'army' },
  1000068: { name: 'Casa degli Animali', cat: 'army' }, // pet house
  1000070: { name: 'Fucina', cat: 'army' },
  1000040: { name: 'Accampamento 5° Slot (se presente)', cat: 'army' }, // placeholder se appare nei dump
};

/** CAPS – livelli massimi per TH10..TH17 (Villaggio Principale) */
type Caps = Record<string, number>;
const CAPS: Record<number, Caps> = {
  // TH10
  10: {
    // Eroi
    'Re Barbaro': 40, 'Regina degli Arcieri': 40, 'Gran Sorvegliante': 0, 'Campionessa Reale': 0,
    // Difese
    'Cannone': 13, 'Torre degli Arcieri': 13, 'Muro': 11, 'Mortaio': 8, 'Torre dello Stregone': 9,
    'Difesa Aerea': 8, 'Tesla Nascosta': 8, 'Balestra': 4, 'Torre Infernale': 3, 'Spingiaria Aerea': 5,
    'Torre delle Bombe': 5, 'Artiglieria Aquila': 0, 'Lanciascaglie': 0, 'Torre degli Incantesimi': 0,
    'Monolite': 0, 'Torre Multi-Arceri': 0, 'Cannone Rimbalzo': 0, 'Torre Multi-Ingranaggi': 0, 'Sputafuoco': 0,
    // Trappole
    'Bomba': 7, 'Trappola a Molla': 5, 'Bomba Gigante': 4, 'Bomba Aerea': 4, 'Mina Aerea a Ricerca': 3,
    'Trappola Scheletrica': 4, 'Trappola Tornado': 0, 'Giga Bomba': 0,
    // Risorse
    "Miniera d'Oro": 13, "Deposito d'Oro": 11, "Estrattore d'Elisir": 13, "Deposito d'Elisir": 11,
    "Trivella d'Elisir Nero": 6, "Deposito d'Elisir Nero": 6,
    // Armata
    'Campo d’Addestramento': 8, 'Caserma': 12, 'Caserma Nera': 8, 'Laboratorio': 8,
    'Fabbrica degli Incantesimi': 5, 'Fabbrica degli Incantesimi Oscuri': 4, 'Castello del Clan': 6,
    'Officina d’Assedio': 2, 'Casa degli Animali': 0, 'Fucina': 0,
    // Municipio (giga)
    'Municipio (Giga)': 0
  },
  // TH11
  11: {
    'Re Barbaro': 50, 'Regina degli Arcieri': 50, 'Gran Sorvegliante': 20, 'Campionessa Reale': 0,
    'Cannone': 15, 'Torre degli Arcieri': 15, 'Muro': 12, 'Mortaio': 11, 'Torre dello Stregone': 10,
    'Difesa Aerea': 9, 'Tesla Nascosta': 9, 'Balestra': 5, 'Torre Infernale': 5, 'Spingiaria Aerea': 6,
    'Torre delle Bombe': 6, 'Artiglieria Aquila': 2, 'Lanciascaglie': 0, 'Torre degli Incantesimi': 0,
    'Monolite': 0, 'Torre Multi-Arceri': 0, 'Cannone Rimbalzo': 0, 'Torre Multi-Ingranaggi': 0, 'Sputafuoco': 0,
    'Bomba': 8, 'Trappola a Molla': 6, 'Bomba Gigante': 5, 'Bomba Aerea': 5, 'Mina Aerea a Ricerca': 3,
    'Trappola Scheletrica': 4, 'Trappola Tornado': 2, 'Giga Bomba': 0,
    "Miniera d'Oro": 14, "Deposito d'Oro": 12, "Estrattore d'Elisir": 14, "Deposito d'Elisir": 12,
    "Trivella d'Elisir Nero": 7, "Deposito d'Elisir Nero": 7,
    'Campo d’Addestramento': 8, 'Caserma': 13, 'Caserma Nera': 9, 'Laboratorio': 9,
    'Fabbrica degli Incantesimi': 6, 'Fabbrica degli Incantesimi Oscuri': 5, 'Castello del Clan': 7,
    'Officina d’Assedio': 3, 'Casa degli Animali': 0, 'Fucina': 0, 'Municipio (Giga)': 0
  },
  // TH12
  12: {
    'Re Barbaro': 65, 'Regina degli Arcieri': 65, 'Gran Sorvegliante': 40, 'Campionessa Reale': 0,
    'Cannone': 17, 'Torre degli Arcieri': 17, 'Muro': 14, 'Mortaio': 12, 'Torre dello Stregone': 11,
    'Difesa Aerea': 10, 'Tesla Nascosta': 10, 'Balestra': 6, 'Torre Infernale': 6, 'Spingiaria Aerea': 7,
    'Torre delle Bombe': 7, 'Artiglieria Aquila': 3, 'Lanciascaglie': 0, 'Torre degli Incantesimi': 0,
    'Monolite': 0, 'Torre Multi-Arceri': 0, 'Cannone Rimbalzo': 0, 'Torre Multi-Ingranaggi': 0, 'Sputafuoco': 0,
    'Bomba': 8, 'Trappola a Molla': 7, 'Bomba Gigante': 5, 'Bomba Aerea': 6, 'Mina Aerea a Ricerca': 3,
    'Trappola Scheletrica': 4, 'Trappola Tornado': 3, 'Giga Bomba': 0,
    "Miniera d'Oro": 14, "Deposito d'Oro": 13, "Estrattore d'Elisir": 14, "Deposito d'Elisir": 13,
    "Trivella d'Elisir Nero": 8, "Deposito d'Elisir Nero": 8,
    'Campo d’Addestramento': 8, 'Caserma': 14, 'Caserma Nera': 10, 'Laboratorio': 10,
    'Fabbrica degli Incantesimi': 6, 'Fabbrica degli Incantesimi Oscuri': 5, 'Castello del Clan': 8,
    'Officina d’Assedio': 4, 'Casa degli Animali': 0, 'Fucina': 0, 'Municipio (Giga)': 5
  },
  // TH13
  13: {
    'Re Barbaro': 75, 'Regina degli Arcieri': 75, 'Gran Sorvegliante': 50, 'Campionessa Reale': 25,
    'Cannone': 19, 'Torre degli Arcieri': 19, 'Muro': 14, 'Mortaio': 13, 'Torre dello Stregone': 13,
    'Difesa Aerea': 11, 'Tesla Nascosta': 12, 'Balestra': 8, 'Torre Infernale': 7, 'Spingiaria Aerea': 7,
    'Torre delle Bombe': 8, 'Artiglieria Aquila': 4, 'Lanciascaglie': 2, 'Torre degli Incantesimi': 0,
    'Monolite': 0, 'Torre Multi-Arceri': 0, 'Cannone Rimbalzo': 0, 'Torre Multi-Ingranaggi': 0, 'Sputafuoco': 0,
    'Bomba': 9, 'Trappola a Molla': 8, 'Bomba Gigante': 7, 'Bomba Aerea': 8, 'Mina Aerea a Ricerca': 4,
    'Trappola Scheletrica': 4, 'Trappola Tornado': 3, 'Giga Bomba': 0,
    "Miniera d'Oro": 15, "Deposito d'Oro": 14, "Estrattore d'Elisir": 15, "Deposito d'Elisir": 14,
    "Trivella d'Elisir Nero": 8, "Deposito d'Elisir Nero": 8,
    'Campo d’Addestramento': 9, 'Caserma': 15, 'Caserma Nera': 11, 'Laboratorio': 11,
    'Fabbrica degli Incantesimi': 7, 'Fabbrica degli Incantesimi Oscuri': 5, 'Castello del Clan': 9,
    'Officina d’Assedio': 5, 'Casa degli Animali': 0, 'Fucina': 0, 'Municipio (Giga)': 5
  },
  // TH14
  14: {
    'Re Barbaro': 85, 'Regina degli Arcieri': 85, 'Gran Sorvegliante': 60, 'Campionessa Reale': 30,
    'Cannone': 20, 'Torre degli Arcieri': 20, 'Muro': 15, 'Mortaio': 14, 'Torre dello Stregone': 14,
    'Difesa Aerea': 12, 'Tesla Nascosta': 13, 'Balestra': 9, 'Torre Infernale': 8, 'Spingiaria Aerea': 7,
    'Torre delle Bombe': 9, 'Artiglieria Aquila': 5, 'Lanciascaglie': 3,
    'Torre degli Incantesimi': 0, 'Monolite': 0, 'Torre Multi-Arceri': 0, 'Cannone Rimbalzo': 0,
    'Torre Multi-Ingranaggi': 0, 'Sputafuoco': 0,
    'Bomba': 10, 'Trappola a Molla': 9, 'Bomba Gigante': 8, 'Bomba Aerea': 9, 'Mina Aerea a Ricerca': 4,
    'Trappola Scheletrica': 4, 'Trappola Tornado': 3, 'Giga Bomba': 0,
    "Miniera d'Oro": 16, "Deposito d'Oro": 15, "Estrattore d'Elisir": 16, "Deposito d'Elisir": 15,
    "Trivella d'Elisir Nero": 9, "Deposito d'Elisir Nero": 9,
    'Campo d’Addestramento': 10, 'Caserma': 16, 'Caserma Nera': 12, 'Laboratorio': 12,
    'Fabbrica degli Incantesimi': 8, 'Fabbrica degli Incantesimi Oscuri': 6, 'Castello del Clan': 10,
    'Officina d’Assedio': 6, 'Casa degli Animali': 4, 'Fucina': 7, 'Municipio (Giga)': 5
  },
  // TH15
  15: {
    'Re Barbaro': 90, 'Regina degli Arcieri': 90, 'Gran Sorvegliante': 65, 'Campionessa Reale': 40,
    'Cannone': 21, 'Torre degli Arcieri': 21, 'Muro': 16, 'Mortaio': 15, 'Torre dello Stregone': 15,
    'Difesa Aerea': 13, 'Tesla Nascosta': 14, 'Balestra': 10, 'Torre Infernale': 9, 'Spingiaria Aerea': 8,
    'Torre delle Bombe': 10, 'Artiglieria Aquila': 6, 'Lanciascaglie': 4,
    'Torre degli Incantesimi': 3, 'Monolite': 2,
    'Torre Multi-Arceri': 0, 'Cannone Rimbalzo': 0, 'Torre Multi-Ingranaggi': 0, 'Sputafuoco': 0,
    'Bomba': 11, 'Trappola a Molla': 10, 'Bomba Gigante': 9, 'Bomba Aerea': 10, 'Mina Aerea a Ricerca': 5,
    'Trappola Scheletrica': 5, 'Trappola Tornado': 4, 'Giga Bomba': 0,
    "Miniera d'Oro": 16, "Deposito d'Oro": 16, "Estrattore d'Elisir": 16, "Deposito d'Elisir": 16,
    "Trivella d'Elisir Nero": 10, "Deposito d'Elisir Nero": 10,
    'Campo d’Addestramento': 12, 'Caserma': 17, 'Caserma Nera': 12, 'Laboratorio': 13,
    'Fabbrica degli Incantesimi': 8, 'Fabbrica degli Incantesimi Oscuri': 7, 'Castello del Clan': 11,
    'Officina d’Assedio': 7, 'Casa degli Animali': 8, 'Fucina': 8, 'Municipio (Giga)': 5
  },
  // TH16
  16: {
    'Re Barbaro': 95, 'Regina degli Arcieri': 95, 'Gran Sorvegliante': 70, 'Campionessa Reale': 45,
    'Cannone': 22, 'Torre degli Arcieri': 22, 'Muro': 17, 'Mortaio': 16, 'Torre dello Stregone': 16,
    'Difesa Aerea': 14, 'Tesla Nascosta': 15, 'Balestra': 11, 'Torre Infernale': 10, 'Spingiaria Aerea': 8,
    'Torre delle Bombe': 11, 'Artiglieria Aquila': 6, 'Lanciascaglie': 4,
    'Torre degli Incantesimi': 4, 'Monolite': 3,
    'Torre Multi-Arceri': 2, 'Cannone Rimbalzo': 2, 'Torre Multi-Ingranaggi': 2, 'Sputafuoco': 2,
    'Bomba': 12, 'Trappola a Molla': 10, 'Bomba Gigante': 10, 'Bomba Aerea': 11, 'Mina Aerea a Ricerca': 6,
    'Trappola Scheletrica': 5, 'Trappola Tornado': 4, 'Giga Bomba': 0,
    "Miniera d'Oro": 16, "Deposito d'Oro": 17, "Estrattore d'Elisir": 16, "Deposito d'Elisir": 17,
    "Trivella d'Elisir Nero": 10, "Deposito d'Elisir Nero": 11,
    'Campo d’Addestramento': 12, 'Caserma': 18, 'Caserma Nera': 12, 'Laboratorio': 14,
    'Fabbrica degli Incantesimi': 8, 'Fabbrica degli Incantesimi Oscuri': 7, 'Castello del Clan': 12,
    'Officina d’Assedio': 8, 'Casa degli Animali': 10, 'Fucina': 9, 'Municipio (Giga)': 5
  },
  // TH17
  17: {
    'Re Barbaro': 100, 'Regina degli Arcieri': 100, 'Gran Sorvegliante': 75, 'Campionessa Reale': 50,
    'Cannone': 23, 'Torre degli Arcieri': 23, 'Muro': 18, 'Mortaio': 17, 'Torre dello Stregone': 17,
    'Difesa Aerea': 15, 'Tesla Nascosta': 16, 'Balestra': 12, 'Torre Infernale': 11, 'Spingiaria Aerea': 8,
    'Torre delle Bombe': 12, 'Artiglieria Aquila': 7, 'Lanciascaglie': 5,
    'Torre degli Incantesimi': 5, 'Monolite': 4,
    'Torre Multi-Arceri': 3, 'Cannone Rimbalzo': 3, 'Torre Multi-Ingranaggi': 3, 'Sputafuoco': 3,
    'Bomba': 13, 'Trappola a Molla': 11, 'Bomba Gigante': 11, 'Bomba Aerea': 12, 'Mina Aerea a Ricerca': 7,
    'Trappola Scheletrica': 5, 'Trappola Tornado': 5, 'Giga Bomba': 5,
    "Miniera d'Oro": 17, "Deposito d'Oro": 18, "Estrattore d'Elisir": 17, "Deposito d'Elisir": 18,
    "Trivella d'Elisir Nero": 10, "Deposito d'Elisir Nero": 12,
    'Campo d’Addestramento': 12, 'Caserma': 18, 'Caserma Nera': 12, 'Laboratorio': 15,
    'Fabbrica degli Incantesimi': 8, 'Fabbrica degli Incantesimi Oscuri': 7, 'Castello del Clan': 12,
    'Officina d’Assedio': 8, 'Casa degli Animali': 10, 'Fucina': 10, 'Municipio (Giga)': 5
  }
};

// Priorità semplici per ordinare l’elenco
const FARM_ORDER = [
  'Laboratorio','Castello del Clan','Casa degli Animali','Fucina',
  'Re Barbaro','Regina degli Arcieri','Gran Sorvegliante','Campionessa Reale',
  'Capanna del Costruttore','Balestra','Difesa Aerea','Torre dello Stregone','Torre delle Bombe','Tesla Nascosta',
  'Torre degli Arcieri','Cannone','Muro','Spingiaria Aerea','Mortaio'
];
const WAR_ORDER = [
  'Municipio','Artiglieria Aquila','Lanciascaglie','Torre Infernale','Balestra','Tesla Nascosta',
  'Re Barbaro','Regina degli Arcieri','Gran Sorvegliante','Campionessa Reale',
  'Castello del Clan','Capanna del Costruttore','Difesa Aerea','Torre dello Stregone','Muro'
];

type Row = { name: string; have: number; max: number; };

export default function Page() {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'FARM'|'WAR'>('FARM');
  const [th, setTH] = useState<number>();
  const [rows, setRows] = useState<Row[]>([]);

  const timer = useRef<any>(null);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => analyze(text), 200);
    return () => clearTimeout(timer.current);
  }, [text, mode]);

  function analyze(raw: string) {
    const json = tolerantParse(raw);
    const thv = detectTH(json);
    setTH(thv);

    const entries: any[] = []
      .concat(Array.isArray(json.buildings2) ? json.buildings2 : [])
      .concat(Array.isArray(json.buildings)  ? json.buildings  : [])
      .concat(Array.isArray(json.heroes2)    ? json.heroes2    : [])
      .concat(Array.isArray(json.heroes)     ? json.heroes     : [])
      .concat(Array.isArray(json.traps2)     ? json.traps2     : [])
      .concat(Array.isArray(json.pets)       ? json.pets       : []);

    const caps = (thv && CAPS[thv]) ? CAPS[thv] : {};
    const out: Row[] = [];

    for (const it of entries) {
      const id = Number(it?.data);
      const lvl = Number(it?.lvl ?? 0);
      if (!id || Number.isNaN(lvl)) continue;

      // escludi builder base/equip (non presenti nel nostro IDMAP) → skip
      if (isBuilderBaseId(id)) continue;

      const meta = IDMAP[id];
      if (!meta) continue;

      const name = meta.name;
      const max = typeof caps[name] === 'number' ? caps[name] : 0;
      if (max > 0 && lvl < max) {
        out.push({ name, have: lvl, max });
      }
    }

    const order = mode === 'WAR' ? WAR_ORDER : FARM_ORDER;
    const rank = (n: string) => {
      if (['Re Barbaro','Regina degli Arcieri','Gran Sorvegliante','Campionessa Reale'].includes(n)) {
        const i = order.indexOf('Re Barbaro'); // collassa nel primo eroe
        return i === -1 ? 50 : i;
      }
      const i = order.findIndex(x => n.toLowerCase().includes(x.toLowerCase()));
      return i === -1 ? 999 : i;
    };

    out.sort((a,b) => {
      const ra = rank(a.name), rb = rank(b.name);
      if (ra !== rb) return ra - rb;
      const da = a.max - a.have, db = b.max - b.have;
      if (db !== da) return db - da;
      return a.name.localeCompare(b.name,'it');
    });

    setRows(out);
  }

  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: 20 }}>
      <h1>CoC – Piano Upgrade {th ? `(TH${th})` : ''}</h1>
      <p style={{color:'#9ca3af', marginTop: 0}}>Incolla l’export del villaggio (HV). Equip eroi e Base del Costruttore sono esclusi.</p>

      <textarea
        value={text}
        onChange={(e)=>setText(e.target.value)}
        placeholder='Incolla qui il JSON ("buildings2", "heroes2", "traps2", "pets"… )'
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
          <div style={{color:'#9ca3af'}}>Nessun upgrade da mostrare (o JSON non contiene voci HV riconosciute).</div>
        )}
      </div>
    </main>
  );
}
