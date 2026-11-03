// What every level of the building looks like on a given day, from the schedule's own dates.
// Pure functions shared by the 3D scene and the 4D page.

import type { Level4D, Model4D, Stage4D, Task4D, Tower4D } from "./types";

export type Mode = "current" | "baseline";
export type Phase = "none" | "casting" | Stage4D | "complete";

export const STAGE_ORDER: Stage4D[] = ["structure", "masonry", "services", "finishes", "painting"];

export const PHASE_STYLE: Record<Phase, { color: string; label: string }> = {
  none: { color: "#cbd5e1", label: "Not started" },
  casting: { color: "#f97316", label: "Slab being cast" },
  structure: { color: "#94a3b8", label: "Structure done" },
  masonry: { color: "#c08457", label: "Blockwork & plaster" },
  services: { color: "#38bdf8", label: "Waterproofing & services" },
  finishes: { color: "#34d399", label: "Tiling, doors & windows" },
  painting: { color: "#a78bfa", label: "Painting & handover" },
  complete: { color: "#f8fafc", label: "Complete" },
};

const ms = (d: string | Date | null | undefined) => (d ? new Date(d).getTime() : NaN);

// The schedule's status date: up to it the current view shows what actually happened on site
// (actual start / finish and % complete from the MSP file); after it, the remaining plan.
let STATUS = NaN;
export function setStatusDate(d: string | null | undefined) { STATUS = d ? ms(d) : NaN; }

/** A task's dates in the chosen plan: actual dates where the work has started, else scheduled; or the original baseline. */
export function span(t: Task4D, mode: Mode) {
  if (mode === "baseline") {
    const s = t.baselineStart ? ms(t.baselineStart) : ms(t.start);
    const f = t.baselineFinish ? ms(t.baselineFinish) : ms(t.finish);
    return { s, f: Math.max(f, s) };
  }
  const s = ms(t.actualStart ?? t.start);
  const f = ms(t.percent >= 100 ? t.actualFinish ?? t.finish : t.finish);
  return { s, f: Math.max(f, s) };
}

const linear = (at: number, s: number, f: number) => (at < s ? 0 : at >= f ? 1 : f > s ? (at - s) / (f - s) : 1);

/** Share of a task done by a date: 0 before it starts, 1 when finished. */
export function elapsed(t: Task4D, at: number, mode: Mode) {
  if (mode === "baseline" || !Number.isFinite(STATUS)) { const { s, f } = span(t, mode); return linear(at, s, f); }
  const p = Math.min(1, Math.max(0, (t.percent ?? 0) / 100));
  if (p >= 1) return linear(at, ms(t.actualStart ?? t.start), ms(t.actualFinish ?? t.finish));
  if (p > 0) {
    // Started: reaches its actual % on the status date, then the rest by its scheduled finish.
    const s = ms(t.actualStart ?? t.start);
    if (at < s) return 0;
    if (at <= STATUS) return STATUS > s ? p * ((at - s) / (STATUS - s)) : p;
    const f = Math.max(ms(t.finish), STATUS + 864e5);
    return Math.min(1, p + (1 - p) * ((at - STATUS) / (f - STATUS)));
  }
  // Not started by the status date, so it cannot show as started before it.
  const s = Math.max(ms(t.start), STATUS);
  return linear(at, s, Math.max(ms(t.finish), s));
}

export interface LevelState { phase: Phase; progress: number; active: Task4D[]; done: number; total: number }

export function levelState(level: Level4D, at: number, mode: Mode): LevelState {
  const total = level.tasks.length;
  const done = level.tasks.filter((t) => elapsed(t, at, mode) >= 1).length;
  const active = level.tasks.filter((t) => { const e = elapsed(t, at, mode); return e > 0 && e < 1; });
  const structural = level.tasks.filter((t) => t.stage === "structure");
  if (structural.length) {
    // The level's own RCC tasks (with their actual progress) say how far the structure is.
    const sp = structural.reduce((n, t) => n + elapsed(t, at, mode), 0) / structural.length;
    if (sp <= 0) return { phase: active.length ? "casting" : "none", progress: active.length ? 0.15 : 0, active, done, total };
    if (sp < 1) return { phase: "casting", progress: sp, active, done, total };
  } else {
    // No RCC task names this level (e.g. a podium cast with the slab above): use that slab's dates.
    const st = mode === "baseline" && level.structureBaseline ? level.structureBaseline : level.structure;
    if (!st || at < ms(st.start)) return { phase: active.length ? "casting" : "none", progress: active.length ? 0.3 : 0, active, done, total };
    if (at < ms(st.finish)) return { phase: "casting", progress: (at - ms(st.start)) / Math.max(1, ms(st.finish) - ms(st.start)), active, done, total };
  }
  if (total && done === total) return { phase: "complete", progress: 1, active, done, total };
  let phase: Phase = "structure";
  for (const t of level.tasks) {
    if (!t.stage || elapsed(t, at, mode) <= 0) continue;
    if (STAGE_ORDER.indexOf(t.stage) > STAGE_ORDER.indexOf(phase as Stage4D)) phase = t.stage;
  }
  return { phase, progress: 1, active, done, total };
}

/** Per stage on one level: how far along it is at the date (null when the level has no such work). */
export function stageCell(level: Level4D, stage: Stage4D, at: number, mode: Mode) {
  const list = level.tasks.filter((t) => t.stage === stage);
  if (!list.length) return null;
  const fr = list.map((t) => elapsed(t, at, mode));
  const avg = fr.reduce((a, b) => a + b, 0) / fr.length;
  const s = Math.min(...list.map((t) => span(t, mode).s));
  const f = Math.max(...list.map((t) => span(t, mode).f));
  return { state: avg >= 1 ? "done" : avg > 0 ? "doing" : "todo", pct: Math.round(avg * 100), start: s, finish: f, tasks: list.length } as const;
}

