'use client';
import React, { useEffect, useRef, useState } from 'react';

/* =========================================================
   Upgrade Planner — Villaggio Principale (TH10→TH17)
   - Parser tollerante input JSON (frammenti o oggetti completi)
   - Rilevamento TH
   - ID→Nome in italiano (incluso Principe Minion ID 28000006)
   - CAPS Strutture: **quantità + livello max** per TH10–TH17 (qty + lvl)
   - Eroi: invariati (solo livello)
   - Conta copie sotto-cap (muri & strutture duplicate): mostra quante sono da alzare
   - Modalità FARM / WAR con ordinamento consigli
   - UI pulita con banner /public/banner.png
   - Esclusi equipaggiamenti eroi e Base del Costruttore
   ========================================================= */

/* =============== Tipi =============== */
type Cat = 'hero'|'pet'|'defense'|'trap'|'resource'|'army'|'townhall'|'other'|'misc';
type Meta = { name: string; cat: Cat };
type Row = { name: string; have: number; max: number; foundCount?: number; targetQty?: number };

type Cap = { qty: number; lvl: number };
type CapsByName = Record<string, Cap>;
const THS = [10,11,12,13,14,15,16,17] as const;
type TH = typeof THS[number];

type LevelBucket = { lvl: number; cnt: number };
type Agg = { totalCnt: number; minLvl: number; buckets: LevelBucket[] };

/* =============== Util =============== */
function normalizeName(s: string): string {
  if (!s) return '';
  let t = s.normalize('NFKC')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return t;
}

function tolerantParse(raw: string): any {
  let t = (raw || '').trim();
  if (!t) return {};
  if (!t.startsWith('{') && !t.startsWith('[')) t = '{' + t + '}';
  t = t.replace(/,(\s*[}\]])/g, '$1');
  const bal = (s:string,o:string,c:string)=> (s.match(new RegExp('\\'+o,'g'))||[]).length - (s.match(new RegExp('\\'+c,'g'))||[]).length;
  let d = bal(t,'{','}'); if (d>0) t += '}'.repeat(d); else if (d<0) t = t.slice(0,d);
  d = bal(t,'[',']');     if (d>0) t += ']'.repeat(d); else if (d<0) t = t.slice(0,d);
  try{ return JSON.parse(t); }catch{ return {}; }
}

function deepFindNumber(obj:any, keys:string[]): number|undefined {
  const st=[obj];
  while(st.length){
    const cur=st.pop();
    if(!cur || typeof cur!=='object') continue;
    for(const k of keys) if(Object.prototype.hasOwnProperty.call(cur,k)){
      const v=(cur as any)[k]; if(typeof v==='number') return v;
    }
    for(const v of Object.values(cur)) if(v && typeof v==='object') st.push(v);
  }
  return undefined;
}

function detectTH(json:any): number|undefined {
  const explicit = deepFindNumber(json, ['townHallLevel','th','thLevel','town_hall']);
  if (explicit && explicit>=1 && explicit<=20) return explicit;
  const scan = (arr?:any[])=>{
    if(!Array.isArray(arr)) return;
    for(const it of arr){
      if (Number(it?.data)===1000001 && typeof it?.lvl==='number') return Number(it.lvl);
    }
  };
  return (scan(json.buildings) ?? scan(json.buildings2)) || (Array.isArray(json.pets)&&json.pets.length?14:undefined);
}

/* =============== ID MAP =============== */
const IDMAP: Record<number, Meta> = {
  // Heroes
  28000000:{name:'Re Barbaro',cat:'hero'},
  28000001:{name:'Regina degli Arcieri',cat:'hero'},
  28000002:{name:'Sorvegliante (Grand Warden)',cat:'hero'},
  28000004:{name:'Campionessa Reale',cat:'hero'},
  28000005:{name:'Principe Minion',cat:'hero'}, // compat legacy
  28000006:{name:'Principe Minion',cat:'hero'}, // confermato
  // Pets (solo presenza)
  73000000:{name:'L.A.S.S.I',cat:'pet'},
  73000001:{name:'Gufo Elettrico',cat:'pet'},
  73000002:{name:'Yak Potente',cat:'pet'},
  73000003:{name:'Unicorno',cat:'pet'},
  // Town Hall
  1000001:{name:'Municipio',cat:'townhall'},
  // Army & infrastruttura attacco
  1000000:{name:'Accampamento',cat:'army'},
  1000006:{name:'Caserma',cat:'army'},
  1000026:{name:'Caserma nera',cat:'army'},
  1000007:{name:'Laboratorio',cat:'army'},
  1000020:{name:'Fabbrica incantesimi',cat:'army'},
  1000029:{name:'Fabbrica incantesimi neri',cat:'army'},
  1000059:{name:'Officina d’assedio (Workshop)',cat:'army'},
  1000070:{name:'Fabbro (Blacksmith)',cat:'army'},
  1000071:{name:'Sala degli Eroi (Hero Hall)',cat:'army'},
  1000068:{name:'Casa degli Animali (Pet House)',cat:'army'},
  1000014:{name:'Castello del Clan',cat:'army'},
  // Risorse
  1000004:{name:'Miniera d’Oro',cat:'resource'},
  1000002:{name:'Collettore d’Elisir',cat:'resource'},
  1000005:{name:'Deposito d’Oro',cat:'resource'},
  1000003:{name:'Deposito d’Elisir',cat:'resource'},
  1000023:{name:'Trivella d’Elisir Nero',cat:'resource'},
  1000024:{name:'Deposito d’Elisir Nero',cat:'resource'},
  // Difese
  1000008:{name:'Cannone',cat:'defense'},
  1000009:{name:'Torre degli Arcieri',cat:'defense'},
  1000013:{name:'Mortaio',cat:'defense'},
  1000011:{name:'Torre dello Stregone',cat:'defense'},
  1000012:{name:'Difesa Aerea',cat:'defense'},
  1000028:{name:'Volano (Air Sweeper)',cat:'defense'},
  1000019:{name:'Tesla Nascosta',cat:'defense'},
  1000032:{name:'Torre delle Bombe',cat:'defense'},
  1000021:{name:'Arco X (X-Bow)',cat:'defense'},
  1000027:{name:'Torre Infernale',cat:'defense'},
  1000031:{name:'Artiglieria Aquila',cat:'defense'},
  1000067:{name:'Scagliapietre (Scattershot)',cat:'defense'},
  1000015:{name:'Capanna del Costruttore',cat:'defense'},
  1000072:{name:'Torre degli Incantesimi',cat:'defense'},
  1000077:{name:'Monolite',cat:'defense'},
  1000084:{name:'Torre Multi-Arciere',cat:'defense'},
  1000085:{name:'Cannone a palle rimbalzanti',cat:'defense'},
  1000079:{name:'Torre Multi-Ingranaggio (Long Range)',cat:'defense'},
  1000089:{name:'Sputafuoco',cat:'defense'},
  1000010:{name:'Mura (sezioni)',cat:'defense'},
  // Trappole
  12000000:{name:'Bomba',cat:'trap'},
  12000002:{name:'Bomba Gigante',cat:'trap'},
  12000005:{name:'Bomba Aerea',cat:'trap'},
  12000001:{name:'Trappola a Molla',cat:'trap'},
  12000006:{name:'Mina Aerea a Ricerca',cat:'trap'},
  12000008:{name:'Trappola Scheletrica',cat:'trap'},
  12000016:{name:'Trappola Tornado',cat:'trap'},
  12000020:{name:'Giga Bomba (solo TH17)',cat:'trap'},
};

