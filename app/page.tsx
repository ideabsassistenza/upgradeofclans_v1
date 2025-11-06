'use client';

import React, { useMemo, useState } from 'react';

type Category = 'hero' | 'defense' | 'infrastructure' | 'trap' | 'other';

type NormalizedItem = {
  name: string;
  level: number;
  maxLevel: number;
  category: Category | string;
  count: number;
};

type GroupRow = {
  name: string;
  currentLevel: number;
  toLevel: number;
  atLevelCount: number;
  totalSameName: number;
  category: Category | string;
  deficit: number;
  priorityScore: number;
};

export default function Page() {
  // ---- Stato base ----
  const [raw, setRaw] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState('');

  // ---- Input da TEXTAREA ----
  const [pasted, setPasted] = useState('');

  // ---- Mappatura campi (se il JSON non è standard) ----
  const [mapping, setMapping] = useState({
    name: '',
    level: '',
    max: '',
    cat: '',
    cnt: '',
  });

  // ---- Filtri e ordinamento ----
  const [sortBy, setSortBy] = useState<'recommended' | 'deficit' | 'name'>('recommended');
  const [filters, setFilters] = useState({
    hero: true,
    defense: true,
    infrastructure: true,
    trap: true,
    other: true,
    search: '',
    minDeficit: 0,
  });

  // ========== HANDLER: Genera Previsione (da textarea) ==========
  function handleGenerateFromTextarea() {
    setError('');
    try {
      // Tenta parse diretto
      const text = (pasted || '').trim();

      if (!text) {
        setError('Incolla qui il JSON copiato dal gioco prima di generare.');
        return;
      }

      // Alcuni giochi copiano con spazi/righe strane: normalizziamo min. (ma non modifichiamo il contenuto)
      const json = JSON.parse(text);

      setRaw(json);

      const arr = autoExtractArray(json);
      if (arr.length === 0) {
        setItems([]);
        setError('Non trovo liste di oggetti con campi livello nel JSON. Seleziona la mappatura manualmente qui sotto.');
      } else {
        setItems(arr);
        setupMappingOptions(arr[0]);
      }
    } catch (e: any) {
      setError('JSON non valido: ' + e.message);
    }
  }

  // ========== (Opzionale) Caricamento da file resta disponibile ==========
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError('');
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(String(reader.result));
        setRaw(json);
        const pre = autoExtractArray(json);
        if (pre.length === 0) {
          setItems([]);
          setError('Non trovo liste di oggetti con campi livello nel JSON. Seleziona la mappatura manualmente qui sotto.');
        } else {
          setItems(pre);
          setupMappingOptions(pre[0]);
        }
      } catch (err: any) {
        setError('JSON non valido: ' + err.message);
      }
    };
    reader.readAsText(f);
  }

  // ========== Parsing & Mappatura ==========
  function autoExtractArray(json: any): any[] {
    const results: any[] = [];
    function scan(node: any) {
      if (!node) return;
      if (Array.isArray(node)) {
        if (
          node.length > 0 &&
          typeof node[0] === 'object' &&
          node.some((x) => hasAnyKey(x, ['level', 'lvl', 'currentLevel']))
        ) {
          results.push(...node);
        } else {
          node.forEach(scan);
        }
      } else if (typeof node === 'object') {
        Object.values(node).forEach(scan);
      }
    }
    scan(json);
    return results;
  }
  function hasAnyKey(obj: any, keys: string[]) {
    return keys.some((k) => Object.prototype.hasOwnProperty.call(obj, k));
  }
  function setupMappingOptions(sample: any) {
    const keys = Object.keys(sample || {});
    const pick = (cands: string[], fallback = '') => {
      const mapLower: Record<string, string> = {};
      keys.forEach((k) => (mapLower[k.toLowerCase()] = k));
      for (const c of cands) if (mapLower[c]) return mapLower[c];
      const hit = keys.find((k) => cands.some((c) => k.toLowerCase().includes(c)));
      return hit || fallback;
    };
    const name = pick(['name', 'building', 'unit', 'defense', 'hero', 'trap', 'item']);
    const level = pick(['level', 'lvl', 'currentlevel']);
    const max = pick(['maxlevel', 'max', 'cap', 'max_level']);
    const cat = pick(['category', 'type', 'kind', 'group'], '');
    const cnt = pick(['count', 'qty', 'quantity', 'num', 'pieces'], '');
    setMapping({ name, level, max, cat, cnt });
  }

  // ========== Normalizzazione ==========
  function inferCategory(name: string): Category {
    const n = (name || '').toLowerCase();
    if (/(king|queen|warden|champion)/.test(n)) return 'hero';
    if (/(tower|cannon|tesla|inferno|eagle|scatter|artillery|x-bow|xbow|air defense|air-defense|airdefense)/.test(n))
      return 'defense';
    if (/(trap|bomb|mine|tornado|spring)/.test(n)) return 'trap';
    if (/(laboratory|spell|barracks|camp|factory|workshop|clan|castle|storage|collector|drill)/.test(n))
      return 'infrastructure';
    return 'other';
  }
  function toNum(v: any) {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }
  function s(v: any) {
    return v == null ? '' : String(v);
  }

  function buildNormalized(): NormalizedItem[] {
    if (!items || items.length === 0) return [];
    const nameK = mapping.name;
    const levelK = mapping.level;
    const maxK = mapping.max;
    const catK = mapping.cat;
    const cntK = mapping.cnt;
    const out: NormalizedItem[] = [];
    for (const it of items) {
      const name = s(it?.[nameK] ?? it?.name ?? it?.building ?? it?.unit);
      const level = toNum(it?.[levelK] ?? it?.level ?? it?.lvl ?? it?.currentLevel);
      const maxLevel = toNum(it?.[maxK] ?? it?.maxLevel ?? it?.max ?? it?.cap);
      const category = (s(it?.[catK] ?? it?.category ?? it?.type) as Category) || inferCategory(name);
      const count = cntK ? toNum(it?.[cntK]) || 1 : 1;
      if (!name || isNaN(level) || isNaN(maxLevel)) continue;
      out.push({ name, level, maxLevel, category, count });
    }
    return out;
  }

  const normalized = useMemo(() => buildNormalized(), [items, mapping]);

  // Totali per nome
  const totalsByName = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of normalized) m.set(i.name, (m.get(i.name) || 0) + (i.count || 1));
    return m;
  }, [normalized]);

  const needUpgrades = useMemo(() => normalized.filter((i) => i.level < i.maxLevel), [normalized]);

  // ========== Priorità ==========
  const DEFENSE_PRIORITY = useMemo(
    () => [
      'eagle artillery',
      'eagle',
      'scattershot',
      'inferno tower',
      'inferno',
      'x-bow',
      'xbow',
      'air defense',
      'wizard tower',
      'archer tower',
      'cannon',
      'hidden tesla',
      'tesla',
      'mortar',
    ],
    []
  );

  function categoryWeight(c: Category | string) {
    switch (c) {
      case 'hero':
        return 100;
      case 'defense':
        return 80;
      case 'infrastructure':
        return 50;
      case 'trap':
        return 30;
      default:
        return 20;
    }
  }
  function defenseNameWeight(name: string) {
    const n = (name || '').toLowerCase();
    const idx = DEFENSE_PRIORITY.findIndex((x) => n.includes(x));
    return idx === -1 ? 0 : DEFENSE_PRIORITY.length - idx;
  }
  function computePriorityScore(name: string, cat: Category | string, deficit: number) {
    const base = categoryWeight(cat);
    const byName = cat === 'defense' ? defenseNameWeight(name) : 0;
    return base * 100 + byName * 10 + deficit;
  }

  // ========== Raggruppo + filtri + ordinamento ==========
  const grouped: GroupRow[] = useMemo(() => {
    const key = (i: NormalizedItem) => `${i.name}__${i.level}`;
    const g = new Map<string, GroupRow>();
    for (const i of needUpgrades) {
      const k = key(i);
      const prev = g.get(k);
      const row: GroupRow = prev || {
        name: i.name,
        currentLevel: i.level,
        toLevel: i.maxLevel,
        atLevelCount: 0,
        totalSameName: totalsByName.get(i.name) || i.count || 1,
        category: i.category,
        deficit: i.maxLevel - i.level,
        priorityScore: 0,
      };
      row.atLevelCount += i.count || 1;
      row.deficit = Math.max(row.deficit, i.maxLevel - i.level);
      row.priorityScore = computePriorityScore(i.name, row.category, row.deficit);
      g.set(k, row);
    }

    let arr = Array.from(g.values());

    // Filtri
    arr = arr.filter((r) => (filters as any)[r.category] === true);
    if (filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      arr = arr.filter((r) => r.name.toLowerCase().includes(q));
    }
    if (filters.minDeficit > 0) arr = arr.filter((r) => r.deficit >= filters.minDeficit);

    // Ordinamenti
    if (sortBy === 'recommended') {
      arr.sort(
        (a, b) =>
          b.priorityScore - a.priorityScore ||
          b.deficit - a.deficit ||
          a.name.localeCompare(b.name) ||
          a.currentLevel - b.currentLevel
      );
    } else if (sortBy === 'deficit') {
      arr.sort(
        (a, b) =>
          b.deficit - a.deficit ||
          categoryWeight(b.category) - categoryWeight(a.category) ||
          a.name.localeCompare(b.name)
      );
    } else {
      arr.sort((a, b) => a.name.localeCompare(b.name) || a.currentLevel - b.currentLevel);
    }

    return arr;
  }, [needUpgrades, totalsByName, sortBy, filters]);

  // ========== Export ==========
  function downloadCSV() {
    const header = [
      'name',
      'count_at_level',
      'total_same_name',
      'current_level',
      'to_level',
      'category',
      'deficit',
      'priority_score',
    ];
    const rows = grouped.map((r) => [
      r.name,
      r.atLevelCount,
      r.totalSameName,
      r.currentLevel,
      r.toLevel,
      r.category,
      r.deficit,
      r.priorityScore,
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'upgrade-list.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="wrap">
      <div className="toprow">
        <h1>CoC Upgrade Planner</h1>
        <div className="row">
          {/* Opzione file (rimane, ma non obbligatoria) */}
          <label className="btn">
            <input type="file" accept="application/json" onChange={onFile} style={{ display: 'none' }} />
            Carica JSON (file)
          </label>
          <button className="btn" onClick={downloadCSV} disabled={grouped.length === 0}>
            Esporta CSV
          </button>
        </div>
      </div>

      {/* Input incolla testo */}
      <div className="panel">
        <div className="paneltitle" style={{ marginBottom: 8 }}>Incolla il JSON dal gioco</div>
        <textarea
          className="input"
          rows={10}
          placeholder='Incolla qui il testo JSON copiato dal gioco (deve iniziare con { o [ )'
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
        />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn" onClick={handleGenerateFromTextarea}>Genera Previsione</button>
          <span className="muted small">Il testo resta solo nel browser (nessun upload).</span>
        </div>
      </div>

      {error && <div className="err small" style={{ margin: '8px 0 16px' }}>{error}</div>}

      {raw && (
        <div className="panel">
          <div className="panelhead">
            <div className="paneltitle">Mappatura campi</div>
            <div className="muted small">Se non auto-riconosce, scegli qui i campi giusti dal tuo JSON</div>
          </div>
          <div className="grid5">
            <Select label="Nome (name)" value={mapping.name} onChange={(v) => setMapping((m) => ({ ...m, name: v }))} sample={items[0]} required />
            <Select label="Livello attuale (level)" value={mapping.level} onChange={(v) => setMapping((m) => ({ ...m, level: v }))} sample={items[0]} required />
            <Select label="Livello massimo (maxLevel)" value={mapping.max} onChange={(v) => setMapping((m) => ({ ...m, max: v }))} sample={items[0]} required />
            <Select label="Categoria (opz.)" value={mapping.cat} onChange={(v) => setMapping((m) => ({ ...m, cat: v }))} sample={items[0]} />
            <Select label="Quantità (opz.)" value={mapping.cnt} onChange={(v) => setMapping((m) => ({ ...m, cnt: v }))} sample={items[0]} />
          </div>
        </div>
      )}

      <div className="panel">
        <div className="paneltitle" style={{ marginBottom: 8 }}>Filtri e ordinamento</div>
        <div className="grid3">
          <div>
            <div className="muted small" style={{ marginBottom: 6 }}>Categorie</div>
            <Chk label="Eroi" checked={filters.hero} onChange={(v) => setFilters((f) => ({ ...f, hero: v }))} />
            <Chk label="Difese" checked={filters.defense} onChange={(v) => setFilters((f) => ({ ...f, defense: v }))} />
            <Chk label="Infrastrutture" checked={filters.infrastructure} onChange={(v) => setFilters((f) => ({ ...f, infrastructure: v }))} />
            <Chk label="Trappole" checked={filters.trap} onChange={(v) => setFilters((f) => ({ ...f, trap: v }))} />
            <Chk label="Altro" checked={filters.other} onChange={(v) => setFilters((f) => ({ ...f, other: v }))} />
          </div>
          <div>
            <div className="muted small">Ricerca</div>
            <input
              className="input"
              placeholder="es. inferno, queen, archer…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            />
            <div className="muted small" style={{ marginTop: 8 }}>Deficit minimo</div>
            <input
              type="number"
              min={0}
              className="input"
              value={filters.minDeficit}
              onChange={(e) => setFilters((f) => ({ ...f, minDeficit: Number(e.target.value) || 0 }))}
            />
          </div>
          <div>
            <div className="muted small" style={{ marginBottom: 6 }}>Ordina per</div>
            <div className="row">
              <Btn active={sortBy === 'recommended'} onClick={() => setSortBy('recommended')}>Consigliato</Btn>
              <Btn active={sortBy === 'deficit'} onClick={() => setSortBy('deficit')}>Deficit</Btn>
              <Btn active={sortBy === 'name'} onClick={() => setSortBy('name')}>Nome</Btn>
            </div>
            <div className="muted small" style={{ marginTop: 8 }}>
              Consigliato = Eroi → Difese chiave (Eagle, Scatter, Inferno, X-Bow, Air Defense…) → resto (a parità vince il deficit).
            </div>
          </div>
        </div>
      </div>

      <div className="muted small" style={{ margin: '10px 0' }}>
        Mostro solo gli elementi da upgradare. Se un elemento è già al massimo, non appare.
      </div>

      <div className="grid1" id="list">
        {grouped.length === 0 ? (
          <div className="muted small">{raw ? 'Nessun upgrade da mostrare oppure mappatura non corretta.' : 'Incolla il JSON e premi “Genera Previsione”.'}</div>
        ) : (
          grouped.map((g, idx) => (
            <div key={idx} className="item">
              <div className="k">{g.name}</div>
              <div>{g.atLevelCount}/{g.totalSameName} → liv. {g.currentLevel} → {g.toLevel}</div>
              <div className="small muted">
                <span className={`pill cat-${(g.category || 'other')}`}>{String(g.category)}</span>
                {' · '}deficit: {g.deficit}{' · '}prio: {g.priorityScore}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Stili minimi inline per evitare tocchi a globals.css */}
      <style jsx global>{`
        :root { color-scheme: dark; }
        body { background:#0a0a0a; color:#e5e5e5; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
        .wrap { max-width:1100px; margin:0 auto; padding:24px; }
        .toprow { display:flex; gap:12px; align-items:center; justify-content:space-between; flex-wrap:wrap; }
        h1 { font-size:22px; margin:0; }
        .row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
        .btn { background:#1f1f1f; border:1px solid #2c2c2c; padding:8px 12px; border-radius:10px; cursor:pointer; }
        .btn[disabled] { opacity:.5; cursor:not-allowed; }
        .panel { background:#0f0f0f; border:1px solid #1f1f1f; border-radius:12px; padding:16px; margin-top:16px; }
        .panelhead { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
        .paneltitle { font-weight:600; }
        .muted { color:#9ca3af; }
        .small { font-size:12px; }
        .grid1 { display:grid; gap:10px; grid-template-columns:1fr; }
        .grid3 { display:grid; gap:10px; grid-template-columns:1fr; }
        .grid5 { display:grid; gap:10px; grid-template-columns:1fr; }
        @media (min-width:880px){ .grid3{ grid-template-columns:1fr 1fr 1fr; } .grid5{ grid-template-columns:repeat(5,1fr);} }
        .input { width:100%; background:#0a0a0a; border:1px solid #2c2c2c; border-radius:8px; padding:8px; color:#e5e5e5; }
        textarea.input { min-height: 220px; line-height: 1.3; }
        .item { display:grid; gap:8px; grid-template-columns:1fr 1fr 1fr; background:#121212; border:1px solid #242424; padding:12px; border-radius:12px; }
        .k { font-weight:600; }
        .err { color:#fca5a5; }
        .pill { display:inline-block; padding:2px 8px; border-radius:999px; font-size:12px; border:1px solid #2c2c2c; }
        .cat-hero { border-color:#f59e0b; }
        .cat-defense { border-color:#60a5fa; }
        .cat-infrastructure { border-color:#34d399; }
        .cat-trap { border-color:#c084fc; }
        .cat-other { border-color:#a3a3a3; }
      `}</style>
    </div>
  );
}

function Btn({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className="btn" style={active ? { borderColor: '#4b5563', background: '#18181b' } : {}} onClick={onClick}>
      {children}
    </button>
  );
}

function Chk({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  sample,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  sample: any;
  required?: boolean;
}) {
  const keys = useMemo(() => (sample ? Object.keys(sample) : []), [sample]);
  return (
    <div>
      <div className="muted small">{label}</div>
      <select
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{required ? '— seleziona —' : '— opzionale —'}</option>
        {keys.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
    </div>
  );
}
