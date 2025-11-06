// app/api/analyze/route.ts
import { NextResponse } from "next/server";

// Forziamo runtime Node (NO edge) per evitare limiti/behaviour diversi
export const runtime = "nodejs";

// ---- Cap massimi per eroi (TH10→TH17) ----
const HERO_CAPS: Record<number, { BK?: number; AQ?: number; GW?: number; RC?: number }> = {
  10: { BK: 40, AQ: 40 },
  11: { BK: 50, AQ: 50, GW: 20 },
  12: { BK: 65, AQ: 65, GW: 40 },
  13: { BK: 70, AQ: 70, GW: 50, RC: 25 },
  14: { BK: 80, AQ: 80, GW: 55, RC: 30 },
  15: { BK: 90, AQ: 90, GW: 65, RC: 35 },
  16: { BK: 95, AQ: 95, GW: 70, RC: 40 },
  17: { BK: 100, AQ: 100, GW: 75, RC: 45 },
};

function detectTH(village: any): number | null {
  const b = Array.isArray(village?.buildings) ? village.buildings : [];
  const th = b.find((x: any) => x?.data === 1000001)?.lvl;
  return typeof th === "number" ? th : null;
}

function extractHeroes(village: any): { BK?: number; AQ?: number; GW?: number; RC?: number } {
  const res: any = {};
  const arr = Array.isArray(village?.heroes) ? village.heroes : [];
  const hs = [...arr].sort((a, b) => (b?.lvl || 0) - (a?.lvl || 0));
  for (const h of hs) {
    const L = h?.lvl || 0;
    if (L >= 70 && res.AQ === undefined) { res.AQ = L; continue; }
    if (L >= 65 && res.BK === undefined) { res.BK = L; continue; }
    if (L >= 50 && res.GW === undefined) { res.GW = L; continue; }
    if (L >= 15 && res.RC === undefined) { res.RC = L; continue; }
  }
  return res;
}

const CATEGORY_WEIGHT: Record<string, number> = {
  Heroes: 3.0,
  Offense: 2.6,
  Utility: 1.8,
  Defense: 1.6,
  Economy: 1.2,
  Trap: 0.8,
  Walls: 0.3,
};

export async function POST(req: Request) {
  try {
    // Riceviamo già un payload "snello" dal client (vedi Step 2)
    const body = await req.json();
    const mode: "war" | "farm" = body?.mode === "farm" ? "farm" : "war";
    const village = body?.village;

    if (!village || typeof village !== "object") {
      return NextResponse.json({ error: "Invalid village JSON" }, { status: 400 });
    }

    const th = detectTH(village);
    if (!th || th < 10 || th > 17) {
      return NextResponse.json({ th: th ?? null, items: [], note: "TH non supportato (solo TH10–TH17)" });
    }

    // 1) EROI non maxati
    const caps = HERO_CAPS[th] || {};
    const heroes = extractHeroes(village);
    const items: any[] = [];

    const addHero = (key: keyof typeof heroes, label: string) => {
      const cur = heroes[key] ?? 0;
      const cap = caps[key as keyof typeof caps] ?? 0;
      if (cap > 0 && cur < cap) {
        items.push({
          id: `hero_${key.toLowerCase()}`,
          name: label,
          category: "Heroes",
          current: cur,
          max: cap,
          count: 1,
          weight: CATEGORY_WEIGHT.Heroes + (mode === "war" ? 0.2 : 0),
        });
      }
    };

    addHero("AQ", "Archer Queen");
    addHero("BK", "Barbarian King");
    addHero("GW", "Grand Warden");
    addHero("RC", "Royal Champion");

    // (Prossimo step: buildings/traps con raggruppamenti)

    items.sort((a, b) => b.weight - a.weight);
    return NextResponse.json({ th, mode, items });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