/* =========================================================
   CAPS — Eroi (invariati)
   ========================================================= */
const CAPS_HERO: Record<number, Record<string, number>> = {
  10: {"Re Barbaro":40,"Regina degli Arcieri":40,"Principe Minion":20,"Sorvegliante (Grand Warden)":0,"Campionessa Reale":0},
  11: {"Re Barbaro":50,"Regina degli Arcieri":50,"Principe Minion":30,"Sorvegliante (Grand Warden)":20,"Campionessa Reale":0},
  12: {"Re Barbaro":65,"Regina degli Arcieri":65,"Principe Minion":40,"Sorvegliante (Grand Warden)":40,"Campionessa Reale":25},
  13: {"Re Barbaro":75,"Regina degli Arcieri":75,"Principe Minion":50,"Sorvegliante (Grand Warden)":50,"Campionessa Reale":30},
  14: {"Re Barbaro":80,"Regina degli Arcieri":80,"Principe Minion":60,"Sorvegliante (Grand Warden)":55,"Campionessa Reale":35},
  15: {"Re Barbaro":90,"Regina degli Arcieri":90,"Principe Minion":70,"Sorvegliante (Grand Warden)":60,"Campionessa Reale":40},
  16: {"Re Barbaro":95,"Regina degli Arcieri":95,"Principe Minion":80,"Sorvegliante (Grand Warden)":70,"Campionessa Reale":45},
  17: {"Re Barbaro":100,"Regina degli Arcieri":100,"Principe Minion":90,"Sorvegliante (Grand Warden)":75,"Campionessa Reale":50},
};

/* =========================================================
   CAPS — Strutture (qty + lvl) per TH10→TH17
   (base consolidata coerente con il tuo file aggiornato)
   ========================================================= */
