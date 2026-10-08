"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate, fmtWeekday, todayInput } from "@/lib/format";
import { isManager, type PlinthDay, type PlinthPlan } from "@/lib/types";
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
    </div>
  );
}

// ---------------------------------------------------------------------------

function Hero({ plan, plans, onPlan, onToday }: { plan: PlinthPlan; plans: PlinthPlan[]; onPlan: (id: string) => void; onToday: () => void }) {
  const s = plan.summary;
  const t = todayInput();
  const startDay = plan.start.slice(0, 10);
  const endDay = plan.end.slice(0, 10);
  const when = s.todayDay ? `Day ${s.todayDay} of ${s.totalDays}` : t < startDay ? `Starts ${fmtDate(plan.start)}` : t > endDay ? "Plan period over" : "Between days";
  const stats = [
    { label: "Today", value: when, icon: "calendar" as const, tone: "" },
    { label: "Days finished", value: `${s.doneDays} of ${s.totalDays}`, icon: "check" as const, tone: "" },
    { label: "Behind schedule", value: s.behindDays ? `${s.behindDays} day${s.behindDays === 1 ? "" : "s"}` : "None", icon: "clock" as const, tone: s.behindDays ? "text-red-300" : "text-emerald-300" },
    { label: "Plinth ready", value: fmtDate(plan.end, true), icon: "flag" as const, tone: "" },
  ];
  return (
    <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 text-white shadow-sm">
      <div className="flex flex-wrap items-center gap-5 px-6 pt-6">
        <Ring percent={s.percent} label="done" />
        <div className="min-w-0 flex-1">
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-300 ring-1 ring-inset ring-amber-400/30">
            <Icon name="clipboard" className="h-3.5 w-3.5" /> Site checklist
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Plinth Plan</h1>
          <p className="mt-1 truncate text-sm text-slate-300">
            {plan.report.project?.name}{plan.report.plinthAreaSqm ? ` · ${plan.report.plinthAreaSqm} m² plinth` : ""}
            {plan.report.acceptedBy ? ` · accepted by ${plan.report.acceptedBy}` : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {plans.length > 1 && (
            <select value={plan.report._id} onChange={(e) => onPlan(e.target.value)} className="max-w-64 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white">
              {plans.map((p) => <option key={p.report._id} value={p.report._id} className="text-slate-900">{p.report.project?.name} · {fmtDate(p.start)}</option>)}
            </select>
          )}
          <button onClick={onToday} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium hover:bg-white/20"><Icon name="calendar" className="h-4 w-4" /> Jump to today</button>
        </div>
      </div>
      <dl className="mt-6 grid gap-px border-t border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((x) => (
          <div key={x.label} className="flex items-center gap-3 bg-slate-900/60 px-6 py-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 text-amber-300"><Icon name={x.icon} className="h-[18px] w-[18px]" /></span>
            <div className="min-w-0">
              <dt className="text-xs text-slate-400">{x.label}</dt>
              <dd className={cx("truncate text-sm font-semibold", x.tone)}>{x.value}</dd>
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
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
      <span className="flex items-center gap-2 text-sm font-semibold text-red-800"><Icon name="alert" /> {behind.length} earlier day{behind.length === 1 ? " is" : "s are"} not finished</span>
      <div className="flex flex-wrap gap-1.5">
        {behind.slice(0, 8).map((d) => (
          <button key={d._id} onClick={() => onSelect(d._id)} className={cx("rounded-lg border px-2.5 py-1 text-xs font-medium", d._id === selectedId ? "border-red-700 bg-red-700 text-white" : "border-red-300 bg-white text-red-800 hover:bg-red-100")}>
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

function chipStyle(d: PlinthDay, selected: boolean) {
  const t = timing(d);
  const base = d.status === "Done"
    ? "border-emerald-500 bg-emerald-500 text-white"
    : isBehind(d) ? "border-red-300 bg-red-50 text-red-700"
      : d.status === "In Progress" ? "border-amber-300 bg-amber-100 text-amber-900"
        : "border-slate-200 bg-white text-slate-600 hover:border-slate-400";
  return cx("relative grid h-9 w-9 place-items-center rounded-lg border text-xs font-semibold tabular-nums transition", base, selected && "ring-2 ring-slate-900 ring-offset-2", t.isToday && !selected && "ring-2 ring-amber-400 ring-offset-1");
}

function DayStrip({ plan, selectedId, onSelect }: { plan: PlinthPlan; selectedId: string; onSelect: (id: string) => void }) {
  const groups = useMemo(() => {
    const out: { key: string; name: string; days: PlinthDay[] }[] = [];
    for (const d of plan.days) {
      const last = out[out.length - 1];
      if (last && last.key === d.phaseKey) last.days.push(d);
      else out.push({ key: d.phaseKey, name: d.phaseName, days: [d] });
    }
    return out;
  }, [plan.days]);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">All days</h2>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
          {[
            ["bg-emerald-500", "Done"], ["bg-amber-200 ring-1 ring-amber-300", "In progress"], ["bg-red-100 ring-1 ring-red-300", "Behind"], ["bg-white ring-1 ring-slate-300", "To do"],
          ].map(([c, l]) => <span key={l} className="inline-flex items-center gap-1.5"><span className={cx("h-3 w-3 rounded", c)} />{l}</span>)}
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-white ring-2 ring-amber-400" />Today</span>
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {groups.map((g) => {
          const done = g.days.filter((d) => d.status === "Done").length;
          return (
            <div key={g.key + g.days[0].day} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:gap-4">
              <div className="flex shrink-0 items-center gap-2 sm:w-40 sm:flex-col sm:items-start sm:gap-1">
                <Badge tone={PHASE_TONE[g.key] || "slate"}>{g.name}</Badge>
                <span className="text-[11px] text-slate-400">{done} of {g.days.length} day{g.days.length === 1 ? "" : "s"} done</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {g.days.map((d) => (
                  <button key={d._id} onClick={() => onSelect(d._id)} className={chipStyle(d, d._id === selectedId)} title={`Day ${d.day} · ${fmtWeekday(d.date)} · ${d.status}`} aria-label={`Day ${d.day}, ${d.status}`}>
                    {d.status === "Done" ? <Icon name="check" className="h-4 w-4" /> : d.day}
                  </button>
                ))}
              </div>
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
  const saveNote = () => {
    if (note.trim() === (day.note ?? "")) return;
    run("note", () => api<PlinthDay>(`/plinth-plan/days/${day._id}`, { method: "PATCH", json: { note } }), () => flash("note"));
  };

  const state = day.status === "Done" ? { text: "Day complete", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" }
    : behind ? { text: `Behind · due ${fmtWeekday(day.date)}`, cls: "bg-red-50 text-red-700 ring-red-200" }
      : t.isToday ? { text: "Today", cls: "bg-amber-50 text-amber-800 ring-amber-200" }
        : t.isFuture ? { text: "Coming up", cls: "bg-slate-100 text-slate-600 ring-slate-200" }
          : { text: day.status, cls: "bg-slate-100 text-slate-600 ring-slate-200" };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="grid h-9 min-w-9 place-items-center rounded-lg bg-slate-900 px-2 text-sm font-semibold tabular-nums text-white">{day.day}</span>
            <h2 className="text-lg font-semibold text-slate-900">{fmtWeekday(day.date)}</h2>
            <span className={cx("rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", state.cls)}>{state.text}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <Badge tone={PHASE_TONE[day.phaseKey] || "slate"}>{day.phaseName}</Badge>
            {day.weather && <WeatherBadge kind={day.weather.kind} />}
            <span>day {day.dayInPhase} of {day.phaseDays} of this phase</span>
          </div>
        </div>
        <div className="flex gap-1.5">
          <button onClick={onPrev} disabled={!onPrev} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40" aria-label="Previous day"><Icon name="left" /></button>
          <button onClick={onNext} disabled={!onNext} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40" aria-label="Next day"><Icon name="right" /></button>
        </div>
      </header>

      <div className="space-y-5 p-5">
        <p className="text-[15px] font-medium leading-relaxed text-slate-800">{day.title}.</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Target for the day</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
              {day.planned ? <>{day.planned.quantity}<span className="ml-1 text-sm font-medium text-slate-500">{day.planned.unit}</span></> : "—"}
            </div>
            {day.planned?.label && <div className="text-xs text-slate-500">{day.planned.label}</div>}
          </div>
          <label className="block rounded-xl bg-slate-50 p-3.5">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <span>Actually done today</span>
              {saved === "quantity" && <span className="normal-case tracking-normal text-emerald-600">Saved</span>}
            </div>
            <div className="relative mt-1">
              <input
                type="number" min="0" step="any" inputMode="decimal" value={qty} disabled={!canEdit}
                onChange={(e) => setQty(e.target.value)} onBlur={saveActual} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                placeholder={day.planned ? String(day.planned.quantity) : "0"}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-14 text-xl font-semibold tabular-nums outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-400">{day.planned?.unit ?? ""}</span>
            </div>
            {day.planned && day.actualQuantity != null && (
              <div className="mt-1 text-xs text-slate-500">{Math.round((day.actualQuantity / day.planned.quantity) * 100)}% of target</div>
            )}
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400"><Icon name="users" className="h-3.5 w-3.5" />Crew on site</div>
            <div className="flex flex-wrap gap-1.5">
              {day.crew.length ? day.crew.map((c) => (
                <span key={c.trade} className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm text-slate-700"><span className="font-semibold tabular-nums">{c.count}</span> {c.count === 1 && /s$/.test(c.trade) ? c.trade.slice(0, -1) : c.trade}</span>
              )) : <span className="text-sm text-slate-400">—</span>}
            </div>
          </div>
          <div>
            <div className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400"><Icon name="wrench" className="h-3.5 w-3.5" />Machines &amp; vehicles</div>
            <div className="flex flex-wrap gap-1.5">
              {day.machines.length ? day.machines.map((m) => <EquipmentTile key={m.name} name={m.name} count={m.count} kind={m.kind} />) : <span className="text-sm text-slate-400">—</span>}
            </div>
          </div>
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Checklist <span className="font-normal text-slate-400">· {doneCount(day)} of {day.items.length} done</span></h3>
            {canEdit && day.status !== "Done" && (
              <Button variant="secondary" onClick={completeAll} disabled={busy === "all"} className="py-1">{busy === "all" ? <Spinner /> : <Icon name="check" />} Mark all done</Button>
            )}
          </div>
          <MiniBar percent={percent} tone={day.status === "Done" ? "bg-emerald-500" : "bg-amber-500"} />

          <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {day.items.map((i) => (
              <li key={i._id} className={cx("group flex items-start gap-3 px-3.5 py-3 transition", i.done && "bg-emerald-50/40")}>
                <Check checked={i.done} disabled={!canEdit} onClick={() => tick(i._id)} label={`${i.done ? "Reopen" : "Mark done"}: ${i.text}`} />
                <div className="min-w-0 flex-1">
                  <span className={cx("text-sm leading-relaxed", i.done ? "text-slate-400 line-through" : "text-slate-800")}>{i.text}</span>
                  {i.source === "added" && <span className="ml-2 rounded bg-sky-50 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-sky-700 ring-1 ring-inset ring-sky-200">Added on site</span>}
                </div>
                {canEdit && i.source === "added" && (
                  <button onClick={() => remove(i._id)} disabled={busy === `rm-${i._id}`} className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove: ${i.text}`} title="Remove this item"><Icon name="trash" className="h-4 w-4" /></button>
                )}
              </li>
            ))}
            {!day.items.length && <li className="px-3.5 py-4 text-sm text-slate-400">No items yet.</li>}
          </ul>

          {canEdit && (
            <form onSubmit={add} className="mt-3 flex gap-2">
              <input
                ref={addRef} value={text} onChange={(e) => setText(e.target.value)} maxLength={200}
                placeholder="Add your own item, e.g. “Photo of pit bottom”"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
              <Button type="submit" disabled={!text.trim() || busy === "add"}>{busy === "add" ? <Spinner /> : <Icon name="plus" />} Add</Button>
            </form>
          )}
        </div>

        <label className="block">
          <div className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <span>Notes for the day</span>
            {saved === "note" && <span className="normal-case tracking-normal text-emerald-600">Saved</span>}
          </div>
          <textarea
            rows={2} value={note} disabled={!canEdit} maxLength={1000} onChange={(e) => setNote(e.target.value)} onBlur={saveNote}
            placeholder="Delays, rock found, rain, anything the manager should know"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100"
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
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Coming up</h2>
        {next.length ? (
          <ol className="space-y-2">
            {next.map((d) => (
              <li key={d._id}>
                <button onClick={() => onSelect(d._id)} className="w-full rounded-xl border border-slate-200 p-3 text-left transition hover:border-slate-400 hover:bg-slate-50">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-500">Day {d.day} · {fmtWeekday(d.date)}</span>
                    <span className="flex gap-1">{d.weather && <WeatherBadge kind={d.weather.kind} />}<Badge tone={PHASE_TONE[d.phaseKey] || "slate"}>{d.phaseName}</Badge></span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-800">{d.title}</p>
                  {d.planned && <p className="mt-1 text-xs text-slate-500">Target {d.planned.quantity} {d.planned.unit}</p>}
                  <div className="mt-2 flex items-center gap-2"><MiniBar percent={dayPercent(d)} /><span className="text-[11px] tabular-nums text-slate-400">{doneCount(d)}/{d.items.length}</span></div>
                </button>
              </li>
            ))}
          </ol>
        ) : <p className="text-sm text-slate-500">This is the last day of the plan.</p>}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-500 shadow-sm">
        <div className="mb-1 text-sm font-semibold text-slate-900">About this plan</div>
        <p className="leading-relaxed">
          Built from the accepted estimate for <span className="font-medium text-slate-700">{fin}</span>. Targets are each phase&apos;s total spread evenly
          across its days, so use them as a guide. Tick what you finish, record the real quantity, and add anything the plan missed.
        </p>
        <p className="mt-2">{plan.summary.itemsDone} of {plan.summary.items} checklist items done across {plan.summary.totalDays} days.</p>
      </section>
    </aside>
  );
}
