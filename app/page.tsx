'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * Upgrade Planner — Villaggio Principale
 * - Incolla JSON (accetta frammenti: buildings2, buildings, heroes2, traps2, pets…)
 * - Esclusi: equipaggiamenti eroi + Base del Costruttore
 * - Nomi ITA + cap SOLO dalla tabella Excel di Serge (TH10→TH17)
 * - Dedup: per ciascun nome si prende il livello MAX trovato e si sommano le copie
 * - Modalità FARM / WAR con consigli automatici (pro)
 * - Nessun raggruppamento nell’elenco
 */

type Cat = 'hero'|'pet'|'defense'|'trap'|'resource'|'army'|'townhall'|'other';
type Meta = { name: string; cat: Cat };

/** Mappa ID→Nome (ITA) + categoria */
const IDMAP: Record<number, Meta> = {
  // Eroi
  28000000:{name:'Re Barbaro',cat:'hero'},
  28000001:{name:'Regina degli Arcieri',cat:'hero'},
  28000002:{name:'Gran Sorvegliante',cat:'hero'},
  28000004:{name:'Campionessa Reale',cat:'hero'},
  // Pet (solo per TH detect, non usiamo equip)
  73000000:{name:'L.A.S.S.I',cat:'pet'},
  73000001:{name:'Gufo Elettrico',cat:'pet'},
  73000002:{name:'Yak Potente',cat:'pet'},
  73000003:{name:'Unicorno',cat:'pet'},
  // Municipio
  1000001:{name:'Municipio (Giga)',cat:'townhall'},
  // Difese
  1000008:{name:'Cannone',cat:'defense'},
  1000009:{name:'Torre degli Arcieri',cat:'defense'},
  1000010:{name:'Muro',cat:'defense'},
  1000011:{name:'Torre dello Stregone',cat:'defense'},
  1000012:{name:'Difesa Aerea',cat:'defense'},
  1000013:{name:'Mortaio',cat:'defense'},
  1000019:{name:'Tesla Nascosta',cat:'defense'},
  1000021:{name:'Balestra',cat:'defense'},
  1000027:{name:'Torre Infernale',cat:'defense'},
  1000028:{name:'Spingiaria Aerea',cat:'defense'},
  1000031:{name:'Artiglieria Aquila',cat:'defense'},
  1000032:{name:'Torre delle Bombe',cat:'defense'},
  1000067:{name:'Lanciascaglie (Scattershot)',cat:'defense'},
  1000072:{name:'Torre degli Incantesimi',cat:'defense'},
  1000077:{name:'Monolite',cat:'defense'},
  1000084:{name:'Torre Multi-Arceri',cat:'defense'},
  1000085:{name:'Cannone a Palle Rimbalzanti',cat:'defense'},
  1000079:{name:'Torre Multi-Ingranaggio (Long Range)',cat:'defense'},
  1000089:{name:'Sputafuoco',cat:'defense'},
  1000015:{name:'Capanna del Costruttore',cat:'defense'},
  // Trappole
  12000000:{name:'Bomba',cat:'trap'},
  12000001:{name:'Trappola a Molla',cat:'trap'},
  12000002:{name:'Bomba Gigante',cat:'trap'},
  12000005:{name:'Bomba Aerea',cat:'trap'},
  12000006:{name:'Mina Aerea a Ricerca',cat:'trap'},
  12000008:{name:'Trappola Scheletrica',cat:'trap'},
  12000016:{name:'Trappola Tornado',cat:'trap'},
  12000020:{name:'Giga Bomba',cat:'trap'},
  // Risorse
  1000004:{name:"Miniera d'Oro",cat:'resource'},
  1000005:{name:"Deposito d'Oro",cat:'resource'},
  1000002:{name:"Estrattore d'Elisir",cat:'resource'},
  1000003:{name:"Deposito d'Elisir",cat:'resource'},
  1000023:{name:"Trivella d'Elisir Nero",cat:'resource'},
  1000024:{name:"Deposito d'Elisir Nero",cat:'resource'},
  // Armata
  1000000:{name:'Campo d’Addestramento',cat:'army'},
  1000006:{name:'Caserma',cat:'army'},
  1000026:{name:'Caserma Nera',cat:'army'},
  1000007:{name:'Laboratorio',cat:'army'},
  1000020:{name:'Fabbrica degli Incantesimi',cat:'army'},
  1000029:{name:'Fabbrica degli Incantesimi Neri',cat:'army'},
  1000059:{name:"Officina d'Assedio",cat:'army'},
  1000068:{name:'Casa degli Animali (Pet House)',cat:'army'},
  1000070:{name:'Fabbro (Blacksmith)',cat:'army'},
  1000071:{name:'Sala degli Eroi (Hero Hall)',cat:'army'},
  1000014:{name:'Castello del Clan',cat:'army'},
};

