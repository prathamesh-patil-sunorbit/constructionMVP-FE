"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate, fmtDateTime, fmtWeekday, todayInput } from "@/lib/format";
import { HINDRANCE_TYPES, isManager, type PlinthDay, type PlinthItem, type PlinthPlan } from "@/lib/types";
import { Badge, Button, ErrorBox, Loading } from "@/components/ui";
import { EquipmentTile, Icon, Spinner } from "@/components/geotech";
import {
  Check, MiniBar, PHASE_TONE, Ring, cx, currentDay, dayPercent, doneCount, isBehind, timing, toggleItem, usePlinthPlans,
} from "@/components/plinth-plan";

// Days the weather takes are marked so the engineer knows why the phase work is not on them.
const WEATHER_BADGE: Record<string, { tone: string; text: string }> = {
  rain: { tone: "blue", text: "Rain day" },
  light: { tone: "blue", text: "Wet day" },
  recovery: { tone: "amber", text: "Dry-out" },
  buffer: { tone: "slate", text: "Weather buffer" },
};
function WeatherBadge({ kind }: { kind: string }) {
  const b = WEATHER_BADGE[kind];
  return b ? <Badge tone={b.tone}>{b.text}</Badge> : null;
}

export default function PlinthPlanPage() {
  const { user } = useAuth();
  const canEdit = isManager(user?.role) || user?.role === "site_engineer";
  const { plans, error, loading, update } = usePlinthPlans();
  const [planId, setPlanId] = useState<string | null>(null);
  const [dayId, setDayId] = useState<string | null>(null);

  const plan = plans?.find((p) => p.report._id === planId) ?? plans?.[0] ?? null;
  const day = useMemo(() => (plan ? plan.days.find((d) => d._id === dayId) ?? currentDay(plan) : null), [plan, dayId]);

  if (loading && !plans) return <Loading />;

  if (!plan || !day) {
    return (
      <div className="space-y-5">
        <ErrorBox message={error} />
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-slate-500"><Icon name="clipboard" className="h-6 w-6" /></span>
          <p className="font-medium text-slate-800">No plinth plan on site yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            When a manager accepts a plinth estimate, its day-by-day checklist appears here, with the crew and machines needed each day.
          </p>
          {isManager(user?.role) && <Link href="/geotech" className="mt-4 inline-flex rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">Go to Plinth Estimate</Link>}
        </div>
      </div>
    );
  }

  const select = (id: string) => setDayId(id);
  const index = plan.days.findIndex((d) => d._id === day._id);

  return (
    <div className="space-y-5">
      <ErrorBox message={error} />
      <Hero plan={plan} plans={plans ?? []} onPlan={(id) => { setPlanId(id); setDayId(null); }} onToday={() => setDayId(null)} />
      <CatchUp plan={plan} selectedId={day._id} onSelect={select} />
      <DayStrip plan={plan} selectedId={day._id} onSelect={select} />

      <div className="grid items-start gap-5 xl:grid-cols-[1fr_21rem]">
        <DayDetail
          key={day._id}
          day={day}
          canEdit={canEdit}
          onChange={update}
          onPrev={index > 0 ? () => select(plan.days[index - 1]._id) : undefined}
          onNext={index < plan.days.length - 1 ? () => select(plan.days[index + 1]._id) : undefined}
        />
        <UpNext plan={plan} selectedId={day._id} onSelect={select} />
      </div>

      <HindranceRegister plan={plan} onSelect={select} />
    </div>
  );
}

// ---------------------------------------------------------------------------

const PHASE_HEX: Record<string, string> = { excavation: "#d97706", pcc: "#78716c", foundation: "#ea580c", plinthBeam: "#0284c7", backfill: "#059669" };
const hexOf = (key: string) => PHASE_HEX[key] || "#64748b";

function phaseGroups(plan: PlinthPlan) {
  const out: { key: string; name: string; days: PlinthDay[] }[] = [];
  for (const d of plan.days) {
    const last = out[out.length - 1];
    if (last && last.key === d.phaseKey) last.days.push(d);
    else out.push({ key: d.phaseKey, name: d.phaseName, days: [d] });
  }
  return out;
}

