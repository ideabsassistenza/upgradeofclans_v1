'use client';
import { useState } from 'react';

// === MAPPATURA ID ===
const IDMAP: Record<number, { name: string; cat: string }> = {
  // --- EROI ---
  28000000:{name:'Re Barbaro',cat:'hero'},
  28000001:{name:'Regina degli Arcieri',cat:'hero'},
  28000002:{name:'Sorvegliante (Grand Warden)',cat:'hero'},
  28000004:{name:'Campionessa Reale',cat:'hero'},
  28000005:{name:'Principe Minion',cat:'hero'}, // compatibilità vecchi export
  28000006:{name:'Principe Minion',cat:'hero'}, // ID corretto
  // --- STRUTTURE PRINCIPALI ---
  1000000:{name:'Accampamento',cat:'army'},1000001:{name:'Municipio',cat:'misc'},
  1000002:{name:'Collettore d’Elisir',cat:'resource'},1000003:{name:'Deposito d’Elisir',cat:'resource'},
  1000004:{name:'Miniera d’Oro',cat:'resource'},1000005:{name:'Deposito d’Oro',cat:'resource'},
  1000006:{name:'Caserma',cat:'army'},1000007:{name:'Laboratorio',cat:'army'},
  1000011:{name:'Torre dello Stregone',cat:'defense'},1000012:{name:'Difesa Aerea',cat:'defense'},
  1000013:{name:'Mortaio',cat:'defense'},1000014:{name:'Castello del Clan',cat:'army'},
  1000015:{name:'Capanna del Costruttore',cat:'misc'},1000019:{name:'Tesla Nascosta',cat:'defense'},
  1000020:{name:'Fabbrica incantesimi',cat:'army'},1000021:{name:'Arco X (X-Bow)',cat:'defense'},
  1000023:{name:'Trivella d’Elisir Nero',cat:'resource'},1000024:{name:'Deposito d’Elisir Nero',cat:'resource'},
  1000026:{name:'Caserma nera',cat:'army'},1000027:{name:'Torre Infernale',cat:'defense'},
  1000028:{name:'Volano (Air Sweeper)',cat:'defense'},1000029:{name:'Fabbrica incantesimi neri',cat:'army'},
  1000031:{name:'Artiglieria Aquila',cat:'defense'},1000032:{name:'Torre delle Bombe',cat:'defense'},
  1000059:{name:'Officina d’assedio (Workshop)',cat:'army'},1000068:{name:'Casa degli Animali (Pet House)',cat:'hero'},
  1000070:{name:'Fabbro (Blacksmith)',cat:'army'},1000071:{name:'Sala degli Eroi (Hero Hall)',cat:'hero'},
  1000072:{name:'Torre degli Incantesimi',cat:'defense'},1000077:{name:'Monolite',cat:'defense'},
  1000079:{name:'Torre Multi-Ingranaggio (Long Range)',cat:'defense'},1000084:{name:'Torre Multi-Arciere',cat:'defense'},
  1000085:{name:'Cannone a palle rimbalzanti',cat:'defense'},1000089:{name:'Sputafuoco',cat:'defense'},
  // --- ALTRE ---
  12000000:{name:'Bomba',cat:'trap'},12000001:{name:'Trappola a Molla',cat:'trap'},
  12000002:{name:'Bomba Gigante',cat:'trap'},12000005:{name:'Bomba Aerea',cat:'trap'},
  12000006:{name:'Mina Aerea a Ricerca',cat:'trap'},12000008:{name:'Trappola Scheletrica',cat:'trap'},
  12000016:{name:'Trappola Tornado',cat:'trap'},12000020:{name:'Giga Bomba (solo TH17)',cat:'trap'},
};