/** Parser tollerante per incolli “sporchi” */
function tolerantParse(raw: string): any {
  let t = (raw || '').trim();
  if (!t) return {};
  if (!t.startsWith('{') && !t.startsWith('[')) t = '{' + t + '}';
  t = t.replace(/,(\s*[}\]])/g, '$1');
  const bal = (s: string, o: string, c: string) =>
    (s.match(new RegExp('\\' + o, 'g')) || []).length - (s.match(new RegExp('\\' + c, 'g')) || []).length;
  let d = bal(t,'{','}'); if (d>0) t += '}'.repeat(d); else if (d<0) t = t.slice(0,d);
  d = bal(t,'[',']');     if (d>0) t += ']'.repeat(d); else if (d<0) t = t.slice(0,d);
  try { return JSON.parse(t); } catch { return {}; }
}

function deepFindNumber(obj:any, keys:string[]): number|undefined {
  try {
    const st=[obj];
    while(st.length){
      const cur=st.pop();
      if(!cur||typeof cur!=='object') continue;
      for(const k of keys){
        if(Object.prototype.hasOwnProperty.call(cur,k)){
          const v=(cur as any)[k];
          if(typeof v==='number') return v;
        }
      }
      for(const v of Object.values(cur)) if(v&&typeof v==='object') st.push(v);
    }
  } catch {}
  return undefined;
}

function detectTH(json:any): number|undefined {
  const explicit = deepFindNumber(json,['townHallLevel','th','thLevel','town_hall']);
  if(explicit && explicit>=1 && explicit<=20) return explicit;

  const scan = (arr?:any[])=>{
    if(!Array.isArray(arr)) return;
    for(const it of arr){
      if(it && Number(it.data)===1000001 && typeof it.lvl==='number'){
        const th=Number(it.lvl); if(th>=1&&th<=20) return th;
      }
    }
  };
  return scan(json.buildings) ?? scan(json.buildings2) ??
         (Array.isArray(json.pets)&&json.pets.length ? 14 : undefined);
}

