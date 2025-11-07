'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * CoC Upgrade Planner – COMPLETO (TH10→TH17, tutte le strutture, NO equip)
 * - Incolli export JSON (anche frammenti: heroes2, buildings2, traps2, pets)
 * - Rileva TH con priorità:
 *    1) campi espliciti (townHallLevel/th/thLevel)
 *    2) livello del Municipio nei buildings (data=1000001)
 *    3) “weapon” sul TH nei buildings
 *    4) fallback: se ci sono pets ⇒ TH14
 * - Nomi ITA + CAP completi per Eroi, Pets, Difese, Strutture, Trappole
 * - Pulsanti WAR / FARM per ordinare le priorità
 * - Mostra solo ciò che è upgradabile al TH corrente (cap>0 e lvl<cap)
 * - Nessun equipaggiamento Eroe gestito (richiesta esplicita)
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
      for (const v of Object.values(cur)) if (v && typeof v === 'object') stack.push(v as any);
    }
  } catch {}
  return undefined;
}

/** Rilevazione TH con sorgente per badge (explicit|townhall|weapon|pets|unknown) */
function detectTownHall(json: any): { th?: number; source: 'explicit'|'townhall'|'weapon'|'pets'|'unknown' } {
  // 1) campi espliciti
  const explicit = deepFindNumber(json, ['townHallLevel', 'town_hall', 'th', 'thLevel']);
  if (typeof explicit === 'number' && explicit >= 1 && explicit <= 20) {
    return { th: explicit, source: 'explicit' };
  }

  // 2) leggere il TH dal Municipio nei buildings/buildings2 (data=1000001)
  const scanTHFromTownHall = (arr: any[]) => {
    for (const it of arr) {
      if (it && typeof it === 'object' && Number((it as any).data) === 1000001 && typeof (it as any).lvl === 'number') {
        const th = Number((it as any).lvl);
        if (th >= 1 && th <= 20) return th;
      }
    }
    return undefined;
  };
  if (Array.isArray(json?.buildings)) {
    const th = scanTHFromTownHall(json.buildings);
    if (th) return { th, source: 'townhall' };
  }
  if (Array.isArray(json?.buildings2)) {
    const th = scanTHFromTownHall(json.buildings2);
    if (th) return { th, source: 'townhall' };
  }

  // 3) alcuni export mettono "weapon" sull'entry del TH: usalo se presente
  const scanWeapon = (arr: any[]) => {
    for (const it of arr) {
      if (it && typeof it === 'object' && ('weapon' in it) && typeof (it as any).lvl === 'number') {
        const th = Number((it as any).lvl);
        if (th >= 1 && th <= 20) return th;
      }
    }
    return undefined;
  };
  const thFromWeapon =
    (Array.isArray(json?.buildings) && scanWeapon(json.buildings)) ||
    (Array.isArray(json?.buildings2) && scanWeapon(json.buildings2));
  if (thFromWeapon) return { th: thFromWeapon, source: 'weapon' };

  // 4) fallback: presenza pets → TH14
  if (Array.isArray(json?.pets) && json.pets.length > 0) return { th: 14, source: 'pets' };

  return { th: undefined, source: 'unknown' };
}