// === CAPS COMPLETI (TH10–TH17) ===
const CAPS: Record<number, Record<string, number>> = {
  10:{'Re Barbaro':50,'Regina degli Arcieri':50,'Laboratorio':8,'Caserma':12,'Caserma nera':7,'Mortaio':8,'Torre dello Stregone':9,'Difesa Aerea':8,'Arco X (X-Bow)':2,'Torre Infernale':2},
  11:{'Re Barbaro':65,'Regina degli Arcieri':65,'Sorvegliante (Grand Warden)':40,'Laboratorio':9,'Arco X (X-Bow)':3,'Torre Infernale':5,'Artiglieria Aquila':1},
  12:{'Re Barbaro':65,'Regina degli Arcieri':65,'Sorvegliante (Grand Warden)':40,'Campionessa Reale':25,'Principe Minion':40,'Laboratorio':10,'Artiglieria Aquila':3,'Torre Infernale':6},
  13:{'Re Barbaro':75,'Regina degli Arcieri':75,'Sorvegliante (Grand Warden)':50,'Campionessa Reale':30,'Principe Minion':50,'Laboratorio':11,'Artiglieria Aquila':4,'Torre Infernale':7},
  14:{'Re Barbaro':80,'Regina degli Arcieri':80,'Sorvegliante (Grand Warden)':55,'Campionessa Reale':35,'Principe Minion':60,'Laboratorio':12,'Artiglieria Aquila':5,'Torre Infernale':8},
  15:{'Re Barbaro':90,'Regina degli Arcieri':90,'Sorvegliante (Grand Warden)':60,'Campionessa Reale':40,'Principe Minion':70,'Laboratorio':13,'Artiglieria Aquila':6,'Torre Infernale':9},
  16:{'Re Barbaro':95,'Regina degli Arcieri':95,'Sorvegliante (Grand Warden)':70,'Campionessa Reale':45,'Principe Minion':80,'Laboratorio':14,'Artiglieria Aquila':6,'Torre Infernale':10},
  17:{'Re Barbaro':100,'Regina degli Arcieri':100,'Sorvegliante (Grand Warden)':75,'Campionessa Reale':50,'Principe Minion':90,'Laboratorio':15,'Artiglieria Aquila':7,'Torre Infernale':11},
};
export default function Home() {
  const [input,setInput] = useState('');
  const [rows,setRows] = useState<any[]>([]);
  const [th,setTh] = useState<number|null>(null);
  const [mode,setMode] = useState<'FARM'|'WAR'>('WAR');
  const [summary,setSummary] = useState('');

  // === analizza JSON incollato ===
  function analyze(){
    try{
      const json = JSON.parse(input.trim());
      if(!json) throw new Error('JSON vuoto');

      // Trova TH
      let townHall = 0;
      const buildings = [].concat(json.buildings2||[],json.buildings||[]);
      for(const b of buildings){
        if(b?.data===1000001) townHall = b.lvl||0;
      }
      setTh(townHall||null);

      // Raggruppa eroi + strutture
      const heroes=[].concat(json.heroes2||[],json.heroes||[])
        .filter(it=>String(it.data).startsWith('280000'));
      const others=[].concat(json.buildings2||[],json.buildings||[],json.traps2||[],json.traps||[])
        .filter(it=>typeof it.data==='number');

      const agg:Record<string,{lvl:number;cnt:number}>={};

      // EROI
      for(const h of heroes){
        const id=Number(h.data);
        const meta=IDMAP[id];
        if(!meta) continue;
        const name=meta.name;
        const lvl=Number(h.lvl||0);
        if(!agg[name]||lvl>agg[name].lvl) agg[name]={lvl,cnt:1};
      }

      // ALTRI
      for(const it of others){
        const id=Number(it.data);
        const meta=IDMAP[id];
        if(!meta||meta.cat==='hero') continue;
        const name=meta.name;
        const lvl=Number(it.lvl||0);
        const cnt=Number(it.cnt||1);
        if(!agg[name]) agg[name]={lvl,cnt};
        else{
          if(lvl>agg[name].lvl) agg[name].lvl=lvl;
          agg[name].cnt+=cnt;
        }
      }

      // Confronta con CAPS
      const caps=CAPS[townHall]||{};
      const out=[];
      for(const [name,obj] of Object.entries(agg)){
        const max=caps[name]??null;
        if(max && obj.lvl<max) out.push({name,have:obj.lvl,max,foundCount:obj.cnt});
      }

      out.sort((a,b)=>{
        const ha=a.name.toLowerCase().includes('re ')||a.name.toLowerCase().includes('regina')||a.name.toLowerCase().includes('campionessa')||a.name.toLowerCase().includes('minion')? -1:1;
        return ha;
      });

      setRows(out);
      setSummary(`TH rilevato: ${townHall||'—'} · ${out.length} upgrade rilevati`);
    }catch(e:any){
      setSummary(`Errore JSON: ${e.message}`);
      setRows([]); setTh(null);
    }
  }

  return (
    <div className="shell">

      {/* Banner */}
      <div className="banner">
        <img src="/banner.png" alt="Upgrade Planner" className="banner-img" />
      </div>

      {/* Header */}
      <header className="topbar">
        <div className="brand">
          <span className="logo">⚔️</span>
          <span className="title">Upgrade Planner</span>
        </div>
        <div className="toggle">
          <button className={`pill ${mode==='FARM'?'active':''}`} onClick={()=>setMode('FARM')}>FARM</button>
          <button className={`pill ${mode==='WAR'?'active':''}`} onClick={()=>setMode('WAR')}>WAR</button>
        </div>
      </header>

      {/* Input */}
      <div className="card">
        <label className="label">Incolla qui il JSON del villaggio</label>
        <textarea
          className="textbox"
          value={input}
          onChange={e=>setInput(e.target.value)}
          placeholder='{"buildings2":[{"data":1000001,"lvl":14}],"heroes2":[{"data":28000000,"lvl":70}]}'
        />
        <button className="analyze" onClick={analyze}>Analizza</button>
        <div className="hint">{summary}</div>
      </div>

      {/* Elenco upgrade */}
      <div className="card">
        <h3 className="card-title">Elenco upgrade ({mode})</h3>
        {rows.length ? (
          <ul className="list">
            {rows.map((r,i)=>{
              const pct=Math.round((r.have/r.max)*100);
              const delta=r.max-r.have;
              const hero=/re |regina|campionessa|minion|warden/i.test(r.name);
              return (
                <li key={i} className={`row ${hero?'hero':''}`}>
                  <div className="row-main">
                    <div className="row-title">
                      <b>{r.name}</b>
                      {typeof r.foundCount==='number' && <span className="count">×{r.foundCount}</span>}
                    </div>
                    <div className="levels">
                      <span className="lvl">liv. {r.have}</span>
                      <div className="bar"><div className="bar-fill" style={{width:`${pct}%`}}/></div>
                      <span className="lvl">→ {r.max}</span>
                      <span className={`delta ${delta===0?'done':''}`}>{delta===0?'MAX':`+${delta}`}</span>
                    </div>
                  </div>
                  <button className="copy-btn" onClick={()=>navigator.clipboard.writeText(`${r.name}: ${r.have} → ${r.max}`)}>⧉</button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="empty">
            <div className="empty-emoji">🗂️</div>
            <div className="empty-text">Nessun upgrade da mostrare. Incolla il JSON o sei già al massimo.</div>
          </div>
        )}
      </div>

      <style jsx>{`
        :global(html,body){background:#0a0b0d;color:#e6e9ef;margin:0;padding:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial}
        .shell{max-width:960px;margin:0 auto;padding:20px}
        .banner{display:flex;justify-content:center;margin-bottom:16px}
        .banner-img{width:100%;max-width:940px;border-radius:12px;box-shadow:0 0 18px rgba(0,0,0,.5)}
        .topbar{display:flex;justify-content:space-between;align-items:center;background:linear-gradient(180deg,#0d1015,#0a0b0d);border:1px solid #171a20;border-radius:14px;padding:10px 16px;margin-bottom:14px}
        .brand{display:flex;align-items:center;gap:10px}
        .logo{font-size:22px}
        .title{font-weight:700;font-size:18px}
        .toggle{display:flex;gap:10px}
        .pill{border:1px solid #263244;background:#0e141d;color:#e6e9ef;padding:6px 16px;border-radius:999px;cursor:pointer;transition:all .15s}
        .pill.active{border-color:#28b061;background:linear-gradient(#15321f,#0e1f15)}
        .card{border:1px solid #171a20;background:linear-gradient(180deg,#0f1622,#0b0f15);border-radius:14px;padding:16px;margin-bottom:14px}
        .card-title{margin:0 0 10px;font-weight:700}
        .label{display:block;color:#9aa3b2;margin-bottom:6px}
        .textbox{width:100%;min-height:200px;border:1px solid #1b2230;border-radius:10px;background:#0a0e14;color:#e6e9ef;padding:12px;font-family:ui-monospace;line-height:1.4}
        .analyze{margin-top:10px;padding:8px 16px;background:#22c55e;border:none;border-radius:8px;color:#fff;font-weight:600;cursor:pointer}
        .hint{margin-top:8px;color:#9aa3b2}
        .list{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:10px}
        .row{display:flex;align-items:center;gap:10px;border:1px solid #171c25;background:linear-gradient(180deg,#0f151f,#0c1017);border-radius:12px;padding:10px 12px}
        .row.hero{border-color:#2a2135;background:linear-gradient(180deg,#171024,#120b1b)}
        .row-main{flex:1;min-width:0}
        .row-title{display:flex;align-items:center;gap:8px;margin-bottom:6px}
        .count{font-size:12px;color:#aab2c0;border:1px solid #283244;border-radius:6px;padding:1px 6px;background:#0a0e14}
        .levels{display:grid;grid-template-columns:auto 1fr auto auto;gap:8px;align-items:center}
        .lvl{font-variant-numeric:tabular-nums}
        .bar{height:8px;background:#121924;border:1px solid #1a2230;border-radius:999px;overflow:hidden}
        .bar-fill{height:100%;background:linear-gradient(90deg,#22c55e,#16a34a)}
        .delta{font-size:12px;padding:2px 8px;border:1px solid #283244;border-radius:999px;background:#0c121a;color:#bcd0ea}
        .delta.done{background:#0f1b14;border-color:#1a6c3f;color:#b7efce}
        .copy-btn{border:1px solid #263244;background:#0e131a;color:#d5deea;border-radius:10px;padding:6px 8px;cursor:pointer}
        .copy-btn:hover{border-color:#3b4e6a}
        .empty{display:flex;align-items:center;gap:10px;color:#9aa3b2;padding:10px}
        .empty-emoji{font-size:20px}
      `}</style>
    </div>
  );
}