/** CAP **SOLO** da Excel (immagine/valori forniti da Serge). */
type Caps = Record<string, number>;
const EXCEL_CAPS: Record<number, Caps> = {
  // TH10
  10:{
    'Campo d’Addestramento':8,'Caserma':12,'Caserma Nera':8,'Laboratorio':8,
    'Fabbrica degli Incantesimi':5,'Fabbrica degli Incantesimi Neri':4,"Officina d'Assedio":2,
    'Fabbro (Blacksmith)':0,'Sala degli Eroi (Hero Hall)':0,'Casa degli Animali (Pet House)':0,
    'Castello del Clan':6,"Miniera d'Oro":13,"Deposito d'Oro":11,"Estrattore d'Elisir":13,"Deposito d'Elisir":11,"Trivella d'Elisir Nero":6,"Deposito d'Elisir Nero":6,
    'Cannone':13,'Torre degli Arcieri':13,'Muro':11,'Mortaio':8,'Torre dello Stregone':9,'Difesa Aerea':8,'Tesla Nascosta':8,'Spingiaria Aerea':5,'Balestra':4,'Torre Infernale':3,'Torre delle Bombe':5,
    'Artiglieria Aquila':0,'Lanciascaglie (Scattershot)':0,'Torre degli Incantesimi':0,'Monolite':0,'Torre Multi-Arceri':0,'Cannone a Palle Rimbalzanti':0,'Torre Multi-Ingranaggio (Long Range)':0,'Sputafuoco':0,
    'Bomba':7,'Trappola a Molla':5,'Bomba Gigante':4,'Bomba Aerea':4,'Mina Aerea a Ricerca':3,'Trappola Scheletrica':4,'Trappola Tornado':0,'Giga Bomba':0,
    'Re Barbaro':40,'Regina degli Arcieri':40,'Gran Sorvegliante':0,'Campionessa Reale':0
  },
  // TH11
  11:{
    'Campo d’Addestramento':8,'Caserma':13,'Caserma Nera':9,'Laboratorio':9,
    'Fabbrica degli Incantesimi':6,'Fabbrica degli Incantesimi Neri':5,"Officina d'Assedio":3,
    'Fabbro (Blacksmith)':0,'Sala degli Eroi (Hero Hall)':0,'Casa degli Animali (Pet House)':0,
    'Castello del Clan':7,"Miniera d'Oro":14,"Deposito d'Oro":12,"Estrattore d'Elisir":14,"Deposito d'Elisir":12,"Trivella d'Elisir Nero":7,"Deposito d'Elisir Nero":7,
    'Cannone':15,'Torre degli Arcieri':15,'Muro':12,'Mortaio':11,'Torre dello Stregone':10,'Difesa Aerea':9,'Tesla Nascosta':9,'Spingiaria Aerea':6,'Balestra':5,'Torre Infernale':5,'Torre delle Bombe':6,
    'Artiglieria Aquila':2,'Lanciascaglie (Scattershot)':0,'Torre degli Incantesimi':0,'Monolite':0,'Torre Multi-Arceri':0,'Cannone a Palle Rimbalzanti':0,'Torre Multi-Ingranaggio (Long Range)':0,'Sputafuoco':0,
    'Bomba':8,'Trappola a Molla':6,'Bomba Gigante':5,'Bomba Aerea':5,'Mina Aerea a Ricerca':3,'Trappola Scheletrica':4,'Trappola Tornado':2,'Giga Bomba':0,
    'Re Barbaro':50,'Regina degli Arcieri':50,'Gran Sorvegliante':20,'Campionessa Reale':0
  },
  // TH12
  12:{
    'Campo d’Addestramento':8,'Caserma':14,'Caserma Nera':10,'Laboratorio':10,
    'Fabbrica degli Incantesimi':6,'Fabbrica degli Incantesimi Neri':5,"Officina d'Assedio":4,
    'Fabbro (Blacksmith)':0,'Sala degli Eroi (Hero Hall)':0,'Casa degli Animali (Pet House)':0,
    'Castello del Clan':8,"Miniera d'Oro":14,"Deposito d'Oro":13,"Estrattore d'Elisir":14,"Deposito d'Elisir":13,"Trivella d'Elisir Nero":8,"Deposito d'Elisir Nero":8,
    'Cannone':17,'Torre degli Arcieri':17,'Muro':14,'Mortaio':12,'Torre dello Stregone':11,'Difesa Aerea':10,'Tesla Nascosta':10,'Spingiaria Aerea':7,'Balestra':6,'Torre Infernale':6,'Torre delle Bombe':7,
    'Artiglieria Aquila':3,'Lanciascaglie (Scattershot)':0,'Torre degli Incantesimi':0,'Monolite':0,'Torre Multi-Arceri':0,'Cannone a Palle Rimbalzanti':0,'Torre Multi-Ingranaggio (Long Range)':0,'Sputafuoco':0,
    'Bomba':8,'Trappola a Molla':7,'Bomba Gigante':5,'Bomba Aerea':6,'Mina Aerea a Ricerca':3,'Trappola Scheletrica':4,'Trappola Tornado':3,'Giga Bomba':0,
    'Re Barbaro':65,'Regina degli Arcieri':65,'Gran Sorvegliante':40,'Campionessa Reale':0
  },
  // TH13
  13:{
    'Campo d’Addestramento':9,'Caserma':15,'Caserma Nera':11,'Laboratorio':11,
    'Fabbrica degli Incantesimi':7,'Fabbrica degli Incantesimi Neri':5,"Officina d'Assedio":5,
    'Fabbro (Blacksmith)':0,'Sala degli Eroi (Hero Hall)':0,'Casa degli Animali (Pet House)':0,
    'Castello del Clan':9,"Miniera d'Oro":15,"Deposito d'Oro":14,"Estrattore d'Elisir":15,"Deposito d'Elisir":14,"Trivella d'Elisir Nero":8,"Deposito d'Elisir Nero":8,
    'Cannone':19,'Torre degli Arcieri':19,'Muro':14,'Mortaio':13,'Torre dello Stregone':13,'Difesa Aerea':11,'Tesla Nascosta':12,'Spingiaria Aerea':7,'Balestra':8,'Torre Infernale':7,'Torre delle Bombe':8,
    'Artiglieria Aquila':4,'Lanciascaglie (Scattershot)':2,'Torre degli Incantesimi':0,'Monolite':0,'Torre Multi-Arceri':0,'Cannone a Palle Rimbalzanti':0,'Torre Multi-Ingranaggio (Long Range)':0,'Sputafuoco':0,
    'Bomba':9,'Trappola a Molla':8,'Bomba Gigante':7,'Bomba Aerea':8,'Mina Aerea a Ricerca':4,'Trappola Scheletrica':4,'Trappola Tornado':3,'Giga Bomba':0,
    'Re Barbaro':75,'Regina degli Arcieri':75,'Gran Sorvegliante':50,'Campionessa Reale':25
  },
  // TH14
  14:{
    'Campo d’Addestramento':10,'Caserma':16,'Caserma Nera':11,'Laboratorio':12,
    'Fabbrica degli Incantesimi':8,'Fabbrica degli Incantesimi Neri':7,"Officina d'Assedio":6,
    'Fabbro (Blacksmith)':7,'Sala degli Eroi (Hero Hall)':11,'Casa degli Animali (Pet House)':4,
    'Castello del Clan':10,"Miniera d'Oro":16,"Deposito d'Oro":15,"Estrattore d'Elisir":16,"Deposito d'Elisir":15,"Trivella d'Elisir Nero":9,"Deposito d'Elisir Nero":9,
    'Cannone':20,'Torre degli Arcieri':20,'Muro':15,'Mortaio':14,'Torre dello Stregone':14,'Difesa Aerea':12,'Tesla Nascosta':13,'Spingiaria Aerea':7,'Balestra':9,'Torre Infernale':8,'Torre delle Bombe':9,
    'Artiglieria Aquila':5,'Lanciascaglie (Scattershot)':3,'Torre degli Incantesimi':0,'Monolite':0,'Torre Multi-Arceri':0,'Cannone a Palle Rimbalzanti':0,'Torre Multi-Ingranaggio (Long Range)':0,'Sputafuoco':0,
    'Bomba':10,'Trappola a Molla':9,'Bomba Gigante':8,'Bomba Aerea':9,'Mina Aerea a Ricerca':4,'Trappola Scheletrica':4,'Trappola Tornado':3,'Giga Bomba':0,
    'Re Barbaro':85,'Regina degli Arcieri':85,'Gran Sorvegliante':60,'Campionessa Reale':30
  },
  // TH15
  15:{
    'Campo d’Addestramento':12,'Caserma':17,'Caserma Nera':12,'Laboratorio':13,
    'Fabbrica degli Incantesimi':8,'Fabbrica degli Incantesimi Neri':7,"Officina d'Assedio":7,
    'Fabbro (Blacksmith)':8,'Sala degli Eroi (Hero Hall)':12,'Casa degli Animali (Pet House)':8,
    'Castello del Clan':11,"Miniera d'Oro":16,"Deposito d'Oro":16,"Estrattore d'Elisir":16,"Deposito d'Elisir":16,"Trivella d'Elisir Nero":10,"Deposito d'Elisir Nero":10,
    'Cannone':21,'Torre degli Arcieri':21,'Muro':16,'Mortaio':15,'Torre dello Stregone':15,'Difesa Aerea':13,'Tesla Nascosta':14,'Spingiaria Aerea':8,'Balestra':10,'Torre Infernale':9,'Torre delle Bombe':10,
    'Artiglieria Aquila':6,'Lanciascaglie (Scattershot)':4,'Torre degli Incantesimi':3,'Monolite':2,'Torre Multi-Arceri':0,'Cannone a Palle Rimbalzanti':0,'Torre Multi-Ingranaggio (Long Range)':0,'Sputafuoco':0,
    'Bomba':11,'Trappola a Molla':10,'Bomba Gigante':9,'Bomba Aerea':10,'Mina Aerea a Ricerca':5,'Trappola Scheletrica':5,'Trappola Tornado':4,'Giga Bomba':0,
    'Re Barbaro':90,'Regina degli Arcieri':90,'Gran Sorvegliante':65,'Campionessa Reale':40
  },
  // TH16
  16:{
    'Campo d’Addestramento':12,'Caserma':18,'Caserma Nera':12,'Laboratorio':14,
    'Fabbrica degli Incantesimi':8,'Fabbrica degli Incantesimi Neri':7,"Officina d'Assedio":8,
    'Fabbro (Blacksmith)':9,'Sala degli Eroi (Hero Hall)':12,'Casa degli Animali (Pet House)':10,
    'Castello del Clan':12,"Miniera d'Oro":16,"Deposito d'Oro":17,"Estrattore d'Elisir":16,"Deposito d'Elisir":17,"Trivella d'Elisir Nero":10,"Deposito d'Elisir Nero":11,
    'Cannone':22,'Torre degli Arcieri':22,'Muro':17,'Mortaio':16,'Torre dello Stregone':16,'Difesa Aerea':14,'Tesla Nascosta':15,'Spingiaria Aerea':8,'Balestra':11,'Torre Infernale':10,'Torre delle Bombe':11,
    'Artiglieria Aquila':6,'Lanciascaglie (Scattershot)':4,'Torre degli Incantesimi':4,'Monolite':3,'Torre Multi-Arceri':2,'Cannone a Palle Rimbalzanti':2,'Torre Multi-Ingranaggio (Long Range)':2,'Sputafuoco':2,
    'Bomba':12,'Trappola a Molla':10,'Bomba Gigante':10,'Bomba Aerea':11,'Mina Aerea a Ricerca':6,'Trappola Scheletrica':5,'Trappola Tornado':4,'Giga Bomba':0,
    'Re Barbaro':95,'Regina degli Arcieri':95,'Gran Sorvegliante':70,'Campionessa Reale':45
  },
  // TH17
  17:{
    'Campo d’Addestramento':12,'Caserma':18,'Caserma Nera':12,'Laboratorio':15,
    'Fabbrica degli Incantesimi':8,'Fabbrica degli Incantesimi Neri':7,"Officina d'Assedio":8,
    'Fabbro (Blacksmith)':10,'Sala degli Eroi (Hero Hall)':12,'Casa degli Animali (Pet House)':10,
    'Castello del Clan':12,"Miniera d'Oro":17,"Deposito d'Oro":18,"Estrattore d'Elisir":17,"Deposito d'Elisir":18,"Trivella d'Elisir Nero":10,"Deposito d'Elisir Nero":12,
    'Cannone':23,'Torre degli Arcieri':23,'Muro':18,'Mortaio':17,'Torre dello Stregone':17,'Difesa Aerea':15,'Tesla Nascosta':16,'Spingiaria Aerea':8,'Balestra':12,'Torre Infernale':11,'Torre delle Bombe':12,
    'Artiglieria Aquila':7,'Lanciascaglie (Scattershot)':5,'Torre degli Incantesimi':5,'Monolite':4,'Torre Multi-Arceri':3,'Cannone a Palle Rimbalzanti':3,'Torre Multi-Ingranaggio (Long Range)':3,'Sputafuoco':3,
    'Bomba':13,'Trappola a Molla':11,'Bomba Gigante':11,'Bomba Aerea':12,'Mina Aerea a Ricerca':7,'Trappola Scheletrica':5,'Trappola Tornado':5,'Giga Bomba':5,
    'Re Barbaro':100,'Regina degli Arcieri':100,'Gran Sorvegliante':75,'Campionessa Reale':50
  }
};