function Hero({ plan, plans, onPlan, onToday }: { plan: PlinthPlan; plans: PlinthPlan[]; onPlan: (id: string) => void; onToday: () => void }) {
  const s = plan.summary;
  const t = todayInput();
  const startDay = plan.start.slice(0, 10);
  const endDay = plan.end.slice(0, 10);
  const when = s.todayDay ? `Day ${s.todayDay} of ${s.totalDays}` : t < startDay ? `Starts ${fmtDate(plan.start)}` : t > endDay ? "Plan period over" : "Between days";
  const groups = phaseGroups(plan);
  const todayIdx = plan.days.findIndex((d) => timing(d).isToday);
  const stats = [
    { label: "Today", value: when, icon: "calendar" as const, glow: "from-sky-400/25", tone: "text-white" },
    { label: "Days finished", value: `${s.doneDays} of ${s.totalDays}`, icon: "check" as const, glow: "from-emerald-400/25", tone: "text-white" },
    { label: "Behind schedule", value: s.behindDays ? `${s.behindDays} day${s.behindDays === 1 ? "" : "s"}` : "None", icon: "clock" as const, glow: s.behindDays ? "from-red-400/30" : "from-emerald-400/25", tone: s.behindDays ? "text-red-300" : "text-emerald-300" },
    { label: "Plinth ready", value: fmtDate(plan.end, true), icon: "flag" as const, glow: "from-amber-400/25", tone: "text-white" },
  ];
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-[#1b2742] text-white shadow-[0_20px_50px_-20px_rgba(15,23,42,.6)]">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-amber-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-96 rounded-full bg-sky-500/10 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "28px 28px" }} />

      <div className="relative flex flex-wrap items-center gap-6 px-7 pt-7">
        <Ring percent={s.percent} size={112} label="done" />
        <div className="min-w-0 flex-1">
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-300 ring-1 ring-inset ring-amber-400/30">
            <Icon name="clipboard" className="h-3.5 w-3.5" /> Site checklist
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Plinth Plan</h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-300">
            <span className="font-medium text-white">{plan.report.project?.name}</span>
            {plan.report.plinthAreaSqm ? <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">{plan.report.plinthAreaSqm} m² plinth</span> : null}
            {plan.report.acceptedBy ? <span className="text-xs text-slate-400">accepted by {plan.report.acceptedBy}</span> : null}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {plans.length > 1 && (
            <select value={plan.report._id} onChange={(e) => onPlan(e.target.value)} className="max-w-64 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white">
              {plans.map((p) => <option key={p.report._id} value={p.report._id} className="text-slate-900">{p.report.project?.name} · {fmtDate(p.start)}</option>)}
            </select>
          )}
          <button onClick={onToday} className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3.5 py-2 text-sm font-medium ring-1 ring-white/15 backdrop-blur transition hover:bg-white/20"><Icon name="calendar" className="h-4 w-4" /> Jump to today</button>
        </div>
      </div>

      {/* the whole plan as one bar: each phase in its colour, filled as days are finished */}
      <div className="relative px-7 pt-7">
        <div className="mb-2 flex items-center justify-between text-xs text-slate-400"><span className="font-medium uppercase tracking-wider">Plan journey</span><span>{s.doneDays} of {s.totalDays} days finished</span></div>
        <div className="relative">
          {todayIdx >= 0 && (
            <span className="absolute -top-2.5 z-10 -translate-x-1/2" style={{ left: `${((todayIdx + 0.5) / plan.days.length) * 100}%` }} title="Today">
              <svg viewBox="0 0 12 8" className="h-2 w-3 text-amber-300" fill="currentColor"><path d="M0 0h12L6 8z" /></svg>
            </span>
          )}
          <div className="flex h-3.5 gap-1">
            {groups.map((g) => {
              const done = g.days.filter((d) => d.status === "Done").length;
              return (
                <div key={g.key + g.days[0].day} className="relative overflow-hidden rounded-full bg-white/10" style={{ flex: `${g.days.length} 1 0` }} title={`${g.name}: ${done} of ${g.days.length} days done`}>
                  <div className="h-full rounded-full" style={{ width: `${(done / g.days.length) * 100}%`, background: hexOf(g.key) }} />
                </div>
              );
            })}
          </div>
          <div className="mt-1.5 flex gap-1 text-[11px] text-slate-400">
            {groups.map((g) => <div key={g.key + g.days[0].day} className="min-w-0 truncate" style={{ flex: `${g.days.length} 1 0` }}><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: hexOf(g.key) }} />{g.name}</div>)}
          </div>
        </div>
      </div>

      <dl className="relative grid gap-3 p-7 pt-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((x) => (
          <div key={x.label} className={cx("relative flex items-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-br to-white/[0.03] px-4 py-3.5 ring-1 ring-white/10", x.glow)}>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-amber-300"><Icon name={x.icon} className="h-5 w-5" /></span>
            <div className="min-w-0">
              <dt className="text-xs text-slate-400">{x.label}</dt>
              <dd className={cx("truncate text-base font-semibold", x.tone)}>{x.value}</dd>
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}

