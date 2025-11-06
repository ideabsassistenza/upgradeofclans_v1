"use client";

import { useEffect, useMemo, useState } from "react";

// ---------- Tipi base ----------
type RawEntry = { data: number; lvl?: number; cnt?: number; weapon?: number };
type VillageJSON = {
  tag?: string;
  timestamp?: number;
  buildings?: RawEntry[];
  heroes?: RawEntry[];
};
type Mode = "war" | "farm";
type PlanItem = {
  id: string;
  title: string;
  reason: string;
  score: number;
};

// ---------- Funzioni di utilità ----------
function tryParseJSON(text: string): VillageJSON | null {
  try {
    const obj = JSON.parse(text);
    if (obj && typeof obj === "object") return obj as VillageJSON;
  } catch {}
  return null;
}

function detectTownHallLevel(v: VillageJSON | null): number | null {
  if (!v?.buildings) return null;
  const th = v.buildings.find((b) => b.data === 1000001);
  return th?.lvl || null;
}

function extractHeroLevels(v: VillageJSON | null): {
  bk?: number;
  aq?: number;
  gw?: number;
  rc?: number;
} {
  const r: any = {};
  if (!v?.heroes) return r;
  const hs = [...v.heroes].sort((a, b) => (b.lvl || 0) - (a.lvl || 0));
  for (const h of hs) {
    const L = h.lvl || 0;
    if (L >= 70 && !r.aq) {
      r.aq = L;
      continue;
    }
    if (L >= 65 && !r.bk) {
      r.bk = L;
      continue;
    }
    if (L >= 50 && !r.gw) {
      r.gw = L;
      continue;
    }
    if (!r.rc && L >= 20) {
      r.rc = L;
      continue;
    }
  }
  return r;
}

// ---------- Template semplificato ----------
function buildPlan(v: VillageJSON | null, mode: Mode): {
  th: number | null;
  items: PlanItem[];
} {
  const th = detectTownHallLevel(v);
  const heroes = extractHeroLevels(v);

  const template = [
    {
      id: "lab",
      title: "Laboratorio → max",
      reason: "Potenzia truppe e incantesimi, moltiplicatore d’attacco.",
      score: mode === "war" ? 2.8 : 2.2,
    },
    {
      id: "camps",
      title: "Accampamenti → max",
      reason: "Più truppe = più potenza in ogni attacco.",
      score: mode === "war" ? 2.0 : 1.8,
    },
    {
      id: "cc",
      title: "Clan Castle → max",
      reason: "Migliori donazioni e difese del castello.",
      score: mode === "war" ? 1.9 : 1.8,
    },
    {
      id: "heroes",
      title: "Eroi → potenziali da migliorare",
      reason: "Upgrade fondamentali per il progresso del villaggio.",
      score: mode === "war" ? 3.0 : 1.6,
    },
  ];

  // Boost specifico per TH14 se i livelli sono bassi
  const extras: PlanItem[] = [];
  if (th === 14 && (heroes.rc || 0) < 30) {
    extras.push({
      id: "hero_rc",
      title: "Royal Champion → livello 30",
      reason: "È l’eroe più indietro, da portare al livello massimo del TH14.",
      score: mode === "war" ? 3.0 : 1.5,
    });
  }

  const items = [...template, ...extras].sort((a, b) => b.score - a.score);
  return { th: th || null, items };
}

// ---------- Interfaccia ----------
export default function Page() {
  const [raw, setRaw] = useState("");
  const [mode, setMode] = useState<Mode>("war");
  const [parsed, setParsed] = useState<VillageJSON | null>(null);

  const plan = useMemo(() => buildPlan(parsed, mode), [parsed, mode]);

  const handleGenerate = () => {
    const pj = tryParseJSON(raw);
    setParsed(pj);
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 p-6 flex flex-col items-center">
      <div className="w-full max-w-3xl">
        <h1 className="text-3xl font-bold mb-2">Upgrade of Clans</h1>
        <p className="text-sm opacity-80 mb-6">
          Fan-made planner (no AI, no API) • Made with Next.js + Tailwind
        </p>

        <label className="block mb-2 font-semibold text-sm">
          Incolla qui il tuo JSON del villaggio:
        </label>
        <textarea
          className="w-full h-48 p-3 rounded-lg bg-neutral-900 border border-neutral-800 text-sm"
          placeholder='{"tag":"#XXXXXX", ...}'
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
        />

        <div className="flex items-center gap-3 mt-4">
          <div className="inline-flex rounded-lg overflow-hidden border border-neutral-700">
            <button
              className={`px-4 py-2 text-sm ${
                mode === "war" ? "bg-emerald-700" : "bg-neutral-800"
              }`}
              onClick={() => setMode("war")}
            >
              War
            </button>
            <button
              className={`px-4 py-2 text-sm ${
                mode === "farm" ? "bg-emerald-700" : "bg-neutral-800"
              }`}
              onClick={() => setMode("farm")}
            >
              Farm
            </button>
          </div>

          <button
            onClick={handleGenerate}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-semibold"
          >
            Genera piano
          </button>
        </div>

        {parsed && (
          <section className="mt-8">
            <h2 className="text-2xl font-semibold mb-2">Piano consigliato</h2>
            <p className="text-sm opacity-80 mb-4">
              TH rilevato: <b>{plan.th ?? "—"}</b> • Modalità:{" "}
              <b>{mode.toUpperCase()}</b>
            </p>
            <ol className="space-y-3">
              {plan.items.map((it, idx) => (
                <li
                  key={it.id}
                  className="bg-neutral-900 border border-neutral-800 rounded-lg p-4"
                >
                  <div className="font-semibold text-lg">
                    {idx + 1}. {it.title}
                  </div>
                  <div className="text-sm opacity-80 mt-1">{it.reason}</div>
                </li>
              ))}
            </ol>
          </section>
        )}

        <footer className="mt-10 text-xs opacity-60">
          <p>
            Non affiliato a Supercell. Tutti i marchi sono dei rispettivi
            proprietari.
          </p>
        </footer>
      </div>
    </main>
  );
}