/** Ordini pro per FARM/WAR (solo ranking, i cap sono quelli dell’Excel) */
const FARM_ORDER = [
  "Miniera d'Oro","Estrattore d'Elisir","Trivella d'Elisir Nero",
  "Deposito d'Oro","Deposito d'Elisir","Deposito d'Elisir Nero",
  'Laboratorio','Campo d’Addestramento','Caserma','Caserma Nera',
  'Castello del Clan','Casa degli Animali (Pet House)','Fabbro (Blacksmith)',
  'Muro',
  'Torre dello Stregone','Torre delle Bombe','Tesla Nascosta',
  'Balestra','Difesa Aerea','Torre degli Arcieri','Cannone','Mortaio','Spingiaria Aerea',
  'Artiglieria Aquila','Lanciascaglie (Scattershot)','Torre Infernale','Torre degli Incantesimi','Monolite',
  'Torre Multi-Arceri','Cannone a Palle Rimbalzanti','Torre Multi-Ingranaggio (Long Range)','Sputafuoco','Capanna del Costruttore',
  'Municipio'
];

const WAR_ORDER = [
  'Laboratorio','Fabbrica degli Incantesimi','Fabbrica degli Incantesimi Neri',
  'Campo d’Addestramento','Castello del Clan',
  'Re Barbaro','Regina degli Arcieri','Gran Sorvegliante','Campionessa Reale','Casa degli Animali (Pet House)',
  'Artiglieria Aquila','Lanciascaglie (Scattershot)','Torre Infernale','Balestra',
  'Torre degli Incantesimi','Monolite','Tesla Nascosta',
  'Difesa Aerea','Torre dello Stregone','Torre delle Bombe',
  'Torre Multi-Arceri','Cannone a Palle Rimbalzanti','Torre Multi-Ingranaggio (Long Range)','Sputafuoco',
  'Spingiaria Aerea','Mortaio','Torre degli Arcieri','Cannone',
  'Capanna del Costruttore',
  'Trappola Tornado','Mina Aerea a Ricerca','Bomba Gigante','Bomba Aerea',
  'Trappola Scheletrica','Trappola a Molla','Bomba','Giga Bomba',
  "Officina d'Assedio",'Fabbro (Blacksmith)','Caserma','Caserma Nera',
  "Miniera d'Oro","Estrattore d'Elisir","Trivella d'Elisir Nero",
  "Deposito d'Oro","Deposito d'Elisir","Deposito d'Elisir Nero",
  'Municipio'
];

