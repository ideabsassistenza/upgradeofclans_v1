'use client';
import React, { useEffect, useRef, useState } from 'react';

/* =========================================================
   Upgrade Planner — Villaggio Principale (TH10→TH17)
   - Parser tollerante input JSON
   - TH detect da Town Hall o entry 1000001
   - ID→Nome in italiano
   - CAPS Strutture (Excel v3) + CAPS Eroi (tabella immagine)
   - Modalità FARM / WAR (consigli automatici)
   - Esclusi equipaggiamenti eroi e Builder Base
   ========================================================= */

type Cat = 'hero'|'pet'|'defense'|'trap'|'resource'|'army'|'townhall'|'other';
type Meta = { name: string; cat: Cat };

const IDMAP: Record<number, Meta> = {
  // Heroes
  28000000:{name:'Re Barbaro',cat:'hero'},
  28000001:{name:'Regina degli Arcieri',cat:'hero'},
  28000002:{name:'Sorvegliante (Grand Warden)',cat:'hero'},
  28000004:{name:'Campionessa Reale',cat:'hero'},
  28000005:{name:'Principe Minion',cat:'hero'},
  // Pets (solo presenza, non usati nei caps)
  73000000:{name:'L.A.S.S.I',cat:'pet'},
  73000001:{name:'Gufo Elettrico',cat:'pet'},
  73000002:{name:'Yak Potente',cat:'pet'},
  73000003:{name:'Unicorno',cat:'pet'},
  // Town Hall
  1000001:{name:'Municipio (Giga)',cat:'townhall'},
  // Army & vario
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
  1000021:{name:'Arco X (X-Bow)',cat:'defense'},
  1000027:{name:'Torre Infernale',cat:'defense'},
  1000031:{name:'Artiglieria Aquila',cat:'defense'},
  1000032:{name:'Torre delle Bombe',cat:'defense'},
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

/* ---------------- util ---------------- */
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

/* ---------------- CAPS (Excel v3 + Eroi dall’immagine) ---------------- */
/* Nota: i valori qui sotto per le STRUTTURE sono quelli dell’ultimo Excel v3
   che avevamo integrato; gli EROI sono stati aggiornati esattamente secondo
   la tabella “All Hero levels as per every TownHall” (TH10→TH17). */

const CAPS: Record<number, Record<string, number>> = {
  "10": {
    "Accampamento": 8, "Caserma": 12, "Caserma nera": 7, "Laboratorio": 8, "Fabbrica incantesimi": 5, "Fabbrica incantesimi neri": 5,
    "Officina d’assedio (Workshop)": 0, "Fabbro (Blacksmith)": 3, "Sala degli Eroi (Hero Hall)": 4, "Casa degli Animali (Pet House)": 0,
    "Castello del Clan": 6, "Miniera d’Oro": 13, "Collettore d’Elisir": 13, "Deposito d’Oro": 11, "Deposito d’Elisir": 12,
    "Trivella d’Elisir Nero": 7, "Deposito d’Elisir Nero": 6,
    "Cannone": 13, "Torre degli Arcieri": 13, "Mortaio": 8, "Torre dello Stregone": 9, "Difesa Aerea": 8, "Volano (Air Sweeper)": 4, "Tesla Nascosta": 8,
    "Torre delle Bombe": 5, "Arco X (X-Bow)": 2, "Torre Infernale": 2, "Artiglieria Aquila": 0, "Scagliapietre (Scattershot)": 0,
    "Capanna del Costruttore": 0, "Torre degli Incantesimi": 0, "Monolite": 0, "Torre Multi-Arciere": 0, "Cannone a palle rimbalzanti": 0, "Torre Multi-Ingranaggio (Long Range)": 0, "Sputafuoco": 0,
    "Mura (sezioni)": 300, "Bomba": 6, "Trappola a Molla": 5, "Bomba Gigante": 6, "Bomba Aerea": 4, "Mina Aerea a Ricerca": 3, "Trappola Scheletrica": 4, "Trappola Tornado": 0, "Giga Bomba (solo TH17)": 0,
    // HERO caps (immagine)
    "Re Barbaro": 40, "Regina degli Arcieri": 40, "Principe Minion": 20, "Sorvegliante (Grand Warden)": 0, "Campionessa Reale": 0
  },
  "11": {
    "Accampamento": 9, "Caserma": 13, "Caserma nera": 8, "Laboratorio": 9, "Fabbrica incantesimi": 6, "Fabbrica incantesimi neri": 5,
    "Officina d’assedio (Workshop)": 0, "Fabbro (Blacksmith)": 4, "Sala degli Eroi (Hero Hall)": 5, "Casa degli Animali (Pet House)": 0,
    "Castello del Clan": 7, "Miniera d’Oro": 14, "Collettore d’Elisir": 14, "Deposito d’Oro": 12, "Deposito d’Elisir": 12,
    "Trivella d’Elisir Nero": 8, "Deposito d’Elisir Nero": 7,
    "Cannone": 15, "Torre degli Arcieri": 15, "Mortaio": 10, "Torre dello Stregone": 10, "Difesa Aerea": 9, "Volano (Air Sweeper)": 6, "Tesla Nascosta": 9,
    "Torre delle Bombe": 6, "Arco X (X-Bow)": 3, "Torre Infernale": 5, "Artiglieria Aquila": 1, "Scagliapietre (Scattershot)": 0,
    "Capanna del Costruttore": 0, "Torre degli Incantesimi": 0, "Monolite": 0, "Torre Multi-Arciere": 0, "Cannone a palle rimbalzanti": 0, "Torre Multi-Ingranaggio (Long Range)": 0, "Sputafuoco": 0,
    "Mura (sezioni)": 300, "Bomba": 7, "Trappola a Molla": 6, "Bomba Gigante": 6, "Bomba Aerea": 5, "Mina Aerea a Ricerca": 3, "Trappola Scheletrica": 4, "Trappola Tornado": 2, "Giga Bomba (solo TH17)": 0,
    "Re Barbaro": 50, "Regina degli Arcieri": 50, "Principe Minion": 30, "Sorvegliante (Grand Warden)": 20, "Campionessa Reale": 0
  },
  "12": {
    "Accampamento": 10, "Caserma": 14, "Caserma nera": 9, "Laboratorio": 10, "Fabbrica incantesimi": 6, "Fabbrica incantesimi neri": 6,
    "Officina d’assedio (Workshop)": 3, "Fabbro (Blacksmith)": 5, "Sala degli Eroi (Hero Hall)": 6, "Casa degli Animali (Pet House)": 0,
    "Castello del Clan": 8, "Miniera d’Oro": 15, "Collettore d’Elisir": 15, "Deposito d’Oro": 13, "Deposito d’Elisir": 13,
    "Trivella d’Elisir Nero": 9, "Deposito d’Elisir Nero": 8,
    "Cannone": 17, "Torre degli Arcieri": 17, "Mortaio": 12, "Torre dello Stregone": 11, "Difesa Aerea": 10, "Volano (Air Sweeper)": 7, "Tesla Nascosta": 10,
    "Torre delle Bombe": 7, "Arco X (X-Bow)": 4, "Torre Infernale": 6, "Artiglieria Aquila": 3, "Scagliapietre (Scattershot)": 0,
    "Capanna del Costruttore": 0, "Torre degli Incantesimi": 0, "Monolite": 0, "Torre Multi-Arciere": 0, "Cannone a palle rimbalzanti": 0, "Torre Multi-Ingranaggio (Long Range)": 0, "Sputafuoco": 0,
    "Mura (sezioni)": 300, "Bomba": 8, "Trappola a Molla": 7, "Bomba Gigante": 7, "Bomba Aerea": 6, "Mina Aerea a Ricerca": 3, "Trappola Scheletrica": 4, "Trappola Tornado": 3, "Giga Bomba (solo TH17)": 0,
    "Re Barbaro": 65, "Regina degli Arcieri": 65, "Principe Minion": 40, "Sorvegliante (Grand Warden)": 40, "Campionessa Reale": 25
  },
  "13": {
    "Accampamento": 11, "Caserma": 15, "Caserma nera": 10, "Laboratorio": 11, "Fabbrica incantesimi": 7, "Fabbrica incantesimi neri": 6,
    "Officina d’assedio (Workshop)": 5, "Fabbro (Blacksmith)": 6, "Sala degli Eroi (Hero Hall)": 7, "Casa degli Animali (Pet House)": 0,
    "Castello del Clan": 9, "Miniera d’Oro": 15, "Collettore d’Elisir": 15, "Deposito d’Oro": 14, "Deposito d’Elisir": 14,
    "Trivella d’Elisir Nero": 9, "Deposito d’Elisir Nero": 8,
    "Cannone": 19, "Torre degli Arcieri": 19, "Mortaio": 13, "Torre dello Stregone": 13, "Difesa Aerea": 11, "Volano (Air Sweeper)": 7, "Tesla Nascosta": 12,
    "Torre delle Bombe": 8, "Arco X (X-Bow)": 5, "Torre Infernale": 7, "Artiglieria Aquila": 4, "Scagliapietre (Scattershot)": 2,
    "Capanna del Costruttore": 0, "Torre degli Incantesimi": 0, "Monolite": 0, "Torre Multi-Arciere": 0, "Cannone a palle rimbalzanti": 0, "Torre Multi-Ingranaggio (Long Range)": 0, "Sputafuoco": 0,
    "Mura (sezioni)": 325, "Bomba": 9, "Trappola a Molla": 8, "Bomba Gigante": 7, "Bomba Aerea": 8, "Mina Aerea a Ricerca": 4, "Trappola Scheletrica": 4, "Trappola Tornado": 3, "Giga Bomba (solo TH17)": 0,
    "Re Barbaro": 75, "Regina degli Arcieri": 75, "Principe Minion": 50, "Sorvegliante (Grand Warden)": 50, "Campionessa Reale": 30
  },
  "14": {
    "Accampamento": 11, "Caserma": 16, "Caserma nera": 11, "Laboratorio": 12, "Fabbrica incantesimi": 7, "Fabbrica incantesimi neri": 6,
    "Officina d’assedio (Workshop)": 6, "Fabbro (Blacksmith)": 7, "Sala degli Eroi (Hero Hall)": 8, "Casa degli Animali (Pet House)": 4,
    "Castello del Clan": 10, "Miniera d’Oro": 16, "Collettore d’Elisir": 16, "Deposito d’Oro": 15, "Deposito d’Elisir": 15,
    "Trivella d’Elisir Nero": 10, "Deposito d’Elisir Nero": 9,
    "Cannone": 20, "Torre degli Arcieri": 20, "Mortaio": 14, "Torre dello Stregone": 14, "Difesa Aerea": 12, "Volano (Air Sweeper)": 7, "Tesla Nascosta": 13,
    "Torre delle Bombe": 9, "Arco X (X-Bow)": 6, "Torre Infernale": 8, "Artiglieria Aquila": 5, "Scagliapietre (Scattershot)": 3,
    "Capanna del Costruttore": 4, "Torre degli Incantesimi": 0, "Monolite": 0, "Torre Multi-Arciere": 0, "Cannone a palle rimbalzanti": 0, "Torre Multi-Ingranaggio (Long Range)": 0, "Sputafuoco": 0,
    "Mura (sezioni)": 15, "Bomba": 10, "Trappola a Molla": 9, "Bomba Gigante": 8, "Bomba Aerea": 9, "Mina Aerea a Ricerca": 4, "Trappola Scheletrica": 4, "Trappola Tornado": 3, "Giga Bomba (solo TH17)": 0,
    "Re Barbaro": 80, "Regina degli Arcieri": 80, "Principe Minion": 60, "Sorvegliante (Grand Warden)": 55, "Campionessa Reale": 35
  },
  "15": {
    "Accampamento": 12, "Caserma": 17, "Caserma nera": 11, "Laboratorio": 13, "Fabbrica incantesimi": 8, "Fabbrica incantesimi neri": 6,
    "Officina d’assedio (Workshop)": 7, "Fabbro (Blacksmith)": 8, "Sala degli Eroi (Hero Hall)": 9, "Casa degli Animali (Pet House)": 8,
    "Castello del Clan": 11, "Miniera d’Oro": 16, "Collettore d’Elisir": 16, "Deposito d’Oro": 16, "Deposito d’Elisir": 16,
    "Trivella d’Elisir Nero": 11, "Deposito d’Elisir Nero": 10,
    "Cannone": 21, "Torre degli Arcieri": 21, "Mortaio": 15, "Torre dello Stregone": 15, "Difesa Aerea": 13, "Volano (Air Sweeper)": 7, "Tesla Nascosta": 14,
    "Torre delle Bombe": 10, "Arco X (X-Bow)": 7, "Torre Infernale": 9, "Artiglieria Aquila": 6, "Scagliapietre (Scattershot)": 4,
    "Capanna del Costruttore": 5, "Torre degli Incantesimi": 3, "Monolite": 2, "Torre Multi-Arciere": 1, "Cannone a palle rimbalzanti": 1, "Torre Multi-Ingranaggio (Long Range)": 1, "Sputafuoco": 1,
    "Mura (sezioni)": 16, "Bomba": 11, "Trappola a Molla": 10, "Bomba Gigante": 9, "Bomba Aerea": 10, "Mina Aerea a Ricerca": 5, "Trappola Scheletrica": 4, "Trappola Tornado": 3, "Giga Bomba (solo TH17)": 0,
    "Re Barbaro": 90, "Regina degli Arcieri": 90, "Principe Minion": 70, "Sorvegliante (Grand Warden)": 60, "Campionessa Reale": 40
  },
  "16": {
    "Accampamento": 12, "Caserma": 18, "Caserma nera": 11, "Laboratorio": 14, "Fabbrica incantesimi": 8, "Fabbrica incantesimi neri": 6,
    "Officina d’assedio (Workshop)": 7, "Fabbro (Blacksmith)": 9, "Sala degli Eroi (Hero Hall)": 10, "Casa degli Animali (Pet House)": 10,
    "Castello del Clan": 12, "Miniera d’Oro": 16, "Collettore d’Elisir": 16, "Deposito d’Oro": 17, "Deposito d’Elisir": 17,
    "Trivella d’Elisir Nero": 11, "Deposito d’Elisir Nero": 11,
    "Cannone": 22, "Torre degli Arcieri": 22, "Mortaio": 16, "Torre dello Stregone": 16, "Difesa Aerea": 14, "Volano (Air Sweeper)": 8, "Tesla Nascosta": 15,
    "Torre delle Bombe": 11, "Arco X (X-Bow)": 11, "Torre Infernale": 10, "Artiglieria Aquila": 6, "Scagliapietre (Scattershot)": 4,
    "Capanna del Costruttore": 5, "Torre degli Incantesimi": 4, "Monolite": 3, "Torre Multi-Arciere": 2, "Cannone a palle rimbalzanti": 2, "Torre Multi-Ingranaggio (Long Range)": 2, "Sputafuoco": 2,
    "Mura (sezioni)": 17, "Bomba": 12, "Trappola a Molla": 10, "Bomba Gigante": 10, "Bomba Aerea": 11, "Mina Aerea a Ricerca": 6, "Trappola Scheletrica": 4, "Trappola Tornado": 3, "Giga Bomba (solo TH17)": 0,
    "Re Barbaro": 95, "Regina degli Arcieri": 95, "Principe Minion": 80, "Sorvegliante (Grand Warden)": 70, "Campionessa Reale": 45
  },
  "17": {
    "Accampamento": 12, "Caserma": 18, "Caserma nera": 11, "Laboratorio": 15, "Fabbrica incantesimi": 8, "Fabbrica incantesimi neri": 6,
    "Officina d’assedio (Workshop)": 7, "Fabbro (Blacksmith)": 9, "Sala degli Eroi (Hero Hall)": 11, "Casa degli Animali (Pet House)": 11,
    "Castello del Clan": 12, "Miniera d’Oro": 18, "Collettore d’Elisir": 17, "Deposito d’Oro": 18, "Deposito d’Elisir": 18,
    "Trivella d’Elisir Nero": 12, "Deposito d’Elisir Nero": 12,
    "Cannone": 23, "Torre degli Arcieri": 23, "Mortaio": 17, "Torre dello Stregone": 17, "Difesa Aerea": 15, "Volano (Air Sweeper)": 8, "Tesla Nascosta": 16,
    "Torre delle Bombe": 12, "Arco X (X-Bow)": 12, "Torre Infernale": 11, "Artiglieria Aquila": 7, "Scagliapietre (Scattershot)": 5,
    "Capanna del Costruttore": 5, "Torre degli Incantesimi": 5, "Monolite": 4, "Torre Multi-Arciere": 3, "Cannone a palle rimbalzanti": 3, "Torre Multi-Ingranaggio (Long Range)": 3, "Sputafuoco": 3,
    "Mura (sezioni)": 18, "Bomba": 13, "Trappola a Molla": 11, "Bomba Gigante": 11, "Bomba Aerea": 12, "Mina Aerea a Ricerca": 7, "Trappola Scheletrica": 4, "Trappola Tornado": 3, "Giga Bomba (solo TH17)": 3,
    "Re Barbaro": 100, "Regina degli Arcieri": 100, "Principe Minion": 90, "Sorvegliante (Grand Warden)": 75, "Campionessa Reale": 50
  }
};

/* ---------------- Priorità ---------------- */
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

/* ---------------- Component ---------------- */
type Row = { name: string; have: number; max: number; foundCount?: number; };
const fmtRow = (r:Row)=> `${r.name}: ${r.have} → ${r.max}`;

export default function Page(){
  const [raw,setRaw]=useState('');
  const [mode,setMode]=useState<'FARM'|'WAR'>('WAR');
  const [th,setTH]=useState<number>();
  const [rows,setRows]=useState<Row[]>([]);
  const [tips,setTips]=useState<string[]>([]);
  const tRef = useRef<any>(null);

  useEffect(()=>{
    clearTimeout(tRef.current);
    tRef.current=setTimeout(()=>analyze(raw),180);
    return ()=>clearTimeout(tRef.current);
  },[raw,mode]);

  function analyze(input:string){
    const json=tolerantParse(input);
    const thv=detectTH(json);
    setTH(thv);

    const entries:any[]=[]
      .concat(Array.isArray(json.buildings2)?json.buildings2:[])
      .concat(Array.isArray(json.buildings)?json.buildings:[])
      .concat(Array.isArray(json.heroes2)?json.heroes2:[])
      .concat(Array.isArray(json.heroes)?json.heroes:[])
      .concat(Array.isArray(json.traps2)?json.traps2:[])
      .concat(Array.isArray(json.traps)?json.traps:[])
      .concat(Array.isArray(json.pets)?json.pets:[]);

    const agg:Record<string,{lvl:number;cnt:number}> = {};
    for(const it of entries){
      const id=Number(it?.data); const lvl=Number(it?.lvl ?? 0);
      if(!id || Number.isNaN(lvl)) continue;
      const meta=IDMAP[id]; if(!meta) continue; // ignora non mappati
      const name=meta.name; const cnt=Math.max(1, Number(it?.cnt ?? 1));
      const prev=agg[name];
      if(!prev) agg[name]={lvl, cnt};
      else { if(lvl>prev.lvl) prev.lvl=lvl; prev.cnt+=cnt; }
    }

    const capmap = thv ? CAPS[thv] || {} : {};
    const capIndex:Record<string,number> = Object.fromEntries(Object.entries(capmap).map(([k,v])=>[normalizeName(k),v]));
    const out:Row[]=[];
    for(const [name,info] of Object.entries(agg)){
      const cap = capIndex[normalizeName(name)];
      if(typeof cap==='number' && cap>0 && info.lvl<cap) out.push({name,have:info.lvl,max:cap,foundCount:info.cnt});
    }

    const order = mode==='WAR'?WAR_ORDER:FARM_ORDER;
    const rank=(n:string)=>{ const i=order.findIndex(x=>normalizeName(n).includes(normalizeName(x))); return i===-1?999:i; };
    out.sort((a,b)=>{
      const ra=rank(a.name), rb=rank(b.name); if(ra!==rb) return ra-rb;
      const da=a.max-a.have, db=b.max-b.have; if(db!==da) return db-da;
      return a.name.localeCompare(b.name,'it');
    });

    setRows(out);

    const tipsOut:string[]=[];
    const push=(needle:string)=>{
      for(const r of out){ if(normalizeName(r.name).includes(normalizeName(needle))){ const line=fmtRow(r); if(!tipsOut.includes(line)){ tipsOut.push(line); if(tipsOut.length>=10) return true; } } }
      return false;
    };
    for(const k of order) if(push(k)) break;
    if(!tipsOut.length){ for(const r of out){ const line=fmtRow(r); if(!tipsOut.includes(line)) tipsOut.push(line); if(tipsOut.length>=10) break; } }
    setTips(tipsOut);
  }

  return (
    <main className="shell">
      <header className="topbar sticky">
  <div className="brand">
    <span className="logo">⚔️</span>
    <div className="titles">
      <span className="title">Upgrade Planner</span>
      <span className="subtitle">Main Village · TH{typeof th==='number' ? th : "?"}</span>
    </div>
  </div>

  <div className="actions">
    <div className="toggle">
      <button
        className={`pill ${mode==='FARM'?'active':''}`}
        onClick={()=>setMode('FARM')}
        aria-pressed={mode==='FARM'}
        title="Ottimizza loot e tempi"
      >FARM</button>
      <button
        className={`pill ${mode==='WAR'?'active':''}`}
        onClick={()=>setMode('WAR')}
        aria-pressed={mode==='WAR'}
        title="Ottimizza 3-stelle in CW"
      >WAR</button>
    </div>
    <div className="stats">
      <span className="chip">
        {rows.length ? `${rows.length} upgrade` : '0 upgrade'}
      </span>
      <span className={`chip ${th?'ok':'muted'}`}>TH {th ?? '—'}</span>
    </div>
  </div>
</header>


      <section className="card">
        <label className="label">Incolla qui il JSON del villaggio</label>
        <textarea className="textbox" value={raw} onChange={e=>setRaw(e.target.value)} placeholder='Accetta anche frammenti ("buildings2", "heroes2", "traps2" …)' />
        <div className="hint">
          {th?<>TH rilevato: <b>{th}</b></>:<>TH non rilevato</>}
          <span className="dot">•</span>
          {rows.length? <>{rows.length} upgrade rilevati</> : <>nessun upgrade rilevato</>}
        </div>
      </section>

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
              <li><b>Eroi</b>: livelli chiave (King/Queen/Minion/Warden/RC).</li>
              <li><b>Difese WAR</b>: Aquila, Scatter, Infernali, Arco X, Tesla, Spell Tower, Monolite.</li>
            </ul>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-title">Elenco completo (senza raggruppamento)</div>
      {rows.length ? (
  <ul className="list upgrades">
    {rows.map((r,i)=>{
      const delta = Math.max(0, r.max - r.have);
      const pct = Math.max(0, Math.min(100, Math.round((r.have / r.max) * 100)));
      const isHero = /re barbaro|regina|sorvegliante|campionessa|principe minion/i.test(r.name);
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
              {typeof r.foundCount==='number' && <span className="count">×{r.foundCount}</span>}
            </div>

            <div className="levels">
              <span className="lvl current">liv. {r.have}</span>
              <div className="bar">
                <div className="bar-fill" style={{width: `${pct}%`}} />
              </div>
              <span className="lvl target">→ {r.max}</span>
              <span className={`delta ${delta===0?'done':''}`}>{delta===0?'MAX':`+${delta}`}</span>
            </div>
          </div>

          <button className="copy-btn" onClick={()=>{
            navigator.clipboard.writeText(`${r.name}: ${r.have} -> ${r.max}`);
          }} title="Copia riga">
            ⧉
          </button>
        </li>
      );
    })}
  </ul>
) : (
  <div className="empty">
    <div className="empty-emoji">🗂️</div>
    <div className="empty-text">
      Nessun upgrade da mostrare. Incolla il JSON oppure sei già al massimo per il tuo TH.
    </div>
  </div>
)}

      </section>

      <style jsx>{`
  :global(html,body){background:#0a0b0d;color:#e6e9ef}
  :global(*){box-sizing:border-box}

  .shell{max-width:980px;margin:0 auto;padding:20px 16px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial}

  /* Topbar */
  .topbar.sticky{position:sticky;top:0;z-index:10;background:linear-gradient(180deg,#0b0d10,rgba(11,13,16,.6));backdrop-filter:blur(6px);border:1px solid #171a20;border-radius:14px;padding:10px 12px;margin-bottom:14px}
  .brand{display:flex;align-items:center;gap:10px}
  .logo{font-size:20px}
  .titles{display:flex;flex-direction:column;line-height:1.1}
  .title{font-weight:800;letter-spacing:.2px}
  .subtitle{font-size:12px;color:#9aa3b2}
  .actions{display:flex;align-items:center;gap:12px}
  .toggle{display:flex;gap:8px}
  .pill{border:1px solid #263244;background:linear-gradient(#121821,#0e141d);color:#e6e9ef;padding:6px 14px;border-radius:999px;cursor:pointer;transition:all .15s}
  .pill:hover{transform:translateY(-1px);border-color:#3b4e6a}
  .pill.active{border-color:#28b061;background:linear-gradient(#15321f,#0e1f15);box-shadow:0 0 0 1px #1c7d48 inset}
  .stats{display:flex;gap:8px}
  .chip{font-size:12px;padding:4px 10px;border:1px solid #2a3444;border-radius:999px;background:#0e131a;color:#cfd6e3}
  .chip.ok{border-color:#1a6c3f;background:#0f1b14;color:#b7efce}
  .chip.muted{opacity:.7}

  /* Cards */
  .card{border:1px solid #171a20;background:
    radial-gradient(800px 400px at -100px -100px,#0f1622 0%,#0c1118 50%,#0a0b0d 100%);
    border-radius:14px;padding:14px 16px;margin-bottom:14px}
  .card-title{font-weight:800;margin:2px 0 12px}

  /* Text area */
  .label{display:block;color:#9aa3b2;margin-bottom:8px}
  .textbox{width:100%;min-height:220px;border:1px solid #1b2230;border-radius:12px;background:#0a0e14;color:#e6e9ef;padding:12px 14px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;line-height:1.4;resize:vertical}
  .textbox:focus{outline:none;border-color:#3b82f6;box-shadow:0 0 0 3px #1a2f57}
  .hint{display:flex;gap:8px;align-items:center;color:#98a3b3;margin-top:8px}
  .dot{opacity:.5}

  /* Empty state */
  .empty{display:flex;align-items:center;gap:12px;color:#9aa3b2;padding:8px 0}
  .empty-emoji{font-size:20px}

  /* List */
  .list{margin:0;padding-left:0;list-style:none}
  .upgrades{display:flex;flex-direction:column;gap:10px}

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
`}</style>

    </main>
  );
}