/** ID → Nome ITA + categoria (NO equip) – include strutture TH15–17 */
const ID_NAME_MAP: Record<string, { name: string; cat: 'hero'|'pet'|'building'|'trap'|'resource' }> = {
  // EROI
  '28000000': { name: 'Re Barbaro', cat: 'hero' },
  '28000001': { name: 'Regina degli Arcieri', cat: 'hero' },
  '28000002': { name: 'Gran Sorvegliante', cat: 'hero' },
  '28000004': { name: 'Campionessa Reale', cat: 'hero' },

  // PETS classici (TH14+)
  '73000000': { name: 'L.A.S.S.I', cat: 'pet' },
  '73000001': { name: 'Gufo Elettrico', cat: 'pet' },
  '73000002': { name: 'Yak Potente', cat: 'pet' },
  '73000003': { name: 'Unicorno', cat: 'pet' },

  // DIFESE / STRUTTURE (classiche)
  '1000001': { name: 'Municipio (Giga)', cat: 'building' },
  '1000008': { name: 'Cannone', cat: 'building' },
  '1000009': { name: 'Torre degli Arcieri', cat: 'building' },
  '1000010': { name: 'Muro', cat: 'building' },
  '1000011': { name: 'Torre dello Stregone', cat: 'building' },
  '1000012': { name: 'Difesa Aerea', cat: 'building' },
  '1000013': { name: 'Mortaio', cat: 'building' },
  '1000014': { name: 'Castello del Clan', cat: 'resource' },
  '1000015': { name: 'Capanna del Costruttore', cat: 'building' },
  '1000019': { name: 'Tesla Nascosta', cat: 'building' },
  '1000020': { name: 'Fabbrica degli Incantesimi', cat: 'resource' },
  '1000021': { name: 'Balestra', cat: 'building' },
  '1000023': { name: "Trivella d'Elisir Nero", cat: 'resource' },
  '1000024': { name: "Deposito d'Elisir Nero", cat: 'resource' },
  '1000026': { name: 'Caserma Nera', cat: 'resource' },
  '1000027': { name: 'Torre Infernale', cat: 'building' },
  '1000028': { name: 'Spingiaria Aerea', cat: 'building' },
  '1000029': { name: 'Fabbrica degli Incantesimi Oscuri', cat: 'resource' },
  '1000031': { name: 'Artiglieria Aquila', cat: 'building' },
  '1000032': { name: 'Torre delle Bombe', cat: 'building' },
  '1000059': { name: 'Officina d’Assedio', cat: 'resource' },
  '1000067': { name: 'Lanciascaglie', cat: 'building' },
  '1000068': { name: 'Casa degli Animali', cat: 'resource' },
  '1000070': { name: 'Fucina', cat: 'resource' },
  '1000000': { name: 'Campo d’Addestramento', cat: 'resource' },
  '1000002': { name: "Estrattore d'Elisir", cat: 'resource' },
  '1000003': { name: "Deposito d'Elisir", cat: 'resource' },
  '1000004': { name: "Miniera d'Oro", cat: 'resource' },
  '1000005': { name: "Deposito d'Oro", cat: 'resource' },
  '1000006': { name: 'Caserma', cat: 'resource' },
  '1000007': { name: 'Laboratorio', cat: 'resource' },

  // DIFESE nuove TH15+ (incluse per TH16–TH17)
  '1000072': { name: 'Torre degli Incantesimi', cat: 'building' }, // TH15+
  '1000077': { name: 'Monolite', cat: 'building' },                // TH15+
  '1000084': { name: 'Torre Multi-Arceri', cat: 'building' },      // TH16+
  '1000085': { name: 'Cannone Rimbalzo', cat: 'building' },        // TH16+
  '1000079': { name: 'Torre Multi-Ingranaggi', cat: 'building' },  // TH16+
  '1000089': { name: 'Sputafuoco', cat: 'building' },              // TH16+
};