/* ---------- Helpers ---------- */
function isBuilderBaseId(_id:number){ return false; } // filtro futuro

function analyzeTH(json:any): number|undefined { return detectTH(json); }

type Row = { name:string; have:number; max:number; foundCount?:number };
function formatRow(r:Row){ return `${r.name}: ${r.have} → ${r.max}`; }

function buildAdvice(rows:Row[], mode:'FARM'|'WAR'): string[] {
  if(!rows.length) return [];
  const out:string[]=[];
  const order = mode==='WAR' ? WAR_ORDER : FARM_ORDER;
  const want = (needle:string)=>{
    for(const r of rows){
      if(r.name.toLowerCase().includes(needle.toLowerCase())){
        const line=formatRow(r);
        if(!out.includes(line)){ out.push(line); if(out.length>=10) return true; }
      }
    }
    return false;
  };
  for(const key of order) if(want(key)) return out;
  const byGap=[...rows].sort((a,b)=>(b.max-b.have)-(a.max-a.have));
  for(const r of byGap){ const line=formatRow(r); if(!out.includes(line)) out.push(line); if(out.length>=10) break; }
  return out;
}

function tolerantParseAll(raw:string){
  const json=tolerantParse(raw);
  const arr:any[]=[]
    .concat(Array.isArray(json.buildings2)?json.buildings2:[])
    .concat(Array.isArray(json.buildings)?json.buildings:[])
    .concat(Array.isArray(json.heroes2)?json.heroes2:[])
    .concat(Array.isArray(json.heroes)?json.heroes:[])
    .concat(Array.isArray(json.traps2)?json.traps2:[])
    .concat(Array.isArray(json.pets)?json.pets:[]);
  return {json, entries:arr};
}