const CAPS2: Record<TH, CapsByName> = {
  10: {
    "Accampamento": { qty: 4, lvl: 8 },
    "Caserma": { qty: 1, lvl: 12 },
    "Caserma nera": { qty: 1, lvl: 7 },
    "Laboratorio": { qty: 1, lvl: 8 },
    "Fabbrica incantesimi": { qty: 1, lvl: 5 },
    "Fabbrica incantesimi neri": { qty: 1, lvl: 5 },
    "Officina d’assedio (Workshop)": { qty: 0, lvl: 0 },
    "Fabbro (Blacksmith)": { qty: 1, lvl: 3 },
    "Sala degli Eroi (Hero Hall)": { qty: 1, lvl: 4 },
    "Casa degli Animali (Pet House)": { qty: 0, lvl: 0 },
    "Castello del Clan": { qty: 1, lvl: 6 },
    "Miniera d’Oro": { qty: 7, lvl: 13 },
    "Collettore d’Elisir": { qty: 7, lvl: 13 },
    "Deposito d’Oro": { qty: 4, lvl: 11 },
    "Deposito d’Elisir": { qty: 4, lvl: 12 },
    "Trivella d’Elisir Nero": { qty: 3, lvl: 7 },
    "Deposito d’Elisir Nero": { qty: 1, lvl: 6 },
    "Cannone": { qty: 6, lvl: 13 },
    "Torre degli Arcieri": { qty: 7, lvl: 13 },
    "Mortaio": { qty: 4, lvl: 8 },
    "Torre dello Stregone": { qty: 5, lvl: 9 },
    "Difesa Aerea": { qty: 4, lvl: 8 },
    "Volano (Air Sweeper)": { qty: 2, lvl: 4 },
    "Tesla Nascosta": { qty: 5, lvl: 8 },
    "Torre delle Bombe": { qty: 2, lvl: 4 },
    "Arco X (X-Bow)": { qty: 3, lvl: 4 },
    "Torre Infernale": { qty: 2, lvl: 3 },
    "Artiglieria Aquila": { qty: 0, lvl: 0 },
    "Scagliapietre (Scattershot)": { qty: 0, lvl: 0 },
    "Capanna del Costruttore": { qty: 0, lvl: 0 },
    "Torre degli Incantesimi": { qty: 0, lvl: 0 },
    "Monolite": { qty: 0, lvl: 0 },
    "Torre Multi-Arciere": { qty: 0, lvl: 0 },
    "Cannone a palle rimbalzanti": { qty: 0, lvl: 0 },
    "Torre Multi-Ingranaggio (Long Range)": { qty: 0, lvl: 0 },
    "Sputafuoco": { qty: 0, lvl: 0 },
    "Mura (sezioni)": { qty: 300, lvl: 11 },
    "Bomba": { qty: 6, lvl: 6 },
    "Trappola a Molla": { qty: 5, lvl: 5 },
    "Bomba Gigante": { qty: 6, lvl: 6 },
    "Bomba Aerea": { qty: 4, lvl: 4 },
    "Mina Aerea a Ricerca": { qty: 3, lvl: 3 },
    "Trappola Scheletrica": { qty: 4, lvl: 4 },
    "Trappola Tornado": { qty: 0, lvl: 0 },
    "Giga Bomba (solo TH17)": { qty: 0, lvl: 0 }
  },
  11: {
    "Accampamento": { qty: 4, lvl: 9 },
    "Caserma": { qty: 1, lvl: 13 },
    "Caserma nera": { qty: 1, lvl: 8 },
    "Laboratorio": { qty: 1, lvl: 9 },
    "Fabbrica incantesimi": { qty: 1, lvl: 6 },
    "Fabbrica incantesimi neri": { qty: 1, lvl: 5 },
    "Officina d’assedio (Workshop)": { qty: 0, lvl: 0 },
    "Fabbro (Blacksmith)": { qty: 1, lvl: 4 },
    "Sala degli Eroi (Hero Hall)": { qty: 1, lvl: 5 },
    "Casa degli Animali (Pet House)": { qty: 0, lvl: 0 },
    "Castello del Clan": { qty: 1, lvl: 7 },
    "Miniera d’Oro": { qty: 7, lvl: 14 },
    "Collettore d’Elisir": { qty: 7, lvl: 14 },
    "Deposito d’Oro": { qty: 4, lvl: 12 },
    "Deposito d’Elisir": { qty: 4, lvl: 12 },
    "Trivella d’Elisir Nero": { qty: 3, lvl: 8 },
    "Deposito d’Elisir Nero": { qty: 1, lvl: 7 },
    "Cannone": { qty: 7, lvl: 15 },
    "Torre degli Arcieri": { qty: 8, lvl: 15 },
    "Mortaio": { qty: 4, lvl: 10 },
    "Torre dello Stregone": { qty: 5, lvl: 10 },
    "Difesa Aerea": { qty: 4, lvl: 9 },
    "Volano (Air Sweeper)": { qty: 2, lvl: 6 },
    "Tesla Nascosta": { qty: 5, lvl: 9 },
    "Torre delle Bombe": { qty: 2, lvl: 6 },
    "Arco X (X-Bow)": { qty: 4, lvl: 5 },
    "Torre Infernale": { qty: 2, lvl: 5 },
    "Artiglieria Aquila": { qty: 1, lvl: 1 },
    "Scagliapietre (Scattershot)": { qty: 0, lvl: 0 },
    "Capanna del Costruttore": { qty: 0, lvl: 0 },
    "Torre degli Incantesimi": { qty: 0, lvl: 0 },
    "Monolite": { qty: 0, lvl: 0 },
    "Torre Multi-Arciere": { qty: 0, lvl: 0 },
    "Cannone a palle rimbalzanti": { qty: 0, lvl: 0 },
    "Torre Multi-Ingranaggio (Long Range)": { qty: 0, lvl: 0 },
    "Sputafuoco": { qty: 0, lvl: 0 },
    "Mura (sezioni)": { qty: 300, lvl: 12 },
    "Bomba": { qty: 7, lvl: 7 },
    "Trappola a Molla": { qty: 6, lvl: 6 },
    "Bomba Gigante": { qty: 6, lvl: 6 },
    "Bomba Aerea": { qty: 5, lvl: 5 },
    "Mina Aerea a Ricerca": { qty: 3, lvl: 3 },
    "Trappola Scheletrica": { qty: 4, lvl: 4 },
    "Trappola Tornado": { qty: 2, lvl: 2 },
    "Giga Bomba (solo TH17)": { qty: 0, lvl: 0 }
  },
  12: {
    "Accampamento": { qty: 4, lvl: 10 },
    "Caserma": { qty: 1, lvl: 14 },
    "Caserma nera": { qty: 1, lvl: 9 },
    "Laboratorio": { qty: 1, lvl: 10 },
    "Fabbrica incantesimi": { qty: 1, lvl: 6 },
    "Fabbrica incantesimi neri": { qty: 1, lvl: 6 },
    "Officina d’assedio (Workshop)": { qty: 1, lvl: 3 },
    "Fabbro (Blacksmith)": { qty: 1, lvl: 5 },
    "Sala degli Eroi (Hero Hall)": { qty: 1, lvl: 6 },
    "Casa degli Animali (Pet House)": { qty: 0, lvl: 0 },
    "Castello del Clan": { qty: 1, lvl: 8 },
    "Miniera d’Oro": { qty: 7, lvl: 15 },
    "Collettore d’Elisir": { qty: 7, lvl: 15 },
    "Deposito d’Oro": { qty: 4, lvl: 13 },
    "Deposito d’Elisir": { qty: 4, lvl: 13 },
    "Trivella d’Elisir Nero": { qty: 3, lvl: 9 },
    "Deposito d’Elisir Nero": { qty: 1, lvl: 8 },
    "Cannone": { qty: 7, lvl: 17 },
    "Torre degli Arcieri": { qty: 8, lvl: 17 },
    "Mortaio": { qty: 4, lvl: 12 },
    "Torre dello Stregone": { qty: 5, lvl: 11 },
    "Difesa Aerea": { qty: 4, lvl: 10 },
    "Volano (Air Sweeper)": { qty: 2, lvl: 7 },
    "Tesla Nascosta": { qty: 5, lvl: 10 },
    "Torre delle Bombe": { qty: 2, lvl: 7 },
    "Arco X (X-Bow)": { qty: 4, lvl: 5 },
    "Torre Infernale": { qty: 2, lvl: 6 },
    "Artiglieria Aquila": { qty: 1, lvl: 3 },
    "Scagliapietre (Scattershot)": { qty: 0, lvl: 0 },
    "Capanna del Costruttore": { qty: 0, lvl: 0 },
    "Torre degli Incantesimi": { qty: 0, lvl: 0 },
    "Monolite": { qty: 0, lvl: 0 },
    "Torre Multi-Arciere": { qty: 0, lvl: 0 },
    "Cannone a palle rimbalzanti": { qty: 0, lvl: 0 },
    "Torre Multi-Ingranaggio (Long Range)": { qty: 0, lvl: 0 },
    "Sputafuoco": { qty: 0, lvl: 0 },
    "Mura (sezioni)": { qty: 300, lvl: 13 },
    "Bomba": { qty: 8, lvl: 8 },
    "Trappola a Molla": { qty: 7, lvl: 7 },
    "Bomba Gigante": { qty: 7, lvl: 7 },
    "Bomba Aerea": { qty: 6, lvl: 6 },
    "Mina Aerea a Ricerca": { qty: 3, lvl: 3 },
    "Trappola Scheletrica": { qty: 4, lvl: 4 },
    "Trappola Tornado": { qty: 3, lvl: 3 },
    "Giga Bomba (solo TH17)": { qty: 0, lvl: 0 }
  },
  13: {
    "Accampamento": { qty: 4, lvl: 11 },
    "Caserma": { qty: 1, lvl: 15 },
    "Caserma nera": { qty: 1, lvl: 10 },
    "Laboratorio": { qty: 1, lvl: 11 },
    "Fabbrica incantesimi": { qty: 1, lvl: 7 },
    "Fabbrica incantesimi neri": { qty: 1, lvl: 6 },
    "Officina d’assedio (Workshop)": { qty: 1, lvl: 5 },
    "Fabbro (Blacksmith)": { qty: 1, lvl: 6 },
    "Sala degli Eroi (Hero Hall)": { qty: 1, lvl: 7 },
    "Casa degli Animali (Pet House)": { qty: 0, lvl: 0 },
    "Castello del Clan": { qty: 1, lvl: 9 },
    "Miniera d’Oro": { qty: 7, lvl: 15 },
    "Collettore d’Elisir": { qty: 7, lvl: 15 },
    "Deposito d’Oro": { qty: 4, lvl: 14 },
    "Deposito d’Elisir": { qty: 4, lvl: 14 },
    "Trivella d’Elisir Nero": { qty: 3, lvl: 9 },
    "Deposito d’Elisir Nero": { qty: 1, lvl: 8 },
    "Cannone": { qty: 7, lvl: 19 },
    "Torre degli Arcieri": { qty: 8, lvl: 19 },
    "Mortaio": { qty: 4, lvl: 13 },
    "Torre dello Stregone": { qty: 5, lvl: 13 },
    "Difesa Aerea": { qty: 4, lvl: 11 },
    "Volano (Air Sweeper)": { qty: 2, lvl: 7 },
    "Tesla Nascosta": { qty: 5, lvl: 12 },
    "Torre delle Bombe": { qty: 2, lvl: 8 },
    "Arco X (X-Bow)": { qty: 4, lvl: 5 },
    "Torre Infernale": { qty: 2, lvl: 7 },
    "Artiglieria Aquila": { qty: 1, lvl: 4 },
    "Scagliapietre (Scattershot)": { qty: 2, lvl: 2 },
    "Capanna del Costruttore": { qty: 0, lvl: 0 },
    "Torre degli Incantesimi": { qty: 0, lvl: 0 },
    "Monolite": { qty: 0, lvl: 0 },
    "Torre Multi-Arciere": { qty: 0, lvl: 0 },
    "Cannone a palle rimbalzanti": { qty: 0, lvl: 0 },
    "Torre Multi-Ingranaggio (Long Range)": { qty: 0, lvl: 0 },
    "Sputafuoco": { qty: 0, lvl: 0 },
    "Mura (sezioni)": { qty: 325, lvl: 14 },
    "Bomba": { qty: 9, lvl: 9 },
    "Trappola a Molla": { qty: 8, lvl: 8 },
    "Bomba Gigante": { qty: 7, lvl: 7 },
    "Bomba Aerea": { qty: 8, lvl: 8 },
    "Mina Aerea a Ricerca": { qty: 4, lvl: 4 },
    "Trappola Scheletrica": { qty: 4, lvl: 4 },
    "Trappola Tornado": { qty: 3, lvl: 3 },
    "Giga Bomba (solo TH17)": { qty: 0, lvl: 0 }
  },
  14: {
    "Accampamento": { qty: 4, lvl: 11 },
    "Caserma": { qty: 1, lvl: 16 },
    "Caserma nera": { qty: 1, lvl: 11 },
    "Laboratorio": { qty: 1, lvl: 12 },
    "Fabbrica incantesimi": { qty: 1, lvl: 7 },
    "Fabbrica incantesimi neri": { qty: 1, lvl: 6 },
    "Officina d’assedio (Workshop)": { qty: 1, lvl: 6 },
    "Fabbro (Blacksmith)": { qty: 1, lvl: 7 },
    "Sala degli Eroi (Hero Hall)": { qty: 1, lvl: 8 },
    "Casa degli Animali (Pet House)": { qty: 1, lvl: 4 },
    "Castello del Clan": { qty: 1, lvl: 10 },
    "Miniera d’Oro": { qty: 7, lvl: 16 },
    "Collettore d’Elisir": { qty: 7, lvl: 16 },
    "Deposito d’Oro": { qty: 4, lvl: 15 },
    "Deposito d’Elisir": { qty: 4, lvl: 15 },
    "Trivella d’Elisir Nero": { qty: 3, lvl: 10 },
    "Deposito d’Elisir Nero": { qty: 1, lvl: 9 },
    "Cannone": { qty: 8, lvl: 20 },
    "Torre degli Arcieri": { qty: 8, lvl: 20 },
    "Mortaio": { qty: 4, lvl: 14 },
    "Torre dello Stregone": { qty: 5, lvl: 14 },
    "Difesa Aerea": { qty: 4, lvl: 12 },
    "Volano (Air Sweeper)": { qty: 2, lvl: 7 },
    "Tesla Nascosta": { qty: 5, lvl: 13 },
    "Torre delle Bombe": { qty: 2, lvl: 9 },
    "Arco X (X-Bow)": { qty: 4, lvl: 6 },
    "Torre Infernale": { qty: 2, lvl: 8 },
    "Artiglieria Aquila": { qty: 1, lvl: 5 },
    "Scagliapietre (Scattershot)": { qty: 2, lvl: 3 },
    "Capanna del Costruttore": { qty: 4, lvl: 4 },
    "Torre degli Incantesimi": { qty: 0, lvl: 0 },
    "Monolite": { qty: 0, lvl: 0 },
    "Torre Multi-Arciere": { qty: 0, lvl: 0 },
    "Cannone a palle rimbalzanti": { qty: 0, lvl: 0 },
    "Torre Multi-Ingranaggio (Long Range)": { qty: 0, lvl: 0 },
    "Sputafuoco": { qty: 0, lvl: 0 },
    "Mura (sezioni)": { qty: 325, lvl: 15 },
    "Bomba": { qty: 10, lvl: 10 },
    "Trappola a Molla": { qty: 9, lvl: 9 },
    "Bomba Gigante": { qty: 8, lvl: 8 },
    "Bomba Aerea": { qty: 9, lvl: 9 },
    "Mina Aerea a Ricerca": { qty: 4, lvl: 4 },
    "Trappola Scheletrica": { qty: 4, lvl: 4 },
    "Trappola Tornado": { qty: 3, lvl: 3 },
    "Giga Bomba (solo TH17)": { qty: 0, lvl: 0 }
  },
  15: {
    "Accampamento": { qty: 4, lvl: 12 },
    "Caserma": { qty: 1, lvl: 17 },
    "Caserma nera": { qty: 1, lvl: 11 },
    "Laboratorio": { qty: 1, lvl: 13 },
    "Fabbrica incantesimi": { qty: 1, lvl: 8 },
    "Fabbrica incantesimi neri": { qty: 1, lvl: 6 },
    "Officina d’assedio (Workshop)": { qty: 1, lvl: 7 },
    "Fabbro (Blacksmith)": { qty: 1, lvl: 8 },
    "Sala degli Eroi (Hero Hall)": { qty: 1, lvl: 9 },
    "Casa degli Animali (Pet House)": { qty: 1, lvl: 8 },
    "Castello del Clan": { qty: 1, lvl: 11 },
    "Miniera d’Oro": { qty: 7, lvl: 16 },
    "Collettore d’Elisir": { qty: 7, lvl: 16 },
    "Deposito d’Oro": { qty: 4, lvl: 16 },
    "Deposito d’Elisir": { qty: 4, lvl: 16 },
    "Trivella d’Elisir Nero": { qty: 3, lvl: 11 },
    "Deposito d’Elisir Nero": { qty: 1, lvl: 10 },
    "Cannone": { qty: 8, lvl: 21 },
    "Torre degli Arcieri": { qty: 8, lvl: 21 },
    "Mortaio": { qty: 4, lvl: 15 },
    "Torre dello Stregone": { qty: 5, lvl: 15 },
    "Difesa Aerea": { qty: 4, lvl: 13 },
    "Volano (Air Sweeper)": { qty: 2, lvl: 7 },
    "Tesla Nascosta": { qty: 5, lvl: 14 },
    "Torre delle Bombe": { qty: 2, lvl: 10 },
    "Arco X (X-Bow)": { qty: 4, lvl: 7 },
    "Torre Infernale": { qty: 2, lvl: 9 },
    "Artiglieria Aquila": { qty: 1, lvl: 6 },
    "Scagliapietre (Scattershot)": { qty: 2, lvl: 4 },
    "Capanna del Costruttore": { qty: 5, lvl: 5 },
    "Torre degli Incantesimi": { qty: 3, lvl: 3 },
    "Monolite": { qty: 2, lvl: 2 },
    "Torre Multi-Arciere": { qty: 1, lvl: 1 },
    "Cannone a palle rimbalzanti": { qty: 1, lvl: 1 },
    "Torre Multi-Ingranaggio (Long Range)": { qty: 1, lvl: 1 },
    "Sputafuoco": { qty: 1, lvl: 1 },
    "Mura (sezioni)": { qty: 325, lvl: 16 },
    "Bomba": { qty: 11, lvl: 11 },
    "Trappola a Molla": { qty: 10, lvl: 10 },
    "Bomba Gigante": { qty: 9, lvl: 9 },
    "Bomba Aerea": { qty: 10, lvl: 10 },
    "Mina Aerea a Ricerca": { qty: 5, lvl: 5 },
    "Trappola Scheletrica": { qty: 4, lvl: 4 },
    "Trappola Tornado": { qty: 3, lvl: 3 },
    "Giga Bomba (solo TH17)": { qty: 0, lvl: 0 }
  },
  16: {
    "Accampamento": { qty: 4, lvl: 12 },
    "Caserma": { qty: 1, lvl: 18 },
    "Caserma nera": { qty: 1, lvl: 11 },
    "Laboratorio": { qty: 1, lvl: 14 },
    "Fabbrica incantesimi": { qty: 1, lvl: 8 },
    "Fabbrica incantesimi neri": { qty: 1, lvl: 6 },
    "Officina d’assedio (Workshop)": { qty: 1, lvl: 7 },
    "Fabbro (Blacksmith)": { qty: 1, lvl: 9 },
    "Sala degli Eroi (Hero Hall)": { qty: 1, lvl: 10 },
    "Casa degli Animali (Pet House)": { qty: 1, lvl: 10 },
    "Castello del Clan": { qty: 1, lvl: 12 },
    "Miniera d’Oro": { qty: 7, lvl: 16 },
    "Collettore d’Elisir": { qty: 7, lvl: 16 },
    "Deposito d’Oro": { qty: 4, lvl: 17 },
    "Deposito d’Elisir": { qty: 4, lvl: 17 },
    "Trivella d’Elisir Nero": { qty: 3, lvl: 11 },
    "Deposito d’Elisir Nero": { qty: 1, lvl: 11 },
    "Cannone": { qty: 8, lvl: 22 },
    "Torre degli Arcieri": { qty: 8, lvl: 22 },
    "Mortaio": { qty: 4, lvl: 16 },
    "Torre dello Stregone": { qty: 5, lvl: 16 },
    "Difesa Aerea": { qty: 4, lvl: 14 },
    "Volano (Air Sweeper)": { qty: 2, lvl: 8 },
    "Tesla Nascosta": { qty: 5, lvl: 15 },
    "Torre delle Bombe": { qty: 2, lvl: 11 },
    "Arco X (X-Bow)": { qty: 4, lvl: 11 },
    "Torre Infernale": { qty: 2, lvl: 10 },
    "Artiglieria Aquila": { qty: 1, lvl: 6 },
    "Scagliapietre (Scattershot)": { qty: 2, lvl: 4 },
    "Capanna del Costruttore": { qty: 5, lvl: 5 },
    "Torre degli Incantesimi": { qty: 4, lvl: 4 },
    "Monolite": { qty: 3, lvl: 3 },
    "Torre Multi-Arciere": { qty: 2, lvl: 2 },
    "Cannone a palle rimbalzanti": { qty: 2, lvl: 2 },
    "Torre Multi-Ingranaggio (Long Range)": { qty: 2, lvl: 2 },
    "Sputafuoco": { qty: 2, lvl: 2 },
    "Mura (sezioni)": { qty: 325, lvl: 17 },
    "Bomba": { qty: 12, lvl: 12 },
    "Trappola a Molla": { qty: 10, lvl: 10 },
    "Bomba Gigante": { qty: 10, lvl: 10 },
    "Bomba Aerea": { qty: 11, lvl: 11 },
    "Mina Aerea a Ricerca": { qty: 6, lvl: 6 },
    "Trappola Scheletrica": { qty: 4, lvl: 4 },
    "Trappola Tornado": { qty: 3, lvl: 3 },
    "Giga Bomba (solo TH17)": { qty: 0, lvl: 0 }
  },
  17: {
    "Accampamento": { qty: 4, lvl: 12 },
    "Caserma": { qty: 1, lvl: 18 },
    "Caserma nera": { qty: 1, lvl: 11 },
    "Laboratorio": { qty: 1, lvl: 15 },
    "Fabbrica incantesimi": { qty: 1, lvl: 8 },
    "Fabbrica incantesimi neri": { qty: 1, lvl: 6 },
    "Officina d’assedio (Workshop)": { qty: 1, lvl: 7 },
    "Fabbro (Blacksmith)": { qty: 1, lvl: 9 },
    "Sala degli Eroi (Hero Hall)": { qty: 1, lvl: 11 },
    "Casa degli Animali (Pet House)": { qty: 1, lvl: 11 },
    "Castello del Clan": { qty: 1, lvl: 12 },
    "Miniera d’Oro": { qty: 7, lvl: 18 },
    "Collettore d’Elisir": { qty: 7, lvl: 17 },
    "Deposito d’Oro": { qty: 4, lvl: 18 },
    "Deposito d’Elisir": { qty: 4, lvl: 18 },
    "Trivella d’Elisir Nero": { qty: 3, lvl: 12 },
    "Deposito d’Elisir Nero": { qty: 1, lvl: 12 },
    "Cannone": { qty: 8, lvl: 23 },
    "Torre degli Arcieri": { qty: 8, lvl: 23 },
    "Mortaio": { qty: 4, lvl: 17 },
    "Torre dello Stregone": { qty: 5, lvl: 17 },
    "Difesa Aerea": { qty: 4, lvl: 15 },
    "Volano (Air Sweeper)": { qty: 2, lvl: 8 },
    "Tesla Nascosta": { qty: 5, lvl: 16 },
    "Torre delle Bombe": { qty: 2, lvl: 12 },
    "Arco X (X-Bow)": { qty: 4, lvl: 12 },
    "Torre Infernale": { qty: 2, lvl: 11 },
    "Artiglieria Aquila": { qty: 1, lvl: 7 },
    "Scagliapietre (Scattershot)": { qty: 2, lvl: 5 },
    "Capanna del Costruttore": { qty: 5, lvl: 5 },
    "Torre degli Incantesimi": { qty: 5, lvl: 5 },
    "Monolite": { qty: 4, lvl: 4 },
    "Torre Multi-Arciere": { qty: 3, lvl: 3 },
    "Cannone a palle rimbalzanti": { qty: 3, lvl: 3 },
    "Torre Multi-Ingranaggio (Long Range)": { qty: 3, lvl: 3 },
    "Sputafuoco": { qty: 3, lvl: 3 },
    "Mura (sezioni)": { qty: 325, lvl: 18 },
    "Bomba": { qty: 13, lvl: 13 },
    "Trappola a Molla": { qty: 11, lvl: 11 },
    "Bomba Gigante": { qty: 11, lvl: 11 },
    "Bomba Aerea": { qty: 12, lvl: 12 },
    "Mina Aerea a Ricerca": { qty: 7, lvl: 7 },
    "Trappola Scheletrica": { qty: 4, lvl: 4 },
    "Trappola Tornado": { qty: 3, lvl: 3 },
    "Giga Bomba (solo TH17)": { qty: 3, lvl: 3 }
  }
};