/** CAPS completi per TH10..TH17 – TUTTE le strutture richieste (cap=0 → non disponibile al TH) */
type Caps = Record<string, number>;
const CAPS: Record<number, Caps> = {
  10: {
    'Re Barbaro': 40, 'Regina degli Arcieri': 40, 'Gran Sorvegliante': 0, 'Campionessa Reale': 0,
    'Cannone': 13, 'Torre degli Arcieri': 13, 'Mortaio': 8, 'Torre dello Stregone': 9,
    'Difesa Aerea': 8, 'Tesla Nascosta': 8, 'Balestra': 4, 'Torre Infernale': 3,
    'Spingiaria Aerea': 5, 'Muro': 11,
    'Municipio (Giga)': 0, 'Artiglieria Aquila': 0, 'Lanciascaglie': 0,
    'Capanna del Costruttore': 0, 'Torre delle Bombe': 5, 'Torre degli Incantesimi': 0, 'Monolite': 0,
    'Torre Multi-Arceri': 0, 'Cannone Rimbalzo': 0, 'Torre Multi-Ingranaggi': 0, 'Sputafuoco': 0,
    'Castello del Clan': 6, 'Laboratorio': 8, 'Caserma': 12, 'Caserma Nera': 8,
    'Officina d’Assedio': 2, 'Casa degli Animali': 0, 'Fucina': 0,
    "Miniera d'Oro": 13, "Deposito d'Oro": 11, "Estrattore d'Elisir": 13, "Deposito d'Elisir": 11,
    "Trivella d'Elisir Nero": 6, "Deposito d'Elisir Nero": 6,
    'Bomba': 7, 'Trappola a Molla': 5, 'Bomba Gigante': 4, 'Bomba Aerea': 4,
    'Mina Aerea a Ricerca': 3, 'Trappola Scheletrica': 4, 'Trappola Tornado': 0, 'Giga Bomba': 0,
    'L.A.S.S.I': 0, 'Gufo Elettrico': 0, 'Yak Potente': 0, 'Unicorno': 0, 'Campo d’Addestramento': 8,
    'Fabbrica degli Incantesimi': 5, 'Fabbrica degli Incantesimi Oscuri': 4,
  },
  11: {
    'Re Barbaro': 50, 'Regina degli Arcieri': 50, 'Gran Sorvegliante': 20, 'Campionessa Reale': 0,
    'Cannone': 15, 'Torre degli Arcieri': 15, 'Mortaio': 11, 'Torre dello Stregone': 10,
    'Difesa Aerea': 9, 'Tesla Nascosta': 9, 'Balestra': 5, 'Torre Infernale': 5,
    'Spingiaria Aerea': 6, 'Muro': 12,
    'Municipio (Giga)': 0, 'Artiglieria Aquila': 2, 'Lanciascaglie': 0,
    'Capanna del Costruttore': 0, 'Torre delle Bombe': 6, 'Torre degli Incantesimi': 0, 'Monolite': 0,
    'Torre Multi-Arceri': 0, 'Cannone Rimbalzo': 0, 'Torre Multi-Ingranaggi': 0, 'Sputafuoco': 0,
    'Castello del Clan': 7, 'Laboratorio': 9, 'Caserma': 13, 'Caserma Nera': 9,
    'Officina d’Assedio': 3, 'Casa degli Animali': 0, 'Fucina': 0,
    "Miniera d'Oro": 14, "Deposito d'Oro": 12, "Estrattore d'Elisir": 14, "Deposito d'Elisir": 12,
    "Trivella d'Elisir Nero": 7, "Deposito d'Elisir Nero": 7,
    'Bomba': 8, 'Trappola a Molla': 6, 'Bomba Gigante': 5, 'Bomba Aerea': 5,
    'Mina Aerea a Ricerca': 3, 'Trappola Scheletrica': 4, 'Trappola Tornado': 2, 'Giga Bomba': 0,
    'L.A.S.S.I': 0, 'Gufo Elettrico': 0, 'Yak Potente': 0, 'Unicorno': 0, 'Campo d’Addestramento': 8,
    'Fabbrica degli Incantesimi': 6, 'Fabbrica degli Incantesimi Oscuri': 5,
  },
  12: {
    'Re Barbaro': 65, 'Regina degli Arcieri': 65, 'Gran Sorvegliante': 40, 'Campionessa Reale': 0,
    'Cannone': 17, 'Torre degli Arcieri': 17, 'Mortaio': 12, 'Torre dello Stregone': 11,
    'Difesa Aerea': 10, 'Tesla Nascosta': 10, 'Balestra': 6, 'Torre Infernale': 6,
    'Spingiaria Aerea': 7, 'Muro': 14,
    'Municipio (Giga)': 5, 'Artiglieria Aquila': 3, 'Lanciascaglie': 0,
    'Capanna del Costruttore': 0, 'Torre delle Bombe': 7, 'Torre degli Incantesimi': 0, 'Monolite': 0,
    'Torre Multi-Arceri': 0, 'Cannone Rimbalzo': 0, 'Torre Multi-Ingranaggi': 0, 'Sputafuoco': 0,
    'Castello del Clan': 8, 'Laboratorio': 10, 'Caserma': 14, 'Caserma Nera': 10,
    'Officina d’Assedio': 4, 'Casa degli Animali': 0, 'Fucina': 0,
    "Miniera d'Oro": 14, "Deposito d'Oro": 13, "Estrattore d'Elisir": 14, "Deposito d'Elisir": 13,
    "Trivella d'Elisir Nero": 8, "Deposito d'Elisir Nero": 8,
    'Bomba': 8, 'Trappola a Molla': 7, 'Bomba Gigante': 5, 'Bomba Aerea': 6,
    'Mina Aerea a Ricerca': 3, 'Trappola Scheletrica': 4, 'Trappola Tornado': 3, 'Giga Bomba': 0,
    'L.A.S.S.I': 0, 'Gufo Elettrico': 0, 'Yak Potente': 0, 'Unicorno': 0, 'Campo d’Addestramento': 8,
    'Fabbrica degli Incantesimi': 6, 'Fabbrica degli Incantesimi Oscuri': 5,
  },
  13: {
    'Re Barbaro': 75, 'Regina degli Arcieri': 75, 'Gran Sorvegliante': 50, 'Campionessa Reale': 25,
    'Cannone': 19, 'Torre degli Arcieri': 19, 'Mortaio': 13, 'Torre dello Stregone': 13,
    'Difesa Aerea': 11, 'Tesla Nascosta': 12, 'Balestra': 8, 'Torre Infernale': 7,
    'Spingiaria Aerea': 7, 'Muro': 14,
    'Municipio (Giga)': 5, 'Artiglieria Aquila': 4, 'Lanciascaglie': 2,
    'Capanna del Costruttore': 0, 'Torre delle Bombe': 8, 'Torre degli Incantesimi': 0, 'Monolite': 0,
    'Torre Multi-Arceri': 0, 'Cannone Rimbalzo': 0, 'Torre Multi-Ingranaggi': 0, 'Sputafuoco': 0,
    'Castello del Clan': 9, 'Laboratorio': 11, 'Caserma': 15, 'Caserma Nera': 11,
    'Officina d’Assedio': 5, 'Casa degli Animali': 0, 'Fucina': 0,
    "Miniera d'Oro": 15, "Deposito d'Oro": 14, "Estrattore d'Elisir": 15, "Deposito d'Elisir": 14,
    "Trivella d'Elisir Nero": 8, "Deposito d'Elisir Nero": 8,
    'Bomba': 9, 'Trappola a Molla': 8, 'Bomba Gigante': 7, 'Bomba Aerea': 8,
    'Mina Aerea a Ricerca': 4, 'Trappola Scheletrica': 4, 'Trappola Tornado': 3, 'Giga Bomba': 0,
    'L.A.S.S.I': 0, 'Gufo Elettrico': 0, 'Yak Potente': 0, 'Unicorno': 0, 'Campo d’Addestramento': 9,
    'Fabbrica degli Incantesimi': 7, 'Fabbrica degli Incantesimi Oscuri': 5,
  },
  14: {
    'Re Barbaro': 85, 'Regina degli Arcieri': 85, 'Gran Sorvegliante': 60, 'Campionessa Reale': 30,
    'Cannone': 20, 'Torre degli Arcieri': 20, 'Mortaio': 14, 'Torre dello Stregone': 14,
    'Difesa Aerea': 12, 'Tesla Nascosta': 13, 'Balestra': 9, 'Torre Infernale': 8,
    'Spingiaria Aerea': 7, 'Muro': 15,
    'Municipio (Giga)': 5, 'Artiglieria Aquila': 5, 'Lanciascaglie': 3,
    'Capanna del Costruttore': 4, 'Torre delle Bombe': 9,
    'Torre degli Incantesimi': 0, 'Monolite': 0, 'Torre Multi-Arceri': 0, 'Cannone Rimbalzo': 0,
    'Torre Multi-Ingranaggi': 0, 'Sputafuoco': 0,
    'Castello del Clan': 10, 'Laboratorio': 12, 'Caserma': 16, 'Caserma Nera': 12,
    'Officina d’Assedio': 6, 'Casa degli Animali': 4, 'Fucina': 7,
    "Miniera d'Oro": 16, "Deposito d'Oro": 15, "Estrattore d'Elisir": 16, "Deposito d'Elisir": 15,
    "Trivella d'Elisir Nero": 9, "Deposito d'Elisir Nero": 9,
    'Bomba': 10, 'Trappola a Molla': 9, 'Bomba Gigante': 8, 'Bomba Aerea': 9,
    'Mina Aerea a Ricerca': 4, 'Trappola Scheletrica': 4, 'Trappola Tornado': 3, 'Giga Bomba': 0,
    'L.A.S.S.I': 10, 'Gufo Elettrico': 10, 'Yak Potente': 10, 'Unicorno': 10, 'Campo d’Addestramento': 10,
    'Fabbrica degli Incantesimi': 8, 'Fabbrica degli Incantesimi Oscuri': 6,
  },
  15: {
    'Re Barbaro': 90, 'Regina degli Arcieri': 90, 'Gran Sorvegliante': 65, 'Campionessa Reale': 40,
    'Cannone': 21, 'Torre degli Arcieri': 21, 'Mortaio': 15, 'Torre dello Stregone': 15,
    'Difesa Aerea': 13, 'Tesla Nascosta': 14, 'Balestra': 10, 'Torre Infernale': 9,
    'Spingiaria Aerea': 8, 'Muro': 16,
    'Municipio (Giga)': 5, 'Artiglieria Aquila': 6, 'Lanciascaglie': 4,
    'Capanna del Costruttore': 5, 'Torre delle Bombe': 10,
    'Torre degli Incantesimi': 3, 'Monolite': 2,
    'Castello del Clan': 11, 'Laboratorio': 13, 'Caserma': 17, 'Caserma Nera': 12,
    'Officina d’Assedio': 7, 'Casa degli Animali': 8, 'Fucina': 8,
    "Miniera d'Oro": 16, "Deposito d'Oro": 16, "Estrattore d'Elisir": 16, "Deposito d'Elisir": 16,
    "Trivella d'Elisir Nero": 10, "Deposito d'Elisir Nero": 10,
    'Bomba': 11, 'Trappola a Molla': 10, 'Bomba Gigante': 9, 'Bomba Aerea': 10,
    'Mina Aerea a Ricerca': 5, 'Trappola Scheletrica': 5, 'Trappola Tornado': 4, 'Giga Bomba': 0,
    'L.A.S.S.I': 10, 'Gufo Elettrico': 10, 'Yak Potente': 10, 'Unicorno': 10, 'Campo d’Addestramento': 12,
    'Fabbrica degli Incantesimi': 8, 'Fabbrica degli Incantesimi Oscuri': 7,
  },
  16: {
    'Re Barbaro': 95, 'Regina degli Arcieri': 95, 'Gran Sorvegliante': 70, 'Campionessa Reale': 45,
    'Cannone': 22, 'Torre degli Arcieri': 22, 'Mortaio': 16, 'Torre dello Stregone': 16,
    'Difesa Aerea': 14, 'Tesla Nascosta': 15, 'Balestra': 11, 'Torre Infernale': 10,
    'Spingiaria Aerea': 8, 'Muro': 17,
    'Municipio (Giga)': 5, 'Artiglieria Aquila': 6, 'Lanciascaglie': 4,
    'Capanna del Costruttore': 5, 'Torre delle Bombe': 11,
    'Torre degli Incantesimi': 4, 'Monolite': 3, 'Torre Multi-Arceri': 2, 'Cannone Rimbalzo': 2,
    'Torre Multi-Ingranaggi': 2, 'Sputafuoco': 2,
    'Castello del Clan': 12, 'Laboratorio': 14, 'Caserma': 18, 'Caserma Nera': 12,
    'Officina d’Assedio': 8, 'Casa degli Animali': 10, 'Fucina': 9,
    "Miniera d'Oro": 16, "Deposito d'Oro": 17, "Estrattore d'Elisir": 16, "Deposito d'Elisir": 17,
    "Trivella d'Elisir Nero": 10, "Deposito d'Elisir Nero": 11,
    'Bomba': 12, 'Trappola a Molla': 10, 'Bomba Gigante': 10, 'Bomba Aerea': 11,
    'Mina Aerea a Ricerca': 6, 'Trappola Scheletrica': 5, 'Trappola Tornado': 4, 'Giga Bomba': 0,
    'L.A.S.S.I': 10, 'Gufo Elettrico': 10, 'Yak Potente': 10, 'Unicorno': 10, 'Campo d’Addestramento': 12,
    'Fabbrica degli Incantesimi': 8, 'Fabbrica degli Incantesimi Oscuri': 7,
  },
  17: {
    'Re Barbaro': 100, 'Regina degli Arcieri': 100, 'Gran Sorvegliante': 75, 'Campionessa Reale': 50,
    'Cannone': 23, 'Torre degli Arcieri': 23, 'Mortaio': 17, 'Torre dello Stregone': 17,
    'Difesa Aerea': 15, 'Tesla Nascosta': 16, 'Balestra': 12, 'Torre Infernale': 11,
    'Spingiaria Aerea': 8, 'Muro': 18,
    'Municipio (Giga)': 5, 'Artiglieria Aquila': 7, 'Lanciascaglie': 5,
    'Capanna del Costruttore': 5, 'Torre delle Bombe': 12,
    'Torre degli Incantesimi': 5, 'Monolite': 4, 'Torre Multi-Arceri': 3, 'Cannone Rimbalzo': 3,
    'Torre Multi-Ingranaggi': 3, 'Sputafuoco': 3,
    'Castello del Clan': 12, 'Laboratorio': 15, 'Caserma': 18, 'Caserma Nera': 12,
    'Officina d’Assedio': 8, 'Casa degli Animali': 10, 'Fucina': 10,
    "Miniera d'Oro": 17, "Deposito d'Oro": 18, "Estrattore d'Elisir": 17, "Deposito d'Elisir": 18,
    "Trivella d'Elisir Nero": 10, "Deposito d'Elisir Nero": 12,
    'Bomba': 13, 'Trappola a Molla': 11, 'Bomba Gigante': 11, 'Bomba Aerea': 12,
    'Mina Aerea a Ricerca': 7, 'Trappola Scheletrica': 5, 'Trappola Tornado': 5, 'Giga Bomba': 5,
    'L.A.S.S.I': 10, 'Gufo Elettrico': 10, 'Yak Potente': 10, 'Unicorno': 10, 'Campo d’Addestramento': 12,
    'Fabbrica degli Incantesimi': 8, 'Fabbrica degli Incantesimi Oscuri': 7,
  },
};