export function towerSummary(tower: Tower4D, at: number, mode: Mode) {
  const states = tower.levels.map((l) => ({ l, s: levelState(l, at, mode) }));
  const withSlab = tower.levels.filter((l) => l.structure);
  const cast = states.filter((x) => x.l.structure && x.s.phase !== "none" && x.s.phase !== "casting").map((x) => x.l);
  const top = cast.filter((l) => l.kind !== "basement").at(-1) ?? cast.at(-1);
  const casting = states.find((x) => x.s.phase === "casting" && x.l.kind !== "basement");
  const stageReach = STAGE_ORDER.slice(1).map((stage) => {
    const levels = tower.levels.filter((l) => l.tasks.some((t) => t.stage === stage));
    const fin = levels.filter((l) => stageCell(l, stage, at, mode)?.state === "done");
    return { stage, done: fin.length, of: levels.length };
  });
  return { cast: cast.length, of: withSlab.length, top: top?.name ?? null, casting: casting?.l.name ?? null, stageReach, states };
}

/** Share of all scheduled work (by duration) that should be done by the date. */
export function plannedPercent(model: Model4D, at: number, mode: Mode) {
  let w = 0;
  let d = 0;
  const seen = new Set<number>();
  for (const tw of model.towers) {
    for (const t of [...tw.levels.flatMap((l) => l.tasks), ...tw.general]) {
      if (seen.has(t.uid)) continue; // a task on several floors counts once
      seen.add(t.uid);
      const { s, f } = span(t, mode);
      const dur = Math.max(1, f - s);
      w += dur;
      d += dur * elapsed(t, at, mode);
    }
  }
  return w ? Math.round((d / w) * 100) : 0;
}

export function activeTasks(model: Model4D, at: number, mode: Mode) {
  const out: (Task4D & { tower: string; levels: string[] })[] = [];
  for (const tw of model.towers) {
    const byUid = new Map<number, Task4D & { tower: string; levels: string[] }>();
    for (const l of tw.levels) for (const t of l.tasks) {
      const e = elapsed(t, at, mode);
      if (e <= 0 || e >= 1) continue;
      const x = byUid.get(t.uid) ?? { ...t, tower: tw.name, levels: [] };
      x.levels.push(l.name);
      byUid.set(t.uid, x);
    }
    for (const t of tw.general) { const e = elapsed(t, at, mode); if (e > 0 && e < 1) byUid.set(t.uid, { ...t, tower: tw.name, levels: [] }); }
    out.push(...byUid.values());
  }
  return out.sort((a, b) => span(a, mode).f - span(b, mode).f);
}

export const nice = (s: string) => {
  let first = true;
  return s.replace(/\s+/g, " ").replace(/-\s+/g, "-").trim().split(" ").map((w) => {
    if (/^(RCC|PCC|UGWT|STP|NOC'?S?|CP|VDP|MEP|LW|R\/F|LMR|OHT|MS|DG|OC)$/i.test(w)) { first = false; return w.toUpperCase(); }
    if (!/[a-z]/i.test(w) || /^\d/.test(w)) return w.toLowerCase();
    const out = first ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase();
    first = false;
    return out;
  }).join(" ").replace(/\( /g, "(").replace(/ \)/g, ")");
};

// ---------------------------------------------------------------------------
// Plan vs actual
// ---------------------------------------------------------------------------

const RANK: Record<Phase, number> = { none: 0, casting: 1, structure: 2, masonry: 3, services: 4, finishes: 5, painting: 6, complete: 7 };
const score = (s: LevelState) => RANK[s.phase] + (s.phase === "casting" ? s.progress * 0.99 : 0);

export type Gap = "behind" | "ahead" | "same";

/** Each level's planned (original baseline) and actual state on a date, and which is further along. */
export function compareTower(tower: Tower4D, at: number) {
  return tower.levels.map((l) => {
    const planned = levelState(l, at, "baseline");
    const actual = levelState(l, at, "current");
    const d = score(planned) - score(actual);
    return { level: l, planned, actual, gap: (d > 0.25 ? "behind" : d < -0.25 ? "ahead" : "same") as Gap };
  });
}

/**
 * How far behind the structure is: the actual top cast level, and the date the original plan had
 * that level cast. Today minus that date is the slip in days (negative when ahead).
 */
export function structureSlip(tower: Tower4D, at: number) {
  const cast = (mode: Mode) => tower.levels.filter((l) => l.structure && !["none", "casting"].includes(levelState(l, at, mode).phase));
  const actualCast = cast("current");
  const plannedCast = cast("baseline");
  const top = actualCast.filter((l) => l.kind !== "basement").at(-1) ?? actualCast.at(-1) ?? null;
  // The next level still to be cast is the one that sets the position on the plan.
  const uncast = tower.levels.filter((l) => l.structure && !actualCast.includes(l));
  const next = uncast.find((l) => l.kind !== "basement") ?? uncast[0] ?? null; // the tower, not a basement extension
  const plannedDate = next?.structureBaseline ? ms(next.structureBaseline.finish) : NaN;
  const days = Number.isFinite(plannedDate) ? Math.round((at - plannedDate) / 864e5) : null;
  return {
    actualTop: top?.name ?? null,
    actualCast: actualCast.length,
    plannedTop: (plannedCast.filter((l) => l.kind !== "basement").at(-1) ?? plannedCast.at(-1))?.name ?? null,
    plannedCast: plannedCast.length,
    of: tower.levels.filter((l) => l.structure).length,
    next: next?.name ?? null,
    nextPlannedBy: next?.structureBaseline?.finish ?? null,
    slipDays: days !== null && days > 0 ? days : days !== null ? 0 : null,
  };
}