/* =============== Ordini priorità =============== */
const FARM_ORDER = [
  'Collettore d’Elisir','Miniera d’Oro','Trivella d’Elisir Nero',
  'Deposito d’Elisir','Deposito d’Oro','Deposito d’Elisir Nero',
  'Laboratorio','Accampamento','Caserma','Caserma nera','Castello del Clan','Casa degli Animali (Pet House)','Fabbro (Blacksmith)',
  'Mura (sezioni)',
  'Torre dello Stregone','Torre delle Bombe','Tesla Nascosta',
  'Arco X (X-Bow)','Difesa Aerea','Torre degli Arcieri','Cannone','Mortaio','Volano (Air Sweeper)',
  'Artiglieria Aquila','Scagliapietre (Scattershot)','Torre Infernale','Torre degli Incantesimi','Monolite',
  'Torre Multi-Arciere','Cannone a palle rimbalzanti','Torre Multi-Ingranaggio (Long Range)','Sputafuoco',
  'Capanna del Costruttore','Municipio'
];

const WAR_ORDER = [
  'Laboratorio','Fabbrica incantesimi','Fabbrica incantesimi neri',
  'Accampamento','Castello del Clan',
  'Re Barbaro','Regina degli Arcieri','Principe Minion','Sorvegliante (Grand Warden)','Campionessa Reale','Casa degli Animali (Pet House)',
  'Artiglieria Aquila','Scagliapietre (Scattershot)','Torre Infernale','Arco X (X-Bow)','Tesla Nascosta',
  'Torre degli Incantesimi','Monolite',
  'Difesa Aerea','Torre dello Stregone','Torre delle Bombe',
  'Torre Multi-Arciere','Cannone a palle rimbalzanti','Torre Multi-Ingranaggio (Long Range)','Sputafuoco',
  'Volano (Air Sweeper)','Mortaio','Torre degli Arcieri','Cannone',
  'Capanna del Costruttore',
  'Trappola Tornado','Mina Aerea a Ricerca','Bomba Gigante','Bomba Aerea','Trappola Scheletrica','Trappola a Molla','Bomba','Giga Bomba (solo TH17)',
  'Officina d’assedio (Workshop)','Fabbro (Blacksmith)','Caserma','Caserma nera',
  'Collettore d’Elisir','Miniera d’Oro','Trivella d’Elisir Nero',
  'Deposito d’Elisir','Deposito d’Oro','Deposito d’Elisir Nero',
  'Municipio'
];