function CatchUp({ plan, selectedId, onSelect }: { plan: PlinthPlan; selectedId: string; onSelect: (id: string) => void }) {
  const behind = plan.days.filter(isBehind);
  if (!behind.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 to-white px-4 py-3 shadow-sm">
      <span className="flex items-center gap-2.5 text-sm font-semibold text-red-800">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-red-100 text-red-600"><Icon name="alert" /></span>
        {behind.length} earlier day{behind.length === 1 ? " is" : "s are"} not finished
      </span>
      <div className="flex flex-wrap gap-1.5">
        {behind.slice(0, 8).map((d) => (
          <button key={d._id} onClick={() => onSelect(d._id)} className={cx("rounded-full border px-3 py-1 text-xs font-semibold transition", d._id === selectedId ? "border-red-700 bg-red-700 text-white" : "border-red-200 bg-white text-red-800 hover:bg-red-100")}>
            Day {d.day} · {d.items.length - doneCount(d)} left
          </button>
        ))}
        {behind.length > 8 && <span className="self-center text-xs text-red-700">+{behind.length - 8} more</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day strip: every day as a chip, grouped by phase
// ---------------------------------------------------------------------------

function chipStyle(d: PlinthDay, selected: boolean, hex: string) {
  const t = timing(d);
  const base = d.status === "Done"
    ? "border-emerald-500 bg-emerald-500 text-white"
    : isBehind(d) ? "border-red-300 bg-red-50 text-red-700"
      : d.status === "In Progress" ? "border-amber-300 bg-amber-100 text-amber-900"
        : "border-slate-200 bg-white text-slate-600 hover:border-slate-400";
  return { className: cx("relative grid h-9 w-9 place-items-center rounded-xl border text-xs font-semibold tabular-nums transition", base, selected && "scale-110 shadow-md", t.isToday && !selected && "ring-2 ring-amber-400 ring-offset-1"), style: selected ? { boxShadow: `0 0 0 2px #fff, 0 0 0 4px ${hex}` } : undefined };
}

function DayStrip({ plan, selectedId, onSelect }: { plan: PlinthPlan; selectedId: string; onSelect: (id: string) => void }) {
  const groups = useMemo(() => phaseGroups(plan), [plan]);
  const selectedPhase = plan.days.find((d) => d._id === selectedId)?.phaseKey;
  // Only the phase you are in is open, so 100 days do not fill the page; open others as needed.
  // A choice made while on another phase is ignored once the selected day moves to a new phase.
  const [choice, setChoice] = useState<{ from?: string; key: string } | null>(null);
  const current = choice && choice.from === selectedPhase ? choice.key : selectedPhase;
  return (
    <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.04),0_12px_28px_-16px_rgba(15,23,42,.18)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">All days <span className="font-normal text-slate-400">· pick a day to open it</span></h2>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
          {[
            ["bg-emerald-500", "Done"], ["bg-amber-200 ring-1 ring-amber-300", "In progress"], ["bg-red-100 ring-1 ring-red-300", "Behind"], ["bg-white ring-1 ring-slate-300", "To do"],
          ].map(([c, l]) => <span key={l} className="inline-flex items-center gap-1.5"><span className={cx("h-3 w-3 rounded", c)} />{l}</span>)}
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-white ring-2 ring-amber-400" />Today</span>
        </div>
      </div>
      <div className="space-y-2">
        {groups.map((g) => {
          const done = g.days.filter((d) => d.status === "Done").length;
          const hex = hexOf(g.key);
          const open = current === g.key;
          return (
            <div key={g.key + g.days[0].day} className="overflow-hidden rounded-2xl border border-slate-200" style={{ borderLeft: `4px solid ${hex}` }}>
              <button onClick={() => setChoice({ from: selectedPhase, key: open ? "" : g.key })} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50" style={open ? { background: `linear-gradient(90deg, ${hex}14, transparent 70%)` } : undefined} aria-expanded={open}>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-sm font-bold text-white" style={{ background: hex }}>{groups.indexOf(g) + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-900">{g.name}</span>
                  <span className="block text-xs tabular-nums text-slate-500">Day {g.days[0].day}–{g.days[g.days.length - 1].day} · {done} of {g.days.length} done</span>
                </span>
                <span className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-slate-100 sm:block"><span className="block h-full rounded-full" style={{ width: `${(done / g.days.length) * 100}%`, background: hex }} /></span>
                <svg viewBox="0 0 20 20" className={cx("h-4 w-4 text-slate-400 transition", open && "rotate-180")} fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 8l5 5 5-5" /></svg>
              </button>
              {open && (
                <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-3.5">
                  {g.days.map((d) => {
                    const c = chipStyle(d, d._id === selectedId, hex);
                    return (
                      <button key={d._id} onClick={() => onSelect(d._id)} className={c.className} style={c.style} title={`Day ${d.day} · ${fmtWeekday(d.date)} · ${d.status}`} aria-label={`Day ${d.day}, ${d.status}`}>
                        {d.status === "Done" ? <Icon name="check" className="h-4 w-4" /> : d.day}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// One day: target, crew, machines, checklist
// ---------------------------------------------------------------------------

function DayDetail({ day, canEdit, onChange, onPrev, onNext }: {
  day: PlinthDay; canEdit: boolean; onChange: (d: PlinthDay) => void; onPrev?: () => void; onNext?: () => void;
}) {
  const t = timing(day);
  const behind = isBehind(day);
  const percent = dayPercent(day);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [qty, setQty] = useState(day.actualQuantity != null ? String(day.actualQuantity) : "");
  const [note, setNote] = useState(day.note ?? "");
  const [saved, setSaved] = useState<string | null>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);

  const flash = (what: string) => {
    setSaved(what);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(null), 1800);
  };

  const run = async (key: string, fn: () => Promise<PlinthDay>, after?: () => void) => {
    setBusy(key);
    setErr(null);
    try {
      onChange(await fn());
      after?.();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const tick = async (id: string) => setErr(await toggleItem(day, id, onChange));
  const add = (ev: React.FormEvent) => {
    ev.preventDefault();
    const v = text.trim();
    if (!v) return;
    run("add", () => api<PlinthDay>(`/plinth-plan/days/${day._id}/items`, { method: "POST", json: { text: v } }), () => { setText(""); addRef.current?.focus(); });
  };
  const remove = (id: string) => run(`rm-${id}`, () => api<PlinthDay>(`/plinth-plan/days/${day._id}/items/${id}`, { method: "DELETE" }));
  const completeAll = () => run("all", () => api<PlinthDay>(`/plinth-plan/days/${day._id}/complete`, { method: "POST" }));
  const saveActual = () => {
    const current = day.actualQuantity != null ? String(day.actualQuantity) : "";
    if (qty.trim() === current) return;
    run("qty", () => api<PlinthDay>(`/plinth-plan/days/${day._id}`, { method: "PATCH", json: { actualQuantity: qty.trim() === "" ? null : Number(qty) } }), () => flash("quantity"));
  };
  const crewNow = day.actualCrew?.length ? day.actualCrew : day.crew;
  const machinesNow = day.actualMachines?.length ? day.actualMachines : day.machines;
  const setCrew = (trade: string, n: number) =>
    run("actuals", () => api<PlinthDay>(`/plinth-plan/days/${day._id}/actuals`, { method: "PATCH", json: { crew: crewNow.map((c) => ({ trade: c.trade, count: c.trade === trade ? n : c.count })) } }));
  const setMachine = (name: string, n: number) =>
    run("actuals", () => api<PlinthDay>(`/plinth-plan/days/${day._id}/actuals`, { method: "PATCH", json: { machines: machinesNow.map((m) => ({ name: m.name, count: m.name === name ? n : m.count })) } }));
  const saveReason = (itemId: string, payload: { reason: string; reasonType?: string; hoursLost?: number | null }) =>
    run(`reason-${itemId}`, () => api<PlinthDay>(`/plinth-plan/days/${day._id}/items/${itemId}`, { method: "PATCH", json: payload }));
  const resetKind = (kind: "crew" | "machines") =>
    run("actuals", () => api<PlinthDay>(`/plinth-plan/days/${day._id}/actuals`, { method: "PATCH", json: { [kind]: null } }));
  const saveNote = () => {
    if (note.trim() === (day.note ?? "")) return;
    run("note", () => api<PlinthDay>(`/plinth-plan/days/${day._id}`, { method: "PATCH", json: { note } }), () => flash("note"));
  };

  const state = day.status === "Done" ? { text: "Day complete", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" }
    : behind ? { text: `Behind · due ${fmtWeekday(day.date)}`, cls: "bg-red-50 text-red-700 ring-red-200" }
      : t.isToday ? { text: "Today", cls: "bg-amber-50 text-amber-800 ring-amber-200" }
        : t.isFuture ? { text: "Coming up", cls: "bg-slate-100 text-slate-600 ring-slate-200" }
          : { text: day.status, cls: "bg-slate-100 text-slate-600 ring-slate-200" };

  const hex = hexOf(day.phaseKey);
  const targetPct = day.planned && day.actualQuantity != null ? Math.min(100, Math.round((day.actualQuantity / day.planned.quantity) * 100)) : null;
  const dow = new Date(day.date).toLocaleDateString("en-GB", { weekday: "long" });

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04),0_12px_28px_-16px_rgba(15,23,42,.18)]">
      <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${hex}, ${hex}55)` }} />
      <header className="flex flex-wrap items-start justify-between gap-4 px-6 pb-4 pt-5" style={{ background: `linear-gradient(180deg, ${hex}12, transparent)` }}>
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-xl font-bold tabular-nums text-white shadow-lg" style={{ background: `linear-gradient(135deg, ${hex}, ${hex}bb)`, boxShadow: `0 10px 20px -8px ${hex}` }}>{day.day}</span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">{dow}, {fmtDate(day.date)}</h2>
              <span className={cx("rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", state.cls)}>{state.text}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <Badge tone={PHASE_TONE[day.phaseKey] || "slate"}>{day.phaseName}</Badge>
              {day.weather && <WeatherBadge kind={day.weather.kind} />}
              <span>day {day.dayInPhase} of {day.phaseDays} in this phase</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onPrev} disabled={!onPrev} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-40" aria-label="Previous day"><Icon name="left" /></button>
          <button onClick={onNext} disabled={!onNext} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-40" aria-label="Next day"><Icon name="right" /></button>
        </div>
      </header>

      <div className="space-y-6 px-6 pb-6">
        <p className="rounded-2xl bg-slate-50 px-4 py-3 text-[15px] font-medium leading-relaxed text-slate-800">{day.title}.</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="relative overflow-hidden rounded-2xl p-4 text-white" style={{ background: `linear-gradient(135deg, ${hex}, ${hex}cc)` }}>
            <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/15" />
            <div className="relative text-[11px] font-semibold uppercase tracking-wider text-white/80">Target for the day</div>
            <div className="relative mt-1 text-3xl font-bold tabular-nums">
              {day.planned ? <>{day.planned.quantity}<span className="ml-1.5 text-base font-medium text-white/80">{day.planned.unit}</span></> : "—"}
            </div>
            {day.planned?.label && <div className="relative text-xs text-white/80">{day.planned.label}</div>}
          </div>
          <label className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <span>Actually done today</span>
              {saved === "quantity" && <span className="normal-case tracking-normal text-emerald-600">Saved</span>}
            </div>
            <div className="relative mt-1.5">
              <input
                type="number" min="0" step="any" inputMode="decimal" value={qty} disabled={!canEdit}
                onChange={(e) => setQty(e.target.value)} onBlur={saveActual} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                placeholder={day.planned ? String(day.planned.quantity) : "0"}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 pr-14 text-2xl font-bold tabular-nums outline-none transition focus:border-slate-500 focus:bg-white focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-400">{day.planned?.unit ?? ""}</span>
            </div>
            {targetPct !== null && (
              <div className="mt-2 flex items-center gap-2">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full" style={{ width: `${targetPct}%`, background: hex }} /></span>
                <span className="text-xs font-semibold tabular-nums text-slate-500">{targetPct}% of target</span>
              </div>
            )}
          </label>
        </div>

        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-slate-900">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-amber-100 to-amber-50 text-amber-700 ring-1 ring-amber-200/80"><Icon name="clipboard" /></span>
              Checklist <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-slate-600">{doneCount(day)} / {day.items.length}</span>
            </h3>
            {canEdit && day.status !== "Done" && (
              <Button variant="secondary" onClick={completeAll} disabled={busy === "all"} className="py-1">{busy === "all" ? <Spinner /> : <Icon name="check" />} Mark all done</Button>
            )}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full transition-all" style={{ width: `${percent}%`, background: day.status === "Done" ? "#10b981" : hex }} /></div>

          <ul className="mt-4 space-y-2.5">
            {day.items.map((i) => (
              <ChecklistRow
                key={i._id}
                item={i}
                kind={itemKind(i.text)}
                day={day}
                crewNow={crewNow}
                machinesNow={machinesNow}
                canEdit={canEdit}
                canRemove={canEdit && i.source === "added"}
                busy={busy}
                onTick={() => tick(i._id)}
                onRemove={() => remove(i._id)}
                onCrew={setCrew}
                onMachine={setMachine}
                onReset={resetKind}
                onReason={(payload) => saveReason(i._id, payload)}
              />
            ))}
            {!day.items.length && <li className="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">No items yet.</li>}
          </ul>

          {canEdit && (
            <form onSubmit={add} className="mt-3 flex gap-2">
              <input
                ref={addRef} value={text} onChange={(e) => setText(e.target.value)} maxLength={200}
                placeholder="Add your own item, e.g. “Photo of pit bottom”"
                className="min-w-0 flex-1 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-solid focus:border-slate-500 focus:bg-white focus:ring-2 focus:ring-slate-200"
              />
              <Button type="submit" disabled={!text.trim() || busy === "add"}>{busy === "add" ? <Spinner /> : <Icon name="plus" />} Add</Button>
            </form>
          )}
        </div>

        <label className="block">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <span>Notes for the day</span>
            {saved === "note" && <span className="normal-case tracking-normal text-emerald-600">Saved</span>}
          </div>
          <textarea
            rows={2} value={note} disabled={!canEdit} maxLength={1000} onChange={(e) => setNote(e.target.value)} onBlur={saveNote}
            placeholder="Delays, rock found, rain, anything the manager should know"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-slate-500 focus:bg-white focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100"
          />
        </label>
        <ErrorBox message={err} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Side column: what is next
// ---------------------------------------------------------------------------

function UpNext({ plan, selectedId, onSelect }: { plan: PlinthPlan; selectedId: string; onSelect: (id: string) => void }) {
  const cur = plan.days.findIndex((d) => d._id === selectedId);
  const next = plan.days.slice(cur + 1, cur + 6);
  const fin = plan.report.title;
  return (
    <aside className="space-y-4">
      <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.04),0_12px_28px_-16px_rgba(15,23,42,.18)]">
        <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold tracking-tight text-slate-900"><Icon name="calendar" className="h-4 w-4 text-amber-600" />Coming up</h2>
        {next.length ? (
          <ol className="space-y-2.5">
            {next.map((d) => (
              <li key={d._id}>
                <button onClick={() => onSelect(d._id)} className="group w-full overflow-hidden rounded-2xl border border-slate-200 border-l-4 bg-white p-3.5 text-left transition hover:-translate-y-0.5 hover:shadow-md" style={{ borderLeftColor: hexOf(d.phaseKey) }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-500">Day {d.day} · {fmtWeekday(d.date)}</span>
                    <span className="flex gap-1">{d.weather && <WeatherBadge kind={d.weather.kind} />}<Badge tone={PHASE_TONE[d.phaseKey] || "slate"}>{d.phaseName}</Badge></span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-sm leading-snug text-slate-800">{d.title}</p>
                  {d.planned && <p className="mt-1 text-xs font-medium tabular-nums" style={{ color: hexOf(d.phaseKey) }}>Target {d.planned.quantity} {d.planned.unit}</p>}
                  <div className="mt-2 flex items-center gap-2"><MiniBar percent={dayPercent(d)} /><span className="text-[11px] tabular-nums text-slate-400">{doneCount(d)}/{d.items.length}</span></div>
                </button>
              </li>
            ))}
          </ol>
        ) : <p className="text-sm text-slate-500">This is the last day of the plan.</p>}
      </section>
      <section className="rounded-3xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-5 text-xs text-slate-500 shadow-sm">
        <div className="mb-1 text-sm font-semibold text-slate-900">About this plan</div>
        <p className="leading-relaxed">
          Built from the accepted estimate for <span className="font-medium text-slate-700">{fin}</span>. Targets are each phase&apos;s total spread evenly
          across its days, so use them as a guide. Tick what you finish, record the real quantity, and add anything the plan missed.
        </p>
        <p className="mt-2 font-medium text-slate-600">{plan.summary.itemsDone} of {plan.summary.items} checklist items done across {plan.summary.totalDays} days.</p>
      </section>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// One checklist point. "Crew present" and "Mobilise on site" carry their own − / + controls,
// and any point can carry the reason it could not be done as planned.
// ---------------------------------------------------------------------------

const itemKind = (text: string): "crew" | "machines" | null => (/^crew present/i.test(text) ? "crew" : /^mobilise on site/i.test(text) ? "machines" : null);

function ChecklistRow({ item, kind, day, crewNow, machinesNow, canEdit, canRemove, busy, onTick, onRemove, onCrew, onMachine, onReset, onReason }: {
  item: PlinthItem; kind: "crew" | "machines" | null; day: PlinthDay;
  crewNow: PlinthDay["crew"]; machinesNow: PlinthDay["machines"];
  canEdit: boolean; canRemove: boolean; busy: string | null;
  onTick: () => void; onRemove: () => void;
  onCrew: (trade: string, n: number) => void; onMachine: (name: string, n: number) => void; onReset: (kind: "crew" | "machines") => void;
  onReason: (p: { reason: string; reasonType?: string; hoursLost?: number | null }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const changed = kind === "crew" ? Boolean(day.actualCrew?.length) : kind === "machines" ? Boolean(day.actualMachines?.length) : false;
  const needsReason = changed && !item.reason;
  const workers = crewNow.reduce((n, c) => n + c.count, 0);
  const plannedWorkers = day.crew.reduce((n, c) => n + c.count, 0);
  const showForm = canEdit && (editing || needsReason);
  const busyAny = busy === "actuals" || busy === `reason-${item._id}`;

  return (
    <li className={cx("group rounded-2xl border transition hover:shadow-sm", item.done ? "border-emerald-200 bg-emerald-50/50" : changed ? "border-amber-300 bg-amber-50/40" : "border-slate-200 bg-white")}>
      <div className="flex items-start gap-3 px-4 py-3">
        <Check checked={item.done} disabled={!canEdit} onClick={onTick} label={`${item.done ? "Reopen" : "Mark done"}: ${item.text}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cx("text-sm leading-relaxed", item.done ? "text-slate-400 line-through" : "font-medium text-slate-800")}>
              {kind === "crew" ? `Crew present: ${workers} worker${workers === 1 ? "" : "s"}` : item.text}
            </span>
            {kind === "crew" && workers !== plannedWorkers && <span className="text-xs tabular-nums text-slate-400">plan {plannedWorkers}</span>}
            {item.source === "added" && <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700 ring-1 ring-inset ring-sky-200">Added on site</span>}
            {changed && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">Changed from plan</span>}
            {needsReason && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700">Reason needed</span>}
          </div>

          {kind === "crew" && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {crewNow.map((c, i) => (
                <div key={c.trade} className={cx("flex items-center justify-between gap-3 rounded-xl border px-3 py-2", c.count !== day.crew[i].count ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50/60")}>
                  <span className="text-sm text-slate-700">{c.trade}</span>
                  <Stepper value={c.count} planned={day.crew[i].count} disabled={!canEdit || busyAny} onChange={(n) => onCrew(c.trade, n)} />
                </div>
              ))}
            </div>
          )}

          {kind === "machines" && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {machinesNow.map((m, i) => (
                <div key={m.name} className={cx("flex items-center justify-between gap-3 rounded-xl border px-2 py-1.5", m.count !== day.machines[i].count ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50/60")}>
                  <EquipmentTile name={m.name} count={m.count} kind={m.kind} />
                  <Stepper value={m.count} planned={day.machines[i].count} disabled={!canEdit || busyAny} onChange={(n) => onMachine(m.name, n)} />
                </div>
              ))}
            </div>
          )}

          {kind && changed && canEdit && (
            <button onClick={() => onReset(kind)} disabled={busyAny} className="mt-2 text-xs font-medium text-slate-500 underline hover:text-slate-900">Reset to plan</button>
          )}

          {item.reason && !editing && (
            <div className="mt-3 flex items-start gap-3 rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white px-3.5 py-2.5">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700"><Icon name="alert" className="h-3.5 w-3.5" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><Badge tone="amber">{item.reasonType}</Badge>{item.hoursLost ? <span className="text-xs font-semibold text-slate-600">{item.hoursLost} h lost</span> : null}</div>
                <p className="mt-1 text-sm text-slate-800">{item.reason}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">{item.reasonByName}{item.reasonAt ? ` · ${fmtDateTime(item.reasonAt)}` : ""}</p>
              </div>
              {canEdit && (
                <span className="flex shrink-0 gap-2 text-xs">
                  <button onClick={() => setEditing(true)} className="font-medium text-slate-500 underline hover:text-slate-900">Edit</button>
                  <button onClick={() => onReason({ reason: "" })} className="font-medium text-slate-500 underline hover:text-red-600">Remove</button>
                </span>
              )}
            </div>
          )}

          {showForm && (
            <ReasonForm
              item={item}
              prompt={needsReason ? "The numbers differ from the plan. Say why." : "Why could this not be done as planned?"}
              busy={busy === `reason-${item._id}`}
              onCancel={needsReason ? undefined : () => setEditing(false)}
              onSave={(p) => { onReason(p); setEditing(false); }}
            />
          )}

          {canEdit && !item.reason && !showForm && (
            <button onClick={() => setEditing(true)} className="flex w-fit max-h-0 items-center gap-1 overflow-hidden text-xs font-medium text-slate-400 opacity-0 transition-all hover:text-amber-700 focus:mt-1.5 focus:max-h-6 focus:opacity-100 group-hover:mt-1.5 group-hover:max-h-6 group-hover:opacity-100">
              <Icon name="plus" className="h-3 w-3" /> Add reason / delay
            </button>
          )}
        </div>
        {canRemove && (
          <button onClick={onRemove} className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove: ${item.text}`} title="Remove this item"><Icon name="trash" className="h-4 w-4" /></button>
        )}
      </div>
    </li>
  );
}

function ReasonForm({ item, prompt, busy, onSave, onCancel }: {
  item: PlinthItem; prompt: string; busy: boolean; onSave: (p: { reason: string; reasonType: string; hoursLost: number | null }) => void; onCancel?: () => void;
}) {
  const [type, setType] = useState(item.reasonType ?? HINDRANCE_TYPES[0]);
  const [text, setText] = useState(item.reason ?? "");
  const [hours, setHours] = useState(item.hoursLost != null ? String(item.hoursLost) : "");
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (text.trim()) onSave({ reason: text, reasonType: type, hoursLost: hours === "" ? null : Number(hours) }); }}
      className="mt-3 rounded-xl border border-amber-300 bg-amber-50/60 p-3"
    >
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-amber-900"><Icon name="alert" className="h-3.5 w-3.5" />{prompt}</div>
      <div className="flex flex-wrap gap-1.5">
        {HINDRANCE_TYPES.map((t) => (
          <button type="button" key={t} onClick={() => setType(t)} className={cx("rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition", type === t ? "bg-amber-500 text-white ring-amber-500" : "bg-white text-slate-600 ring-slate-300 hover:ring-amber-400")}>{t}</button>
        ))}
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} autoFocus placeholder="e.g. 4 helpers did not come, shift delayed" className="min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200" />
        <input type="number" min="0" max="240" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Hours lost" title="Hours lost (optional)" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200" />
        <span className="flex gap-2">
          <Button type="submit" disabled={!text.trim() || busy}>{busy ? <Spinner /> : <Icon name="check" />} Save</Button>
          {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
        </span>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// − n + control for the real number on site, with the planned number alongside when it differs
// ---------------------------------------------------------------------------

function Stepper({ value, planned, onChange, disabled }: { value: number; planned: number; onChange: (n: number) => void; disabled?: boolean }) {
  const diff = value - planned;
  return (
    <span className="inline-flex shrink-0 items-center gap-2">
      {diff !== 0 && <span className="text-[11px] tabular-nums text-slate-400">plan {planned}</span>}
      <span className={cx("inline-flex items-center overflow-hidden rounded-lg border bg-white shadow-sm", diff !== 0 ? "border-amber-400" : "border-slate-300")}>
        <button type="button" disabled={disabled || value <= 0} onClick={() => onChange(value - 1)} className="grid h-8 w-8 place-items-center text-lg leading-none text-slate-600 hover:bg-slate-100 disabled:opacity-30" aria-label="One less">−</button>
        <span className={cx("min-w-8 px-1 text-center text-sm font-semibold tabular-nums", diff !== 0 ? "text-amber-800" : "text-slate-900")}>{value}</span>
        <button type="button" disabled={disabled || value >= 500} onClick={() => onChange(value + 1)} className="grid h-8 w-8 place-items-center text-lg leading-none text-slate-600 hover:bg-slate-100 disabled:opacity-30" aria-label="One more">+</button>
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Hindrance register: built from the reasons recorded on checklist points, newest first
// ---------------------------------------------------------------------------

function HindranceRegister({ plan, onSelect }: { plan: PlinthPlan; onSelect: (id: string) => void }) {
  const rows = plan.days
    .flatMap((d) => d.items.filter((i) => i.reason).map((i) => ({ ...i, dayId: d._id, day: d.day, date: d.date, phase: d.phaseName })))
    .sort((a, b) => new Date(b.reasonAt ?? 0).getTime() - new Date(a.reasonAt ?? 0).getTime());
  const unexplained = plan.days.filter((d) => {
    const crewOpen = d.actualCrew?.length && !d.items.some((i) => itemKind(i.text) === "crew" && i.reason);
    const machOpen = d.actualMachines?.length && !d.items.some((i) => itemKind(i.text) === "machines" && i.reason);
    return crewOpen || machOpen;
  });
  const byType = new Map<string, { n: number; hours: number }>();
  for (const r of rows) {
    const k = r.reasonType ?? "Other";
    const cur = byType.get(k) ?? { n: 0, hours: 0 };
    byType.set(k, { n: cur.n + 1, hours: cur.hours + (r.hoursLost ?? 0) });
  }
  const totalHours = rows.reduce((n, r) => n + (r.hoursLost ?? 0), 0);
  return (
    <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.04),0_12px_28px_-16px_rgba(15,23,42,.18)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-slate-900"><span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-amber-100 to-amber-50 text-amber-700 ring-1 ring-amber-200/80"><Icon name="alert" /></span>Hindrance register</h2>
        {rows.length > 0 && <span className="text-xs text-slate-500">{rows.length} entr{rows.length === 1 ? "y" : "ies"}{totalHours ? ` · ${totalHours} h lost in total` : ""}</span>}
      </div>
      {unexplained.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          <b>{unexplained.length} day{unexplained.length === 1 ? "" : "s"} with changed numbers and no reason:</b>
          {unexplained.map((d) => <button key={d._id} onClick={() => onSelect(d._id)} className="rounded-md bg-white px-2 py-0.5 font-semibold ring-1 ring-red-200 hover:bg-red-100">Day {d.day}</button>)}
        </div>
      )}
      {!rows.length ? (
        <p className="text-sm text-slate-500">No delays recorded yet. When a checklist point cannot be done as planned, add the reason on that point.</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            {[...byType.entries()].sort((a, b) => b[1].n - a[1].n).map(([type, v]) => (
              <span key={type} className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-200">{type}<b className="tabular-nums">{v.n}</b>{v.hours ? <span className="text-amber-700">· {v.hours} h</span> : null}</span>
            ))}
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-3 py-2 font-medium">Day</th><th className="px-3 py-2 font-medium">Checklist point</th><th className="px-3 py-2 font-medium">Reason</th><th className="px-3 py-2 font-medium">Hours lost</th><th className="px-3 py-2 font-medium">Recorded by</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r._id} className="align-top">
                    <td className="px-3 py-2"><button onClick={() => onSelect(r.dayId)} className="font-semibold text-slate-900 underline-offset-2 hover:underline">Day {r.day}</button><div className="text-[11px] text-slate-400">{fmtDate(r.date)} · {r.phase}</div></td>
                    <td className="px-3 py-2 text-slate-600">{r.text}</td>
                    <td className="px-3 py-2"><Badge tone="amber">{r.reasonType}</Badge><p className="mt-1 text-slate-800">{r.reason}</p></td>
                    <td className="px-3 py-2 tabular-nums text-slate-700">{r.hoursLost ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{r.reasonByName}{r.reasonAt && <div className="text-slate-400">{fmtDateTime(r.reasonAt)}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