/* ---------- UI ---------- */
export default function Page(){
  const [text,setText]=useState('');
  const [mode,setMode]=useState<'FARM'|'WAR'>('FARM');
  const [th,setTH]=useState<number>();
  const [rows,setRows]=useState<Row[]>([]);
  const [advice,setAdvice]=useState<string[]>([]);

  const ref=useRef<any>(null);
  useEffect(()=>{
    clearTimeout(ref.current);
    ref.current=setTimeout(()=>run(text),180);
    return ()=>clearTimeout(ref.current);
  },[text,mode]);

  function run(raw:string){
    const {json, entries}=tolerantParseAll(raw);
    const thv=analyzeTH(json);
    setTH(thv);

    // aggregazione per nome → livello MAX + somma copie
    const best:Record<string,{lvl:number;cnt:number}> = {};
    for(const it of entries){
      const id=Number(it?.data);
      const lvl=Number(it?.lvl ?? 0);
      if(!id || Number.isNaN(lvl)) continue;
      if(isBuilderBaseId(id)) continue;
      const meta=IDMAP[id]; if(!meta) continue;
      const name=meta.name;
      const cnt=Math.max(1, Number(it?.cnt ?? 1));
      const prev=best[name];
      if(!prev) best[name]={lvl:isNaN(lvl)?0:lvl, cnt:isNaN(cnt)?1:cnt};
      else { if(!Number.isNaN(lvl)&&lvl>prev.lvl) prev.lvl=lvl; prev.cnt+= (isNaN(cnt)?1:cnt); }
    }

    const caps = thv ? EXCEL_CAPS[thv] || {} : {};
    const list:Row[]=[];
    for(const [name,agg] of Object.entries(best)){
      const max = typeof caps[name]==='number' ? caps[name] : 0;
      if(max>0 && agg.lvl<max){
        list.push({name, have:agg.lvl, max, foundCount:agg.cnt});
      }
    }

    const order = mode==='WAR' ? WAR_ORDER : FARM_ORDER;
    const rank = (n:string)=>{const i=order.findIndex(x=>n.toLowerCase().includes(x.toLowerCase())); return i===-1?999:i;};
    list.sort((a,b)=>{
      const ra=rank(a.name), rb=rank(b.name);
      if(ra!==rb) return ra-rb;
      const ga=(a.max-a.have), gb=(b.max-b.have);
      if(gb!==ga) return gb-ga;
      return a.name.localeCompare(b.name,'it');
    });

    setRows(list);
    setAdvice(buildAdvice(list, mode));
  }

  const count=rows.length;

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="logo">⚔️</span>
          <span className="title">Upgrade Planner</span>
          {typeof th==='number' ? <span className="badge">TH {th}</span> : <span className="badge muted">TH ?</span>}
        </div>
        <div className="modes">
          <button className={`pill ${mode==='FARM'?'active':''}`} onClick={()=>setMode('FARM')}>FARM</button>
          <button className={`pill ${mode==='WAR'?'active':''}`} onClick={()=>setMode('WAR')}>WAR</button>
        </div>
      </header>

      <section className="card">
        <label className="label">Incolla qui il JSON del villaggio</label>
        <textarea className="textbox" value={text} onChange={e=>setText(e.target.value)}
          placeholder='Accetta anche frammenti: "buildings2", "heroes2", "traps2", "pets"…' />
        <div className="hint">
          {th ? <>TH rilevato: <b>{th}</b></> : <>TH non rilevato</>}
          <span className="dot">•</span>
          {count ? <>{count} upgrade rilevati</> : <>nessun upgrade rilevato</>}
        </div>
      </section>

      <section className="card">
        <div className="card-title">Consigli automatici — {mode}</div>
        {advice.length ? (
          <>
            <ol className="list">{advice.map((t,i)=><li key={i}>{t}</li>)}</ol>
            <div className="note">
              {mode==='FARM' ? (
                <ul>
                  <li><b>Risorse prima</b>: miniere/estrattori/depositi.</li>
                  <li><b>Laboratorio sempre attivo</b> + accampamenti/caserme.</li>
                  <li><b>Builder occupati</b>: usa i muri tra upgrade grossi.</li>
                  <li><b>Difese pro-risorse</b>: torri mago, torre bombe, tesla.</li>
                </ul>
              ) : (
                <ul>
                  <li><b>Attacco prima</b>: laboratorio + fabbriche (spell/dark spell).</li>
                  <li><b>Esercito</b>: accampamenti e <i>Castello del Clan</i> subito.</li>
                  <li><b>Eroi</b>: punta ai livelli chiave per abilità.</li>
                  <li><b>Difese WAR</b>: Aquila, Lanciascaglie, Infernali, Balestra, Tesla, Spell Tower, Monolite.</li>
                </ul>
              )}
            </div>
          </>
        ) : <div className="muted">Nessun consiglio disponibile.</div>}
      </section>

      <section className="card">
        <div className="card-title">Elenco completo (senza raggruppamento)</div>
        {rows.length ? (
          <ul className="list">
            {rows.map((r,i)=>(
              <li key={i}>
                <b>{r.name}</b> — liv. {r.have} → <b>{r.max}</b>
                {typeof r.foundCount==='number' && <span className="chip muted">copie trovate: {r.foundCount}</span>}
              </li>
            ))}
          </ul>
        ) : <div className="muted">Niente da mostrare: incolla il JSON o non ci sono upgrade.</div>}
      </section>

      <style jsx>{`
        :global(html, body){background:#09090b;color:#e5e7eb}
        :global(*){box-sizing:border-box}
        .shell{max-width:980px;margin:0 auto;padding:24px 18px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial}
        .topbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
        .brand{display:flex;align-items:center;gap:10px}
        .logo{font-size:20px}
        .title{font-weight:700;letter-spacing:.2px}
        .badge{font-size:12px;padding:2px 8px;border-radius:999px;background:#0ea5e9;color:#001018}
        .badge.muted{background:#373737;color:#bfbfbf}
        .modes{display:flex;gap:8px}
        .pill{border:1px solid #2a2a2a;background:linear-gradient(#151515,#101010);color:#e5e7eb;padding:6px 14px;border-radius:999px;cursor:pointer;transition:all .15s}
        .pill:hover{transform:translateY(-1px);border-color:#3a3a3a}
        .pill.active{border-color:#22c55e;background:linear-gradient(#1a2d1f,#121a13);box-shadow:0 0 0 1px #1f8a3b inset}
        .card{border:1px solid #1f1f22;background:radial-gradient(1200px 400px at -200px -100px,#111827 0%,#0b0b0c 40%,#0a0a0b 100%);border-radius:14px;padding:14px 16px;margin-bottom:14px}
        .card-title{font-weight:700;margin:2px 0 10px 0}
        .label{display:block;color:#9ca3af;margin-bottom:8px}
        .textbox{width:100%;min-height:220px;border:1px solid #26262a;border-radius:12px;background:#0a0a0b;color:#e5e5e5;padding:12px 14px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;line-height:1.4;resize:vertical}
        .textbox:focus{outline:none;border-color:#3b82f6;box-shadow:0 0 0 3px #1f3b77}
        .hint{display:flex;gap:8px;align-items:center;color:#a1a1aa;margin-top:8px}
        .dot{opacity:.5}
        .list{margin:0;padding-left:20px;line-height:1.55}
        .muted{color:#9ca3af}
        .note{margin-top:12px;border:1px dashed #2a2a2a;border-radius:12px;padding:10px 12px;background:#0b0b0c;color:#cfd4dc}
        .note ul{margin:0;padding-left:18px}
        .chip{margin-left:8px;font-size:12px;border:1px solid #2b2b2f;border-radius:999px;padding:2px 8px;background:#0c0c0e}
        .chip.muted{opacity:.8}
      `}</style>
    </main>
  );
}