/* =============== Componente =============== */
export default function Page(){
  const [raw,setRaw]=useState('');
  const [mode,setMode]=useState<'FARM'|'WAR'>('WAR');
  const [th,setTH]=useState<number>();
  const [rows,setRows]=useState<Row[]>([]);
  const [tips,setTips]=useState<string[]>([]);
  const tRef = useRef<any>(null);
  const [summary,setSummary]=useState('Incolla il JSON e premi “Analizza”');

  useEffect(()=>{
    clearTimeout(tRef.current);
    tRef.current=setTimeout(()=>analyze(raw),180);
    return ()=>clearTimeout(tRef.current);
  },[raw,mode]);

  function analyze(input:string){
    const json=tolerantParse(input);
    const thv=detectTH(json);
    setTH(thv);

    // Tipi base per record provenienti dal JSON
    type AnyRec = { data?: number; lvl?: number; cnt?: number };

    /* 1) EROI — prendi solo heroes/heroes2 (ID 280000xx) */
    const heroEntries: AnyRec[] = (
      [
        ...(Array.isArray(json.heroes2) ? (json.heroes2 as AnyRec[]) : []),
        ...(Array.isArray(json.heroes)  ? (json.heroes  as AnyRec[]) : []),
      ] as AnyRec[]
    ).filter((it) => typeof it?.data === 'number' && String(it.data!).startsWith('280000'));

    /* 2) ALTRI — buildings/buildings2/traps/traps2 (niente pets) */
    const otherEntries: AnyRec[] = (
      [
        ...(Array.isArray(json.buildings2) ? (json.buildings2 as AnyRec[]) : []),
        ...(Array.isArray(json.buildings)  ? (json.buildings  as AnyRec[]) : []),
        ...(Array.isArray(json.traps2)     ? (json.traps2     as AnyRec[]) : []),
        ...(Array.isArray(json.traps)      ? (json.traps      as AnyRec[]) : []),
      ] as AnyRec[]
    ).filter((it) => typeof it?.data === 'number');

    // ====== Aggregazione con distribuzione livelli per strutture/trappole ======
    const agg: Record<string, Agg> = {};
    const heroAgg: Record<string, { lvl: number; cnt: number }> = {};

    // 2a) Strutture e trappole (registriamo buckets di livello)
    for (const it of otherEntries) {
      const id = Number(it.data);
      const lvl = Math.max(0, Number(it.lvl ?? 0));
      const cnt = Math.max(1, Number(it.cnt ?? 1));
      const meta = IDMAP[id];
      if (!meta || meta.cat === 'hero') continue;
      const name = meta.name;

      const cur = agg[name] ?? { totalCnt: 0, minLvl: Infinity, buckets: [] };
      cur.totalCnt += cnt;
      cur.minLvl = Math.min(cur.minLvl, lvl);
      const b = cur.buckets.find(x => x.lvl === lvl);
      if (b) b.cnt += cnt; else cur.buckets.push({ lvl, cnt });
      agg[name] = cur;
    }

    // 2b) Eroi (manteniamo MAX livello, qty irrilevante)
    for (const it of heroEntries) {
      const id = Number(it.data);
      const lvl = Number(it.lvl ?? 0);
      const meta = IDMAP[id];
      if (!meta || meta.cat !== 'hero') continue;
      const name = meta.name;
      const prev = heroAgg[name];
      if (!prev) heroAgg[name] = { lvl, cnt: 1 };
      else if (lvl > prev.lvl) prev.lvl = lvl;
    }

    // ====== Confronto con CAPS ======
    const out:Row[]=[];
    if (typeof thv==='number') {
      const heroCapMap = CAPS_HERO[thv] || {};
      const capmap = CAPS2[thv as TH] || {};
      const capIndex = new Map<string,{name:string; cap:Cap}>();
      Object.entries(capmap).forEach(([name,cap])=> capIndex.set(normalizeName(name), {name,cap}));

      // 3a) Strutture/trappole: livello minimo + copie sotto-cap
      for(const [name,info] of Object.entries(agg)){
        const norm = normalizeName(name);
        const hit = capIndex.get(norm);
        if (!hit) continue;
        const { cap } = hit;
        if (cap.qty===0 && cap.lvl===0) continue; // non esiste a quel TH

        // quante copie sono sotto il livello cap?
        const belowCnt = info.buckets.reduce((acc, b) => acc + (b.lvl < cap.lvl ? b.cnt : 0), 0);

        const needQty = cap.qty > 0 && info.totalCnt < cap.qty;
        const needLvl = cap.lvl > 0 && belowCnt > 0;

        if (needQty || needLvl) {
          out.push({
            name,
            have: info.minLvl === Infinity ? 0 : info.minLvl,
            max: cap.lvl,
            foundCount: info.totalCnt,     // copie attuali
            targetQty: cap.qty             // copie richieste a quel TH
          });
        }
      }

      // 3b) Eroi come prima (solo livello)
      for (const [name, h] of Object.entries(heroAgg)) {
        const capLvl = heroCapMap[name as keyof typeof heroCapMap];
        if (typeof capLvl === 'number' && capLvl > 0 && h.lvl < capLvl) {
          out.push({ name, have: h.lvl, max: capLvl, foundCount: h.cnt });
        }
      }
    }

    // ====== Ordinamento ======
    const order = mode==='WAR'?WAR_ORDER:FARM_ORDER;
    const rank=(n:string)=>{ const i=order.findIndex(x=>normalizeName(n).includes(normalizeName(x))); return i===-1?999:i; };

    function belowCountFor(name: string, th?: number): number {
      if (!th) return 0;
      const cap = CAPS2[th as TH]?.[name];
      const rec = agg[name];
      if (!cap || !rec) return 0;
      return rec.buckets.reduce((acc,b)=> acc + (b.lvl < cap.lvl ? b.cnt : 0), 0);
    }

    out.sort((a,b)=>{
      // prima gap di quantità richieste vs trovate
      const qA = (a.targetQty ?? 0) - (a.foundCount ?? 0);
      const qB = (b.targetQty ?? 0) - (b.foundCount ?? 0);
      if (qA !== qB) return qB - qA;

      // poi chi ha più copie sotto-cap (solo strutture)
      const bcA = belowCountFor(a.name, thv);
      const bcB = belowCountFor(b.name, thv);
      if (bcA !== bcB) return bcB - bcA;

      // poi priorità WAR/FARM
      const ra=rank(a.name), rb=rank(b.name); if(ra!==rb) return ra-rb;

      // poi gap di livello
      const da=a.max-a.have, db=b.max-b.have; if(db!==da) return db-da;

      return a.name.localeCompare(b.name,'it');
    });
    setRows(out);

    // ====== Consigli (top 10) ======
    const tipsOut:string[]=[];
    const push=(needle:string)=>{
      for(const r of out){
        if(normalizeName(r.name).includes(normalizeName(needle))){
          const line=`${r.name}${formatQtyBadge(r.name, r.foundCount, r.targetQty, thv, agg)}: ${r.have} → ${r.max}`;
          if(!tipsOut.includes(line)){ tipsOut.push(line); if(tipsOut.length>=10) return true; }
        }
      }
      return false;
    };
    for(const k of order) if(push(k)) break;
    if(!tipsOut.length){
      for(const r of out){
        const line=`${r.name}${formatQtyBadge(r.name, r.foundCount, r.targetQty, thv, agg)}: ${r.have} → ${r.max}`;
        if(!tipsOut.includes(line)) tipsOut.push(line);
        if(tipsOut.length>=10) break;
      }
    }
    setTips(tipsOut);

    // ====== Summary ======
    setSummary(`${typeof thv==='number' ? `TH rilevato: ${thv}` : 'TH non rilevato'} · ${out.length} upgrade rilevati`);
  }

  function formatQtyBadge(
    name: string,
    found?: number,
    target?: number,
    th?: number,
    aggRef?: Record<string, Agg>
  ): string {
    const base = typeof target === 'number' ? ` ×${found ?? 0}/${target}` : (typeof found === 'number' ? ` ×${found}` : '');
    if (!th || !aggRef) return base;
    const cap = CAPS2[th as TH]?.[name];
    const rec = aggRef[name];
    if (!cap || !rec) return base;
    const below = rec.buckets.reduce((acc,b)=> acc + (b.lvl < cap.lvl ? b.cnt : 0), 0);
    return below > 0 ? `${base} (sotto-cap: ${below})` : base;
  }

  return (
    <main className="shell">

      {/* Banner in cima */}
      <div className="banner">
        <img src="/banner.png" alt="Upgrade Planner banner" className="banner-img" />
      </div>

      {/* Header pulito */}
      <header className="topbar">
        <div className="brand">
          <span className="logo">⚔️</span>
          <span className="title">Upgrade Planner</span>
        </div>
        <div className="toggle">
          <button className={`pill ${mode==='FARM'?'active':''}`} onClick={()=>setMode('FARM')} title="Ottimizza loot e tempi">FARM</button>
          <button className={`pill ${mode==='WAR'?'active':''}`} onClick={()=>setMode('WAR')} title="Ottimizza 3-stelle in CW">WAR</button>
        </div>
      </header>

      {/* Input JSON + summary */}
      <section className="card">
        <label className="label">Incolla qui il JSON del villaggio</label>
        <textarea className="textbox" value={raw} onChange={e=>setRaw(e.target.value)} placeholder='Accetta anche frammenti (es. "buildings2", "heroes2", "traps2")' />
        <div className="hint">{summary}</div>
      </section>

      {/* Consigli automatici */}
      <section className="card">
        <div className="card-title">Consigli automatici — {mode}</div>
        {tips.length? <ol className="list">{tips.map((t,i)=><li key={i}>{t}</li>)}</ol> : <div className="muted">Nessun consiglio disponibile.</div>}
        <div className="note">
          {mode==='FARM'?(
            <ul>
              <li><b>Risorse prima</b>: collettori/miniere/trivelle + depositi.</li>
              <li><b>Laboratorio sempre attivo</b> + accampamenti/caserme.</li>
              <li><b>Builder occupati</b>: usa i <i>muri</i> tra upgrade grossi.</li>
              <li><b>Difese pro-risorse</b>: maghi, torre bombe, tesla.</li>
            </ul>
          ):(
            <ul>
              <li><b>Attacco prima</b>: laboratorio + fabbriche (spell/dark spell).</li>
              <li><b>Esercito</b>: accampamenti e <i>Castello del Clan</i>.</li>
              <li><b>Eroi</b>: King/Queen/Minion/Warden/RC ai cap chiave.</li>
              <li><b>Difese WAR</b>: Aquila, Scatter, Infernali, X-Bow, Tesla, Spell Tower, Monolite.</li>
            </ul>
          )}
        </div>
      </section>

      {/* Elenco completo */}
      <section className="card">
        <div className="card-title">Elenco completo (senza raggruppamento)</div>
        {rows.length?(
          <ul className="list upgrades">
            {rows.map((r,i)=>{
              const delta = Math.max(0, r.max - r.have);
              const pct = Math.max(0, Math.min(100, Math.round((r.have / r.max) * 100)));
              const isHero = /re barbaro|regina|sorvegliante|campionessa|minion/i.test(r.name);
              const qtyText = formatQtyBadge(r.name, r.foundCount, r.targetQty, th);
              return (
                <li key={i} className={`row ${isHero?'hero':''}`}>
                  <div className="row-main">
                    <div className="row-title">
                      <span className="row-emoji">{isHero ? '👑' :
                        /infernal|infernale|monolite|aquila|scatter|arco|tesla|incantesimi|multi/i.test(r.name) ? '🛡️' :
                        /bomba|mina|trappola|giga/i.test(r.name) ? '⚠️' :
                        /deposito|miniera|collettore|trivella/i.test(r.name) ? '💰' :
                        /accampamento|caserma|castello|laboratorio|officina|fabbro|animali|eroi/i.test(r.name) ? '⚙️' : '📦'}
                      </span>
                      <b>{r.name}</b>
                      {qtyText && <span className="count">{qtyText}</span>}
                    </div>
                    <div className="levels">
                      <span className="lvl current">liv. {r.have}</span>
                      <div className="bar"><div className="bar-fill" style={{width: `${pct}%`}} /></div>
                      <span className="lvl target">→ {r.max}</span>
                      <span className={`delta ${delta===0?'done':''}`}>{delta===0?'MAX':`+${delta}`}</span>
                    </div>
                  </div>
                  <button className="copy-btn" onClick={()=>{navigator.clipboard.writeText(`${r.name}${qtyText}: ${r.have} -> ${r.max}`);}} title="Copia riga">⧉</button>
                </li>
              );
            })}
          </ul>
        ):<div className="muted">Niente da mostrare. Incolla il JSON oppure sei già al massimo per il tuo TH.</div>}
      </section>

      {/* CSS inlined */}
      <style jsx>{`
        :global(html,body){background:#0a0b0d;color:#e6e9ef;margin:0;padding:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial}
        :global(*){box-sizing:border-box}
        .shell{max-width:980px;margin:0 auto;padding:20px 16px}
        /* Banner */
        .banner{display:flex;justify-content:center;margin-bottom:16px}
        .banner-img{width:100%;max-width:960px;border-radius:12px;box-shadow:0 0 18px rgba(0,0,0,.5)}
        /* Header pulito */
        .topbar{display:flex;justify-content:space-between;align-items:center;background:linear-gradient(180deg,#0d1015,#0a0b0d);border:1px solid #171a20;border-radius:14px;padding:10px 16px;margin-bottom:14px}
        .brand{display:flex;align-items:center;gap:10px}
        .logo{font-size:22px}
        .title{font-weight:800;letter-spacing:.2px}
        .toggle{display:flex;gap:10px}
        .pill{border:1px solid #263244;background:#0e141d;color:#e6e9ef;padding:6px 16px;border-radius:999px;cursor:pointer;transition:.15s}
        .pill:hover{transform:translateY(-1px);border-color:#3b4e6a}
        .pill.active{border-color:#28b061;background:linear-gradient(#15321f,#0e1f15);box-shadow:0 0 0 1px #1c7d48 inset}
        /* Cards */
        .card{border:1px solid #171a20;background:linear-gradient(180deg,#0f1622,#0b0f15);border-radius:14px;padding:16px;margin-bottom:14px}
        .card-title{margin:0 0 10px;font-weight:800}
        .label{display:block;color:#9aa3b2;margin-bottom:6px}
        .textbox{width:100%;min-height:220px;border:1px solid #1b2230;border-radius:12px;background:#0a0e14;color:#e6e9ef;padding:12px 14px;font-family:ui-monospace,Consolas,Menlo,monospace;line-height:1.4;resize:vertical}
        .textbox:focus{outline:none;border-color:#3b82f6;box-shadow:0 0 0 3px #1a2f57}
        .hint{margin-top:8px;color:#98a3b3}
        /* Note */
        .note{margin-top:12px;border:1px dashed #2a2a2a;border-radius:12px;padding:10px 12px;background:#0b0b0c;color:#cfd4dc}
        .note ul{margin:0;padding-left:18px}
        /* Elenco */
        .list{margin:0;padding-left:20px;line-height:1.55}
        .upgrades{display:flex;flex-direction:column;gap:10px;padding-left:0;list-style:none}
        .row{display:flex;align-items:center;gap:10px;border:1px solid #171c25;background:linear-gradient(180deg,#0f151f,#0c1017);border-radius:12px;padding:10px 12px}
        .row.hero{border-color:#2a2135;background:linear-gradient(180deg,#171024,#120b1b)}
        .row-main{flex:1;min-width:0}
        .row-title{display:flex;align-items:center;gap:8px;margin-bottom:6px}
        .row-emoji{width:22px;text-align:center}
        .count{margin-left:6px;font-size:12px;color:#aab2c0;border:1px solid #283244;border-radius:6px;padding:1px 6px;background:#0a0e14}
        .levels{display:grid;grid-template-columns:auto 1fr auto auto;gap:10px;align-items:center}
        .lvl{font-variant-numeric:tabular-nums}
        .bar{height:8px;background:#121924;border:1px solid #1a2230;border-radius:999px;overflow:hidden}
        .bar-fill{height:100%;background:linear-gradient(90deg,#22c55e,#16a34a)}
        .delta{font-size:12px;padding:2px 8px;border:1px solid #283244;border-radius:999px;background:#0c121a;color:#bcd0ea}
        .delta.done{background:#0f1b14;border-color:#1a6c3f;color:#b7efce}
        .copy-btn{border:1px solid #263244;background:#0e131a;color:#d5deea;border-radius:10px;padding:6px 8px;cursor:pointer}
        .copy-btn:hover{transform:translateY(-1px);border-color:#3b4e6a}
        .muted{color:#9aa3af}
      `}</style>
    </main>
  );
}