type RawEntry = { data?: number; lvl?: number; cnt?: number };
function collectEntries(json: any): RawEntry[] {
  const out: RawEntry[] = [];
  const KEYS = ['buildings2', 'buildings', 'traps2', 'heroes2', 'heroes', 'pets']; // NO equipment
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

// Profili – ranking per nome (match per inclusione)
const FARM_ORDER = [
  'Laboratorio','Castello del Clan','Casa degli Animali','Fucina',
  'Re Barbaro','Regina degli Arcieri','Gran Sorvegliante','Campionessa Reale',
  'Capanna del Costruttore','Balestra','Difesa Aerea','Torre dello Stregone','Torre delle Bombe',
  'Torre degli Arcieri','Cannone','Muro','Spingiaria Aerea','Tesla Nascosta','Mortaio'
];
const WAR_ORDER = [
  'Municipio','Giga','Artiglieria Aquila','Lanciascaglie','Torre Infernale',
  'Capanna del Costruttore','Balestra','Difesa Aerea','Tesla Nascosta',
  'Castello del Clan','Laboratorio','Fucina',
  'Re Barbaro','Regina degli Arcieri','Gran Sorvegliante','Campionessa Reale',
  'Torre dello Stregone','Torre degli Arcieri','Muro','Mortaio','Torre delle Bombe'
];

type Row = { name: string; have: number; max: number; countAtLevel: number; totalByName: number; deficit: number; };

export default function Page() {
  const [pasted, setPasted] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [missingCaps, setMissingCaps] = useState<{ name: string; have: number; count: number }[]>([]);
  const [error, setError] = useState('');
  const [th, setTh] = useState<number | undefined>(undefined);
  const [thSource, setThSource] = useState<'explicit'|'townhall'|'weapon'|'pets'|'unknown'>('unknown');
  const [mode, setMode] = useState<'FARM'|'WAR'>('FARM');

  const timer = useRef<any>(null);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => generate(pasted), 250);
    return () => clearTimeout(timer.current);
  }, [pasted, mode]);

  function generate(text: string) {
    setError(''); setRows([]); setMissingCaps([]); setTh(undefined);

    if (!text.trim()) return;

    let json: any;
    try { json = sanitizeToJSONObject(text); }
    catch (e: any) { setError('JSON non valido: ' + (e?.message || 'errore di parsing')); return; }

    const { th: detectedTH, source } = detectTownHall(json);
    setTh(detectedTH); setThSource(source);

    const entries = collectEntries(json);
    if (!entries.length) { setRows([]); return; }

    // totalizzatore per raggruppi tipo "Archer Towers 5/7"
    const totalById = new Map<string, number>();
    for (const e of entries) {
      const id = String(e.data);
      totalById.set(id, (totalById.get(id) || 0) + (e.cnt || 1));
    }

    const capsForTH = (detectedTH && CAPS[detectedTH]) ? CAPS[detectedTH] : {};

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

      const max = typeof capsForTH[name] === 'number' ? capsForTH[name] : undefined;
      if (typeof max !== 'number') {
        // riconosciuto ma manca cap per questo TH → diagnostica (dovrebbe capitare raramente)
        missing.push({ name, have, count });
        continue;
      }
      if (max === 0) continue;         // non disponibile al TH
      if (!(have < max)) continue;     // già al massimo

      const key = name + '__' + have;
      const prev = map.get(key);
      const row: Row = prev || { name, have, max, countAtLevel: 0, totalByName: tot, deficit: Math.max(0, max - have) };
      row.countAtLevel += count;
      map.set(key, row);
    }

    const orderList = mode === 'WAR' ? WAR_ORDER : FARM_ORDER;
    const rankName = (n: string) => {
      const i = orderList.findIndex(x => n.toLowerCase().includes(x.toLowerCase()));
      return i === -1 ? 999 : i;
    };

    const sorted = Array.from(map.values()).sort((a, b) => {
      const ra = rankName(a.name), rb = rankName(b.name);
      if (ra !== rb) return ra - rb;
      if (b.deficit !== a.deficit) return b.deficit - a.deficit;
      if (a.name !== b.name) return a.name.localeCompare(b.name, 'it');
      return a.have - b.have;
    });

    // eventuali elementi riconosciuti ma senza cap (diagnostica)
    const agg = new Map<string, { name: string; have: number; count: number }>();
    for (const m of missing) {
      const prev = agg.get(m.name);
      if (!prev) agg.set(m.name, m);
      else agg.set(m.name, { name: m.name, have: Math.min(prev.have, m.have), count: prev.count + m.count });
    }

    setRows(sorted);
    setMissingCaps(Array.from(agg.values()).sort((a, b) => a.name.localeCompare(b.name, 'it')));
  }

  const sourceColor =
    thSource === 'explicit' || thSource === 'townhall' ? '#22c55e' :
    thSource === 'weapon' ? '#f59e0b' :
    thSource === 'pets' ? '#fb923c' : '#9ca3af';

  return (
    <div className="wrap">
      <h1>CoC – Piano di Upgrade {th ? `(TH${th})` : ''}</h1>
      <div className="muted small" style={{marginBottom: 8}}>
        Incolla l’export. Scegli il profilo. Vedi solo ciò che puoi ancora upgradare per il tuo TH.
      </div>

      <div className="panel">
        <textarea
          className="input"
          rows={12}
          placeholder='Incolla qui "heroes2", "buildings2", "traps2", "pets"… o l’export completo.'
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
        />
        <div className="row" style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:8}}>
          <div className="thbadge" style={{display:'flex', alignItems:'center', gap:8}}>
            <span style={{
              display:'inline-block', width:10, height:10, borderRadius:9999, background: sourceColor
            }} />
            {th
              ? <>TH rilevato: <b>{th}</b> <span className="small muted">({thSource})</span></>
              : <>TH non rilevato</>}
          </div>
          <div className="seg">
            <button className={mode==='FARM'?'segbtn active':'segbtn'} onClick={()=>setMode('FARM')}>FARM</button>
            <button className={mode==='WAR'?'segbtn active':'segbtn'} onClick={()=>setMode('WAR')}>WAR</button>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 12 }}>
        <div className="title">Piano {mode}</div>
        {error && <div style={{color:'#f87171', marginBottom:8}}>{error}</div>}
        {rows.length === 0 && !error ? (
          <div className="muted small">Nessun upgrade da mostrare con i cap attuali.</div>
        ) : (
          <ul className="list">
            {rows.map((r, i) => (
              <li key={i}>
                <b>{r.name}</b> — {r.countAtLevel}/{r.totalByName} → liv. {r.have} → <b>{r.max}</b>
                <span className="small muted"> (deficit {r.deficit})</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {missingCaps.length > 0 && (
        <div className="panel" style={{ marginTop: 12 }}>
          <div className="title">Elementi riconosciuti ma senza cap per questo TH</div>
          <ul className="list">
            {missingCaps.map((m, i) => (
              <li key={i}><b>{m.name}</b> — rilevato livello {m.have} (×{m.count})</li>
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
        .thbadge { font-size:12px; color:#cbd5e1; }
        .row .seg { display:flex; gap:6px; }
        .segbtn { background:#121212; border:1px solid #2a2a2a; color:#e5e5e5; padding:8px 12px; border-radius:10px; cursor:pointer; }
        .segbtn.active { border-color:#6ee7b7; box-shadow:0 0 0 2px rgba(110,231,183,.15) inset; }
        .title { font-weight:600; margin-bottom:6px; }
        .list { margin: 0; padding-left: 18px; line-height: 1.45; }
      `}</style>
    </div>
  );
}
