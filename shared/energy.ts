// Energy check-in: one level a day, and a gentle pattern once there's enough data. Pure.

import { addDays } from "./planner";

export const ENERGY_LEVELS = ["low", "ok", "high"] as const;
export type EnergyLevel = (typeof ENERGY_LEVELS)[number];
export type EnergyInsight = { habit: string; highPct: number; lowPct: number };

const WINDOW_DAYS = 60;
const MIN_CHECKINS = 14;
const MIN_PER_GROUP = 3;
const MIN_GAP = 20;

export function energyInsight(
  checkins: { day: string; level: EnergyLevel }[],
  habits: { name: string; createdOn: string; checks: ReadonlySet<string> }[],
  today: string,
): EnergyInsight | null {
  const from = addDays(today, -(WINDOW_DAYS - 1));
  const recent = checkins.filter((c) => c.day >= from && c.day <= today);
  const high = recent.filter((c) => c.level === "high").map((c) => c.day);
  const low = recent.filter((c) => c.level === "low").map((c) => c.day);
  if (recent.length < MIN_CHECKINS || high.length < MIN_PER_GROUP || low.length < MIN_PER_GROUP) return null;

  let best: EnergyInsight | null = null;
  for (const h of habits) {
    const hi = high.filter((d) => d >= h.createdOn);
    const lo = low.filter((d) => d >= h.createdOn);
    if (hi.length < MIN_PER_GROUP || lo.length < MIN_PER_GROUP) continue;
    const pct = (days: string[]) => Math.round((100 * days.filter((d) => h.checks.has(d)).length) / days.length);
    const candidate = { habit: h.name, highPct: pct(hi), lowPct: pct(lo) };
    const gap = Math.abs(candidate.highPct - candidate.lowPct);
    if (gap >= MIN_GAP && (!best || gap > Math.abs(best.highPct - best.lowPct))) best = candidate;
  }
  return best;
}

export function insightText(i: EnergyInsight): string {
  return i.highPct >= i.lowPct
    ? `On high-energy days you do ${i.habit} ${i.highPct}% of the time, on low days ${i.lowPct}%.`
    : `On low-energy days you do ${i.habit} more (${i.lowPct}%) than on high days (${i.highPct}%).`;
}
