"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { api, useApi } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import type { BuildingProfile, Level4D, Model4D, Project, ScheduleImport, Stage4D } from "@/lib/types";
import { drawingFor, flatsOn, floorKind, toSheet, wingKey } from "@/lib/building-geo";
import { Button, ErrorBox, Loading, Select } from "@/components/ui";
import { Icon, Spinner } from "@/components/geotech";
import { cx, fmtD } from "@/components/schedule";
import { PHASE_STYLE, STAGE_ORDER, activeTasks, compareTower, setStatusDate, structureSlip, elapsed, levelState, nice, plannedPercent, span, stageCell, towerSummary, type Mode } from "@/lib/four-d";
import type { Pick } from "@/components/schedule-4d-scene";

const Scene4D = dynamic(() => import("@/components/schedule-4d-scene").then((m) => m.Scene4D), { ssr: false, loading: () => <Loading /> });
const ProfileScene4D = dynamic(() => import("@/components/profile-scene").then((m) => m.ProfileScene4D), { ssr: false, loading: () => <Loading /> });

const DAY = 864e5;
const STEPS = [{ label: "1 week", days: 7 }, { label: "2 weeks", days: 14 }, { label: "1 month", days: 30 }];
// What each stage looks like in the 3D view (materials, not codes).
const LOOK = [
  { color: "#ffffff", label: "Not started (outline)" },
  { color: "#a0703f", label: "Slab being cast: props, deck, rebar" },
  { color: "#a9a59d", label: "Bare concrete frame + scaffolding" },
  { color: "#b4553a", label: "Brick walls" },
  { color: "#c9c5bd", label: "Plastered, services" },
  { color: "#5b8db8", label: "Windows fitted" },
  { color: "#efe4d0", label: "Painted / complete" },
];
const STAGE_SHORT: Record<Stage4D, string> = { structure: "Structure", masonry: "Block & plaster", services: "Services", finishes: "Finishes", painting: "Paint & handover" };

interface Model4DResponse { import: Omit<ScheduleImport, "tasks"> | null; model: Model4D | null; profile: BuildingProfile | null }

export default function Schedule4DPage() {
  const { data: projects } = useApi<Project[]>("/projects");
  const [projectId, setProjectId] = useState("");
  const project = projectId || projects?.[0]?._id || "";
  const { data, error, loading, reload } = useApi<Model4DResponse>(project ? `/schedule/model4d?project=${project}` : null);

  if (!projects) return <Loading />;
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">MSP 4D Model</h1>
          <p className="text-sm text-slate-500">
            {data?.import
              ? <>The building as it rises, from <b>{data.import.file.originalName}</b> · uploaded {fmtDateTime(data.import.createdAt)} by {data.import.uploadedBy?.name ?? "—"}</>
              : "Upload the MS Project schedule (.mpp) to see the building rise floor by floor."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {projects.length > 1 && (
            <Select value={project} onChange={(e) => setProjectId(e.target.value)} className="max-w-56">
              {projects.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
            </Select>
          )}
          <UploadButton project={project} onDone={reload} hasModel={!!data?.model} />
        </div>
      </header>
      <ErrorBox message={error} />
      {loading && !data ? <Loading /> : !data?.model ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
          No schedule yet. Upload the <b>.mpp</b> file above: every slab and every floor&apos;s work in it becomes the 4D model.
        </div>
      ) : !data.model.towers.length ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
          No wings or towers were found in this schedule (expected groups such as &ldquo;A-WING&rdquo; with slabs per floor). Upload the full .mpp.
        </div>
      ) : (
        <FourD model={data.model} profile={data.profile} />
      )}
    </div>
  );
}

function UploadButton({ project, onDone, hasModel }: { project: string; onDone: () => void; hasModel: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const upload = async (file: File) => {
    setBusy(true);
    setErr(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("project", project);
      await api("/schedule/imports", { method: "POST", body });
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col items-end gap-1">
      <label className={cx("inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800", (busy || !project) && "pointer-events-none opacity-60")}>
        {busy ? <><Spinner /> Reading schedule…</> : <><Icon name="upload" /> {hasModel ? "Upload new schedule" : "Upload MSP (.mpp)"}</>}
        <input type="file" accept=".mpp,.xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
      </label>
      {err && <span className="max-w-xs text-right text-xs text-red-600">{err}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------

function FourD({ model, profile }: { model: Model4D; profile: BuildingProfile | null }) {
  // Up to the status date the current view follows the actual % complete in the file.
  setStatusDate(model.statusDate);
  const start = new Date(model.start).getTime();
  const end = Math.max(new Date(model.finish).getTime(), model.baselineFinish ? new Date(model.baselineFinish).getTime() : 0);
  const status = model.statusDate ? new Date(model.statusDate).getTime() : start;
  const [at, setAt] = useState(status);
  const [view, setView] = useState<"current" | "baseline" | "compare">("current");
  const mode: Mode = view === "baseline" ? "baseline" : "current";
  const compare = view === "compare";
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(14);
  const [picked, setPickedRaw] = useState<Pick | null>(null);
  const [flat, setFlat] = useState<string | null>(null);
  const setPicked = (p: Pick | null) => { setPickedRaw(p); setFlat(null); };
  const [furnished, setFurnished] = useState(true);
  const [hover, setHover] = useState<(Pick & { state: ReturnType<typeof levelState> }) | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setAt((t) => {
      const next = t + step * DAY;
      if (next >= end) { setPlaying(false); return end; }
      return next;
    }), 160);
    return () => clearInterval(id);
  }, [playing, step, end]);

  const pct = useMemo(() => plannedPercent(model, at, mode), [model, at, mode]);
  const summaries = useMemo(() => model.towers.map((tw) => towerSummary(tw, at, mode)), [model, at, mode]);
  const active = useMemo(() => activeTasks(model, at, mode), [model, at, mode]);
  const comparison = useMemo(() => (compare ? model.towers.map((tw) => ({ rows: compareTower(tw, at), slip: structureSlip(tw, at) })) : null), [compare, model, at]);
  const marks = useMemo(() => {
    const m = new Map<string, "behind" | "ahead">();
    comparison?.forEach((c, i) => c.rows.forEach((r) => { if (r.gap !== "same") m.set(`${i}:${r.level.key}`, r.gap); }));
    return m;
  }, [comparison]);
  const level = picked ? model.towers[picked.tower]?.levels.find((l) => l.key === picked.level) ?? null : null;
  const hoverLevel = hover ? model.towers[hover.tower]?.levels.find((l) => l.key === hover.level) : null;

  const jump = (t: number) => { setPlaying(false); setAt(Math.min(end, Math.max(start, t))); };

  return (
    <div className="space-y-5">
      {/* Timeline */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => { if (at >= end) setAt(start); setPlaying((p) => !p); }} className="w-28">
            <Icon name={playing ? "clock" : "right"} /> {playing ? "Pause" : "Play"}
          </Button>
          <div>
            <div className="text-2xl font-semibold tabular-nums text-slate-900">{fmtD(new Date(at).toISOString())}</div>
            <div className="text-xs text-slate-500">{compare ? "Left: the original plan · right: actual progress from the MSP file" : `${pct}% of the work should be done by this date (${mode === "current" ? "current schedule" : "original baseline"})`}</div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
            <div className="flex rounded-lg bg-slate-100 p-0.5">
              {([["current", "Current schedule"], ["baseline", "Original plan"], ["compare", "Plan vs actual"]] as const).map(([v, label]) => (
                <button key={v} onClick={() => { setView(v); if (v === "compare") setPicked(null); }} className={cx("rounded-md px-3 py-1.5 text-xs font-medium", view === v ? (v === "compare" ? "bg-red-600 text-white shadow-sm" : "bg-white shadow-sm") : "text-slate-600")}>
                  {label}
                </button>
              ))}
            </div>
            <select value={step} onChange={(e) => setStep(Number(e.target.value))} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
              {STEPS.map((s) => <option key={s.days} value={s.days}>Play: {s.label} per tick</option>)}
            </select>
          </div>
        </div>
        <input type="range" min={start} max={end} step={DAY} value={at} onChange={(e) => jump(Number(e.target.value))} className="mt-4 w-full accent-slate-900" />
        <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs">
          <button onClick={() => jump(start)} className="text-slate-500 hover:text-slate-900">Start {fmtD(model.start)}</button>
          {model.statusDate && <button onClick={() => jump(status)} className="font-medium text-sky-700 hover:underline">Status date {fmtD(model.statusDate)}</button>}
          <button onClick={() => jump(now)} className="font-medium text-slate-700 hover:underline">Today</button>
          {model.baselineFinish && <button onClick={() => jump(new Date(model.baselineFinish!).getTime())} className="text-slate-500 hover:text-slate-900">Baseline finish {fmtD(model.baselineFinish)}</button>}
          <button onClick={() => jump(new Date(model.finish).getTime())} className="text-slate-500 hover:text-slate-900">Finish {fmtD(model.finish)}</button>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        {/* 3D */}
        {compare ? (
          <section className="grid h-[620px] grid-cols-2 gap-2">
            {(["baseline", "current"] as Mode[]).map((m) => (
              <div key={m} className={cx("relative overflow-hidden rounded-2xl border bg-slate-100 shadow-sm", m === "current" ? "border-red-200" : "border-slate-200")}>
                {profile
                  ? <ProfileScene4D model={model} profile={profile} at={at} mode={m} selected={null} onSelect={setPicked} onHover={() => {}} marks={m === "current" ? marks : undefined} labels={false} />
                  : <Scene4D model={model} at={at} mode={m} selected={null} onSelect={setPicked} onHover={() => {}} />}
                <div className={cx("pointer-events-none absolute left-3 top-3 rounded-lg px-3 py-1.5 text-sm font-bold tracking-wide text-white shadow", m === "current" ? "bg-red-600/90" : "bg-slate-900/85")}>
                  {m === "current" ? "ACTUAL · site progress" : "PLANNED · original baseline"}
                </div>
                {m === "current" && (
                  <div className="absolute bottom-3 left-3 flex gap-3 rounded-xl bg-white/90 px-3 py-2 text-[11px] shadow">
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-500" />behind the plan</span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-green-500" />ahead of the plan</span>
                  </div>
                )}
              </div>
            ))}
          </section>
        ) : (
        <section className="relative h-[620px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
          {profile
            ? <ProfileScene4D model={model} profile={profile} at={at} mode={mode} selected={picked} onSelect={setPicked} onHover={setHover} flat={flat} onFlat={(t, no) => { setPickedRaw((p) => (p && p.tower === t ? p : p ? { ...p, tower: t } : p)); setFlat(no); }} furnished={furnished} />
            : <Scene4D model={model} at={at} mode={mode} selected={picked} onSelect={setPicked} onHover={setHover} />}
          <div className="pointer-events-none absolute left-3 top-3 rounded-xl bg-white/90 px-3 py-2 text-xs shadow">
            {hover && hoverLevel ? (
              <>
                <div className="font-semibold text-slate-900">{model.towers[hover.tower].name} · {hoverLevel.name}</div>
                <div className="text-slate-600">{PHASE_STYLE[hover.state.phase].label}{hover.state.phase === "casting" ? ` (${Math.round(hover.state.progress * 100)}%)` : ""}</div>
                <div className="text-slate-500">{hover.state.done} of {hover.state.total} tasks done · {hover.state.active.length} under way</div>
              </>
            ) : <span className="text-slate-500">Drag to turn · scroll to zoom · click a floor for its tasks</span>}
          </div>
          {picked && profile && (
            <div className="absolute right-3 top-3 flex gap-2">
              {/^F\d+$/.test(picked.level) && (
                <div className="flex rounded-lg bg-white/95 p-0.5 text-xs shadow">
                  {[["Furnished", true], ["Plan drawing", false]].map(([label, v]) => (
                    <button key={String(label)} onClick={() => setFurnished(v as boolean)} className={cx("rounded-md px-2.5 py-1 font-medium", furnished === v ? "bg-slate-900 text-white" : "text-slate-600")}>{label as string}</button>
                  ))}
                </div>
              )}
              <button onClick={() => setPicked(null)} className="rounded-lg bg-slate-900/90 px-3 py-1.5 text-xs font-medium text-white shadow hover:bg-slate-800">← Whole building</button>
            </div>
          )}
          <div className="absolute bottom-3 left-3 flex flex-wrap gap-x-3 gap-y-1 rounded-xl bg-white/90 px-3 py-2 text-[11px] shadow">
            {LOOK.map((x) => (
              <span key={x.label} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm ring-1 ring-slate-300" style={{ background: x.color }} />{x.label}</span>
            ))}
          </div>
        </section>
        )}

        {/* At this date */}
        <aside className="space-y-4">
          {compare && comparison && <ComparePanel model={model} comparison={comparison} at={at} onPick={setPicked} />}
          {!compare && model.towers.map((tw, i) => {
            const s = summaries[i];
            return (
              <section key={tw.uid} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-baseline justify-between">
                  <h3 className="font-semibold text-slate-900">{tw.name}</h3>
                  <span className="text-xs text-slate-500">finish {fmtD(tw.finish)}</span>
                </div>
                <div className="mt-2 text-sm text-slate-700">
                  <b className="tabular-nums">{s.cast}</b> of {s.of} slabs cast{s.top ? <> · up to <b>{s.top}</b></> : ""}
                </div>
                {s.casting && <div className="text-xs text-orange-700">Casting now: {s.casting}</div>}
                <div className="mt-2 space-y-1.5">
                  {s.stageReach.map((r) => (
                    <div key={r.stage} className="text-xs">
                      <div className="flex justify-between text-slate-600"><span>{STAGE_SHORT[r.stage]}</span><span className="tabular-nums">{r.done}/{r.of} levels done</span></div>
                      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${r.of ? (r.done / r.of) * 100 : 0}%`, background: PHASE_STYLE[r.stage].color }} /></div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
          {!compare && <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="font-semibold text-slate-900">Work under way</h3>
              <span className="text-xs text-slate-500">{active.length} tasks</span>
            </div>
            <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1 text-xs">
              {active.slice(0, 40).map((t) => (
                <li key={`${t.tower}-${t.uid}`} className="flex items-start gap-2">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-sm" style={{ background: PHASE_STYLE[t.stage ?? "structure"].color }} />
                  <span className="min-w-0 flex-1">
                    <span className="text-slate-800">{nice(t.activity)}</span>
                    <span className="block text-slate-500">{t.tower}{t.levels.length ? ` · ${t.levels.length > 2 ? `${t.levels[0]} – ${t.levels.at(-1)}` : t.levels.join(", ")}` : ""} · to {fmtD(new Date(span(t, mode).f).toISOString())}</span>
                  </span>
                </li>
              ))}
              {!active.length && <li className="text-slate-400">Nothing scheduled on this date.</li>}
            </ul>
          </section>}
        </aside>
      </div>

      {profile && <FlatsSummary model={model} profile={profile} at={at} mode={mode} />}

      {level && picked && profile && /^F\d+$/.test(level.key) && (
        <FloorPlan profile={profile} tower={model.towers[picked.tower].name} index={picked.tower} level={level} at={at} mode={mode} flat={flat} onFlat={setFlat} />
      )}
      {level && picked && <LevelDetail tower={model.towers[picked.tower].name} level={level} at={at} mode={mode} onClose={() => setPicked(null)} />}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold text-slate-900">Floor by floor on {fmtD(new Date(at).toISOString())}{compare ? " · planned | actual" : ""}</h3>
          <span className="flex flex-wrap gap-3 text-[11px] text-slate-500">
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />done</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-amber-400" />under way</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-slate-200" />not started</span>
            <span>click a row for its tasks</span>
          </span>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          {model.towers.map((tw, i) => (
            <FloorGrid key={tw.uid} name={tw.name} levels={tw.levels} at={at} mode={mode} compare={compare} picked={picked?.tower === i ? picked.level : null} onPick={(key) => setPicked({ tower: i, level: key })} />
          ))}
        </div>
      </section>
    </div>
  );
}

function FloorGrid({ name, levels, at, mode, compare, picked, onPick }: { name: string; levels: Level4D[]; at: number; mode: Mode; compare?: boolean; picked: string | null; onPick: (key: string) => void }) {
  const rows = [...levels].reverse();
  return (
    <div>
      <div className="mb-1 text-sm font-semibold text-slate-700">{name}</div>
      <div className="max-h-[520px] overflow-y-auto rounded-xl ring-1 ring-slate-200">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-white">
            <tr className="text-[10px] uppercase tracking-wide text-slate-500">
              <th className="px-2 py-1.5 text-left font-medium">Level</th>
              {STAGE_ORDER.map((s) => <th key={s} className="px-1 py-1.5 font-medium">{STAGE_SHORT[s]}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.key} onClick={() => onPick(l.key)} className={cx("cursor-pointer border-t border-slate-100", picked === l.key ? "bg-sky-50" : "hover:bg-slate-50")}>
                <td className="whitespace-nowrap px-2 py-1 font-medium text-slate-700">{l.name}</td>
                {STAGE_ORDER.map((s) => {
                  if (compare) return <td key={s} className="px-1 py-1"><CompareCell level={l} stage={s} at={at} /></td>;
                  const c = stageCell(l, s, at, mode);
                  return (
                    <td key={s} className="px-1 py-1">
                      {c ? (
                        <div
                          title={`${STAGE_SHORT[s]}: ${fmtD(new Date(c.start).toISOString())} → ${fmtD(new Date(c.finish).toISOString())} · ${c.tasks} task${c.tasks === 1 ? "" : "s"}`}
                          className={cx("h-5 rounded text-center text-[10px] font-semibold leading-5", c.state === "done" ? "bg-emerald-500 text-white" : c.state === "doing" ? "bg-amber-400 text-amber-950" : "bg-slate-200 text-slate-500")}
                        >
                          {c.state === "doing" ? `${c.pct}%` : c.state === "done" ? "✓" : ""}
                        </div>
                      ) : <div className="h-5" />}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LevelDetail({ tower, level, at, mode, onClose }: { tower: string; level: Level4D; at: number; mode: Mode; onClose: () => void }) {
  const st = levelState(level, at, mode);
  return (
    <section className="rounded-2xl border border-sky-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{tower} · {level.name}</h3>
          <p className="text-sm text-slate-600">
            <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle ring-1 ring-slate-300" style={{ background: PHASE_STYLE[st.phase].color }} />
            {PHASE_STYLE[st.phase].label} on {fmtD(new Date(at).toISOString())} · {st.done} of {st.total} tasks done
            {level.structure && <> · slab {fmtD(level.structure.start)} → {fmtD(level.structure.finish)}{level.structureFrom ? ` (cast with ${level.structureFrom})` : ""}</>}
          </p>
        </div>
        <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-900">Close ✕</button>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-slate-500">
              {["Work", "Trade", mode === "current" ? "Scheduled" : "Original plan", "On this date", "Actual (file)", ""].map((h) => <th key={h} className="px-2 py-1.5 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {level.tasks.map((t) => {
              const e = elapsed(t, at, mode);
              const sp = span(t, mode);
              return (
                <tr key={t.uid}>
                  <td className="px-2 py-1.5">
                    <span className="mr-2 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: PHASE_STYLE[t.stage ?? "structure"].color }} />
                    <span className="text-slate-800">{nice(t.activity)}</span>{t.sharedWith && <span className="ml-1 text-[11px] text-slate-500">(cast with {t.sharedWith})</span>}
                    {t.critical && <span className="ml-2 rounded bg-red-100 px-1 text-[10px] font-semibold text-red-700">CRITICAL</span>}
                  </td>
                  <td className="px-2 py-1.5 text-xs text-slate-500">{nice(t.trade)}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-xs tabular-nums">{fmtD(new Date(sp.s).toISOString())} → {fmtD(new Date(sp.f).toISOString())}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-xs">{e >= 1 ? <span className="text-emerald-700">done</span> : e > 0 ? <span className="text-amber-700">under way ({Math.round(e * 100)}%)</span> : <span className="text-slate-400">not started</span>}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-xs">{t.percent}% · <span className={t.status === "Overdue" ? "text-red-600" : "text-slate-500"}>{t.status.toLowerCase()}</span></td>
                  <td className="px-2 py-1.5 text-[11px] text-slate-400">{t.wbs}</td>
                </tr>
              );
            })}
            {!level.tasks.length && <tr><td colSpan={6} className="px-2 py-4 text-center text-slate-400">No tasks name this level directly.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Flats, from the floor plans
// ---------------------------------------------------------------------------

function FlatsSummary({ model, profile, at, mode }: { model: Model4D; profile: BuildingProfile; at: number; mode: Mode }) {
  const rows = useMemo(() => {
    const types = [...new Set(profile.units.map((u) => u.type))];
    const perWing = model.towers.map((tw) => {
      const floors = tw.levels.filter((l) => /^F\d+$/.test(l.key));
      const flats = floors.flatMap((l) => flatsOn(profile, l.key).map((f) => ({ ...f, ready: levelState(l, at, mode).phase === "complete", structure: !["none", "casting"].includes(levelState(l, at, mode).phase) })));
      return { name: tw.name, flats };
    });
    return { types, perWing };
  }, [model, profile, at, mode]);
  const total = rows.perWing.reduce((n, w) => n + w.flats.length, 0);
  const sqft = rows.perWing.reduce((n, w) => n + w.flats.reduce((m, f) => m + f.totalSqft, 0), 0);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-slate-900">Flats in {profile.name} <span className="font-normal text-slate-500">· {total} flats · {sqft.toLocaleString("en-IN")} sq ft carpet</span></h3>
        <span className="text-xs text-slate-500">from the typical and refuge floor plans · status on {fmtD(new Date(at).toISOString())}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-slate-500">
              <th className="px-2 py-1.5 font-medium">Type</th>
              <th className="px-2 py-1.5 font-medium">Carpet</th>
              {rows.perWing.map((w) => <th key={w.name} className="px-2 py-1.5 font-medium">{w.name}: flats · structure up · ready</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.types.map((type) => {
              const u = profile.units.find((x) => x.type === type)!;
              return (
                <tr key={type}>
                  <td className="px-2 py-1.5 font-medium text-slate-800">{type}</td>
                  <td className="px-2 py-1.5 text-xs text-slate-600">{u.carpetSqm} m² · {u.totalSqft} sq ft</td>
                  {rows.perWing.map((w) => {
                    const fl = w.flats.filter((f) => f.type === type);
                    return <td key={w.name} className="px-2 py-1.5 text-xs tabular-nums"><b>{fl.length}</b> · {fl.filter((f) => f.structure).length} · <span className="text-emerald-700">{fl.filter((f) => f.ready).length}</span></td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FloorPlan({ profile, tower, index, level, at, mode, flat, onFlat }: {
  profile: BuildingProfile; tower: string; index: number; level: Level4D; at: number; mode: Mode;
  flat: string | null; onFlat: (no: string | null) => void;
}) {
  const key = wingKey(tower);
  const sheet = drawingFor(profile, key, level.key);
  const mirror = profile.wings[key]?.mirror ?? index % 2 === 1;
  const st = levelState(level, at, mode);
  const kind = floorKind(profile, level.key);
  const flats = flatsOn(profile, level.key);
  const onFloor = new Set(flats.map((f) => f.no));
  const floorNo = level.key.slice(1);
  const color = PHASE_STYLE[st.phase].color;
  const [hover, setHover] = useState<string | null>(null);
  // Without a sheet, fall back to the traced outline in the profile's own coordinates.
  const map = (ax: number, ay: number): [number, number] => (sheet ? toSheet(profile, sheet, ax, ay) : [ax, mirror ? profile.plan.y0 + profile.plan.y1 - ay : ay]);
  const box = (r: [number, number, number, number]) => {
    const [ax, ay] = map(r[0], r[1]);
    const [bx, by] = map(r[2], r[3]);
    return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
  };
  const [vx0, vy0, vx1, vy1] = sheet ? sheet.bbox : [profile.plan.x0, profile.plan.y0, profile.plan.x1, profile.plan.y1];
  const pad = 24;
  const scale = sheet ? (sheet.bbox[2] - sheet.bbox[0]) / (profile.plan.x1 - profile.plan.x0) : 1;
  const selected = flat ? profile.units.find((u) => u.no === flat) : null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-slate-900">{tower} · {level.name} floor plan
          <span className="ml-2 text-sm font-normal text-slate-500">
            {kind === "refuge" ? `refuge floor${sheet && drawingFor(profile, key, level.key) !== profile.drawings?.[key]?.typical ? "" : " (refuge area marked on the typical sheet)"}` : kind === "typical" ? "typical floor" : "drawing not provided for this floor: typical sheet shown"}
          </span>
        </h3>
        <span className="text-xs text-slate-500">{PHASE_STYLE[st.phase].label} on {fmtD(new Date(at).toISOString())} · click a flat</span>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <svg viewBox={`${vx0 - pad} ${vy0 - pad} ${vx1 - vx0 + pad * 2} ${vy1 - vy0 + pad * 2}`} className="w-full rounded-xl bg-white ring-1 ring-slate-200">
          {sheet && <image href={sheet.src} x={0} y={0} width={sheet.size[0]} height={sheet.size[1]} preserveAspectRatio="none" />}
          {!sheet && profile.core.map((c) => { const r = box(c.rect); return <rect key={c.name} x={r.x} y={r.y} width={r.w} height={r.h} fill="#e2e8f0" stroke="#94a3b8" />; })}
          {profile.units.map((u) => {
            const r = box(u.rect);
            const refuge = !onFloor.has(u.no);
            const isSel = flat === u.no;
            const isHover = hover === u.no;
            return (
              <g key={u.no} className="cursor-pointer" onClick={() => onFlat(refuge ? null : isSel ? null : u.no)} onMouseEnter={() => setHover(u.no)} onMouseLeave={() => setHover(null)}>
                <rect x={r.x} y={r.y} width={r.w} height={r.h}
                  fill={refuge ? "url(#hatch)" : color} fillOpacity={refuge ? 0.6 : isSel ? 0.45 : isHover ? 0.35 : st.phase === "none" ? 0.08 : 0.22}
                  stroke={isSel ? "#1d4ed8" : refuge ? "#64748b" : "#0f172a"} strokeOpacity={isSel || isHover ? 1 : 0.35} strokeWidth={(isSel ? 7 : 3) * scale} strokeDasharray={refuge ? `${10 * scale} ${7 * scale}` : undefined} />
                <g transform={`translate(${r.x + r.w / 2} ${r.y + 26 * scale})`}>
                  <rect x={-46 * scale} y={-15 * scale} width={92 * scale} height={30 * scale} rx={15 * scale} fill={refuge ? "#475569" : isSel ? "#1d4ed8" : "#0f172a"} fillOpacity={0.88} />
                  <text y={6 * scale} fontSize={17 * scale} fontWeight={700} textAnchor="middle" fill="#fff">{refuge ? "Refuge" : `${floorNo}${u.no}`}</text>
                </g>
              </g>
            );
          })}
          <defs>
            <pattern id="hatch" width={12 * scale} height={12 * scale} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width={12 * scale} height={12 * scale} fill="#f1f5f9" />
              <line x1={0} y1={0} x2={0} y2={12 * scale} stroke="#94a3b8" strokeWidth={4 * scale} />
            </pattern>
          </defs>
        </svg>
        <div className="space-y-3">
          {selected ? (
            <FlatCard profile={profile} sheet={sheet} unit={selected} tower={tower} floorNo={floorNo} level={level} at={at} mode={mode} map={map} onClose={() => onFlat(null)} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-slate-500">
                    {["Flat", "Type", "Carpet", "Balcony", "Dry bal.", "Total"].map((h) => <th key={h} className="px-2 py-1.5 font-medium">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {flats.map((f) => (
                    <tr key={f.flatNo} onClick={() => onFlat(f.no)} onMouseEnter={() => setHover(f.no)} onMouseLeave={() => setHover(null)} className={cx("cursor-pointer", hover === f.no ? "bg-sky-50" : "hover:bg-slate-50")}>
                      <td className="px-2 py-1.5 font-semibold tabular-nums">{f.flatNo}</td>
                      <td className="px-2 py-1.5">{f.type}</td>
                      <td className="px-2 py-1.5 tabular-nums text-slate-600">{f.carpetSqm} m²</td>
                      <td className="px-2 py-1.5 tabular-nums text-slate-600">{f.balconySqm} m²</td>
                      <td className="px-2 py-1.5 tabular-nums text-slate-600">{f.dryBalconySqm} m²</td>
                      <td className="px-2 py-1.5 tabular-nums">{f.totalSqft} sq ft</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <StageStrip level={level} at={at} mode={mode} />
        </div>
      </div>
    </section>
  );
}

function StageStrip({ level, at, mode }: { level: Level4D; at: number; mode: Mode }) {
  return (
    <div className="grid grid-cols-5 gap-1 text-center text-[10px]">
      {STAGE_ORDER.map((s) => {
        const c = stageCell(level, s, at, mode);
        return (
          <div key={s} title={c ? `${fmtD(new Date(c.start).toISOString())} → ${fmtD(new Date(c.finish).toISOString())}` : undefined}
            className={cx("rounded-lg px-1 py-1.5", !c ? "bg-slate-50 text-slate-300" : c.state === "done" ? "bg-emerald-100 text-emerald-800" : c.state === "doing" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-500")}>
            <div className="font-semibold">{STAGE_SHORT[s]}</div>
            <div>{!c ? "—" : c.state === "done" ? "done" : c.state === "doing" ? `${c.pct}%` : "not started"}</div>
          </div>
        );
      })}
    </div>
  );
}

const SIDE_NAME: Record<string, string> = { N: "north", S: "south", E: "east", W: "west" };

function FlatCard({ profile, sheet, unit, tower, floorNo, level, at, mode, map, onClose }: {
  profile: BuildingProfile; sheet: ReturnType<typeof drawingFor>; unit: BuildingProfile["units"][number]; tower: string; floorNo: string;
  level: Level4D; at: number; mode: Mode; map: (x: number, y: number) => [number, number]; onClose: () => void;
}) {
  const key = wingKey(tower);
  const mirror = profile.wings[key]?.mirror ?? false;
  const [ax, ay] = map(unit.rect[0], unit.rect[1]);
  const [bx, by] = map(unit.rect[2], unit.rect[3]);
  const x = Math.min(ax, bx);
  const y = Math.min(ay, by);
  const w = Math.abs(bx - ax);
  const h = Math.abs(by - ay);
  const pad = Math.max(w, h) * 0.06;
  const st = levelState(level, at, mode);
  const flip = (s: string) => (mirror ? ({ N: "S", S: "N" } as Record<string, string>)[s] ?? s : s);
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-lg font-semibold text-slate-900">Flat {floorNo}{unit.no} <span className="text-sm font-normal text-slate-600">· {unit.type}</span></div>
          <div className="text-xs text-slate-500">{tower} · {level.name} · unit {unit.no}</div>
        </div>
        <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-900">All flats ✕</button>
      </div>
      {sheet && (
        <svg viewBox={`${x - pad} ${y - pad} ${w + pad * 2} ${h + pad * 2}`} className="mt-2 w-full rounded-lg bg-white ring-1 ring-slate-200">
          <image href={sheet.src} x={0} y={0} width={sheet.size[0]} height={sheet.size[1]} preserveAspectRatio="none" />
          <rect x={x} y={y} width={w} height={h} fill="none" stroke="#1d4ed8" strokeWidth={Math.max(w, h) * 0.008} />
        </svg>
      )}
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <dt className="text-slate-500">Carpet area</dt><dd className="text-right tabular-nums">{unit.carpetSqm} m²</dd>
        <dt className="text-slate-500">Balcony</dt><dd className="text-right tabular-nums">{unit.balconySqm} m²</dd>
        <dt className="text-slate-500">Dry balcony</dt><dd className="text-right tabular-nums">{unit.dryBalconySqm} m²</dd>
        <dt className="font-medium text-slate-700">Total carpet</dt><dd className="text-right font-semibold tabular-nums">{unit.totalSqft} sq ft</dd>
        <dt className="text-slate-500">Balconies face</dt><dd className="text-right">{[...new Set(unit.balconies.map((b) => SIDE_NAME[flip(b.side)]))].join(", ")} ({unit.balconies.length})</dd>
        <dt className="text-slate-500">On {fmtD(new Date(at).toISOString())}</dt><dd className="text-right">{PHASE_STYLE[st.phase].label}</dd>
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plan vs actual
// ---------------------------------------------------------------------------

const cellTone = (c: ReturnType<typeof stageCell>) => (!c ? "bg-transparent" : c.state === "done" ? "bg-emerald-500 text-white" : c.state === "doing" ? "bg-amber-400 text-amber-950" : "bg-slate-200 text-slate-500");

function CompareCell({ level, stage, at }: { level: Level4D; stage: Stage4D; at: number }) {
  const p = stageCell(level, stage, at, "baseline");
  const a = stageCell(level, stage, at, "current");
  if (!p && !a) return <div className="h-5" />;
  const behind = (p?.pct ?? 0) - (a?.pct ?? 0) > 10;
  const label = (c: typeof p) => (!c ? "" : c.state === "done" ? "✓" : c.state === "doing" ? `${c.pct}` : "");
  return (
    <div title={`Planned: ${p ? `${p.pct}%` : "—"} · Actual: ${a ? `${a.pct}%` : "—"}`} className={cx("flex h-5 overflow-hidden rounded text-center text-[9px] font-semibold leading-5", behind && "ring-2 ring-red-500")}>
      <div className={cx("flex-1", cellTone(p))}>{label(p)}</div>
      <div className={cx("flex-1 border-l border-white", cellTone(a))}>{label(a)}</div>
    </div>
  );
}

function ComparePanel({ model, comparison, at, onPick }: {
  model: Model4D; comparison: { rows: ReturnType<typeof compareTower>; slip: ReturnType<typeof structureSlip> }[]; at: number; onPick: (p: Pick) => void;
}) {
  const slipFinish = model.baselineFinish ? Math.round((new Date(model.finish).getTime() - new Date(model.baselineFinish).getTime()) / 864e5) : null;
  return (
    <>
      <section className="rounded-2xl border border-red-200 bg-red-50/50 p-4 shadow-sm">
        <h3 className="font-semibold text-red-900">Plan vs actual on {fmtD(new Date(at).toISOString())}</h3>
        {slipFinish !== null && (
          <p className="mt-1 text-sm text-red-900">
            Handover was planned for <b>{fmtD(model.baselineFinish)}</b>; the current schedule says <b>{fmtD(model.finish)}</b>
            {slipFinish > 0 ? <> — <b>{slipFinish} days late</b>.</> : slipFinish < 0 ? <> — {-slipFinish} days early.</> : "."}
          </p>
        )}
      </section>
      {model.towers.map((tw, i) => {
        const { rows, slip } = comparison[i];
        const behind = rows.filter((r) => r.gap === "behind");
        const ahead = rows.filter((r) => r.gap === "ahead");
        const stages = STAGE_ORDER.slice(1).map((s) => {
          const lv = tw.levels.filter((l) => l.tasks.some((t) => t.stage === s));
          const done = (m: Mode) => lv.filter((l) => stageCell(l, s, at, m)?.state === "done").length;
          return { s, of: lv.length, planned: done("baseline"), actual: done("current") };
        });
        return (
          <section key={tw.uid} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-baseline justify-between">
              <h3 className="font-semibold text-slate-900">{tw.name}</h3>
              {slip.slipDays ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">{slip.slipDays} days behind</span>
                : <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">on plan</span>}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg bg-slate-50 p-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Planned</div>
                <div className="text-lg font-semibold tabular-nums">{slip.plannedCast}<span className="text-xs text-slate-400">/{slip.of}</span></div>
                <div className="text-[11px] text-slate-600">slabs · up to {slip.plannedTop ?? "—"}</div>
              </div>
              <div className="rounded-lg bg-red-50 p-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-red-700">Actual</div>
                <div className="text-lg font-semibold tabular-nums">{slip.actualCast}<span className="text-xs text-slate-400">/{slip.of}</span></div>
                <div className="text-[11px] text-slate-600">slabs · up to {slip.actualTop ?? "—"}</div>
              </div>
            </div>
            {slip.next && slip.nextPlannedBy && (
              <p className="mt-2 text-xs text-slate-600">
                Next slab <b>{slip.next}</b> was planned to be cast by <b>{fmtD(slip.nextPlannedBy)}</b>{slip.slipDays ? <> — it is {slip.slipDays} days overdue.</> : "."}
              </p>
            )}
            <div className="mt-3 space-y-1.5">
              {stages.map((r) => (
                <div key={r.s} className="text-xs">
                  <div className="flex justify-between text-slate-600"><span>{STAGE_SHORT[r.s]}</span><span className="tabular-nums">plan {r.planned} · actual <b className={r.actual < r.planned ? "text-red-700" : ""}>{r.actual}</b> /{r.of}</span></div>
                  <div className="relative mt-0.5 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="absolute inset-y-0 left-0 rounded-full bg-slate-300" style={{ width: `${r.of ? (r.planned / r.of) * 100 : 0}%` }} />
                    <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${r.of ? (r.actual / r.of) * 100 : 0}%`, background: PHASE_STYLE[r.s].color }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs">
              <div className="mb-1 font-medium text-slate-700">{behind.length} level{behind.length === 1 ? "" : "s"} behind{ahead.length ? ` · ${ahead.length} ahead` : ""}</div>
              <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
                {behind.map((r) => (
                  <button key={r.level.key} onClick={() => onPick({ tower: i, level: r.level.key })} title={`Planned: ${PHASE_STYLE[r.planned.phase].label} · Actual: ${PHASE_STYLE[r.actual.phase].label}`}
                    className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800 hover:bg-red-200">{r.level.name}</button>
                ))}
                {ahead.map((r) => (
                  <button key={r.level.key} onClick={() => onPick({ tower: i, level: r.level.key })} className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 hover:bg-emerald-200">{r.level.name}</button>
                ))}
              </div>
            </div>
          </section>
        );
      })}
    </>
  );
}
