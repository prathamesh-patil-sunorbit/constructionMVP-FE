"use client";

import { useMemo, useState } from "react";
import { useApi } from "@/lib/api";
import { fmtDateTime, fmtWeekday, todayInput } from "@/lib/format";
import type { DayTask, DayTasks, Project, ScheduleMaterial } from "@/lib/types";
import { ErrorBox, Loading, Select } from "@/components/ui";
import { Icon } from "@/components/geotech";
import { areaOf, cx, daysBetween, fmtD, inr, linkText, materialName, niceName, qty, whereOf } from "@/components/schedule";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const shift = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const nice = niceName;
const area = areaOf;
const where = whereOf;
const material = materialName;

// What the engineer needs to know about a task on the chosen day, in one word.
type Tone = "late" | "due" | "start" | "behind" | "ok" | "done";
const TONE: Record<Tone, { label: string; cls: string; dot: string }> = {
  late: { label: "Overdue", cls: "bg-red-100 text-red-800", dot: "bg-red-500" },
  due: { label: "Due today", cls: "bg-amber-100 text-amber-900", dot: "bg-amber-500" },
  start: { label: "Starts today", cls: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" },
  behind: { label: "Behind", cls: "bg-orange-100 text-orange-800", dot: "bg-orange-500" },
  ok: { label: "On track", cls: "bg-sky-100 text-sky-800", dot: "bg-sky-500" },
  done: { label: "Done", cls: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
};
function toneOf(t: DayTask, late: boolean): Tone {
  if (t.status === "Completed") return "done";
  if (late) return "late";
  if (t.isFinish) return "due";
  if (t.isStart) return "start";
  if (t.expectedPercent != null && t.expectedPercent - t.percent > 10) return "behind";
  return "ok";
}

// ---------------------------------------------------------------------------

export default function MspTasksPage() {
  const { data: projects } = useApi<Project[]>("/projects");
  const [projectId, setProjectId] = useState("");
  const project = projectId || projects?.[0]?._id || "";
  const today = todayInput();
  const [from, setFrom] = useState(today);
  const [selected, setSelected] = useState(today);
  const { data, error, loading } = useApi<DayTasks>(project ? `/schedule/day-tasks?project=${project}&from=${from}&days=7` : null);
  const day = data?.days.find((d) => d.date.slice(0, 10) === selected) ?? data?.days[0];
  const goTo = (d: string) => { setFrom(d); setSelected(d); };

  if (!projects) return <Loading />;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">MSP Tasks</h1>
          <p className="text-sm text-slate-500">
            What the schedule puts on site each day: pick a day to see its tasks, how far along each one is, and the materials it needs.
          </p>
          {data?.import && (
            <p className="mt-1 text-xs text-slate-400">
              From {data.import.file.originalName} · uploaded {fmtDateTime(data.import.createdAt)} by {data.import.uploadedBy?.name ?? "—"}
            </p>
          )}
        </div>
        {projects.length > 1 && (
          <Select value={project} onChange={(e) => setProjectId(e.target.value)} className="max-w-60">
            {projects.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
          </Select>
        )}
      </header>
      <ErrorBox message={error} />

      {loading && !data ? <Loading /> : !data?.import ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          No schedule uploaded yet. The site manager uploads the MSP (.mpp) file under <b>MSP Schedule</b>; your tasks show here after that.
        </div>
      ) : (
        <>
          <WeekStrip data={data} selected={day?.date.slice(0, 10)} today={today} onSelect={setSelected}
            onPrev={() => goTo(shift(from, -7))} onNext={() => goTo(shift(from, 7))} onToday={() => goTo(today)} onPick={goTo} />
          {day && <DayView day={day} overdue={data.overdue} isToday={day.date.slice(0, 10) === today} />}
        </>
      )}
    </div>
  );
}

function WeekStrip({ data, selected, today, onSelect, onPrev, onNext, onToday, onPick }: {
  data: DayTasks; selected?: string; today: string; onSelect: (d: string) => void; onPrev: () => void; onNext: () => void; onToday: () => void; onPick: (d: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button onClick={onPrev} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50" aria-label="Previous week"><Icon name="left" /></button>
        <button onClick={onToday} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Today</button>
        <button onClick={onNext} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50" aria-label="Next week"><Icon name="right" /></button>
        <input type="date" value={selected ?? today} onChange={(e) => e.target.value && onPick(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {data.days.map((d) => {
          const key = d.date.slice(0, 10);
          const active = key === selected;
          return (
            <button key={key} onClick={() => onSelect(key)} className={cx("rounded-xl px-2 py-2 text-center transition ring-1 ring-inset",
              active ? "bg-slate-900 text-white ring-slate-900" : d.workDay ? "bg-white ring-slate-200 hover:bg-slate-50" : "bg-slate-50 text-slate-400 ring-slate-200")}>
              <div className={cx("text-[11px]", active ? "text-slate-300" : "text-slate-500")}>{fmtWeekday(d.date)}</div>
              <div className="text-lg font-semibold tabular-nums">{d.workDay ? d.tasks.length : "Off"}</div>
              <div className={cx("truncate text-[10px]", active ? "text-slate-300" : "text-slate-500")}>
                {key === today ? "today" : d.holiday ? nice(d.holiday.replace(/[-\s]*\d{4}$/, "")) : !d.workDay ? "Sunday" : "tasks"}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function DayView({ day, overdue, isToday }: { day: DayTasks["days"][number]; overdue: DayTask[]; isToday: boolean }) {
  const date = day.date.slice(0, 10);
  // Late work is shown on today only (it is about now, not about a future date).
  const late = isToday ? overdue : [];
  const rows = useMemo(() => day.tasks.map((t) => ({ t, tone: toneOf(t, false) })), [day]);
  const groups = useMemo(() => {
    const m = new Map<string, typeof rows>();
    for (const r of rows) m.set(area(r.t.path), [...(m.get(area(r.t.path)) || []), r]);
    return [...m.entries()];
  }, [rows]);
  const count = (tone: Tone) => rows.filter((r) => r.tone === tone).length;

  // Materials the day needs, summed over the tasks.
  const mats = new Map<string, { name: string; unit: string | null; amount: number }>();
  if (day.workDay) {
    for (const { t } of rows) for (const m of t.materials) {
      if (!m.perDay || m.unit === "Rs.") continue;
      const k = `${material(m.name)}|${m.unit}`;
      const x = mats.get(k) || { name: material(m.name), unit: m.unit, amount: 0 };
      x.amount += m.perDay;
      mats.set(k, x);
    }
  }

  const [showAllLate, setShowAllLate] = useState(false);
  const lateShown = showAllLate ? late : late.slice(0, 4);
  const stats: { n: number; label: string; hint: string; tone: string }[] = [
    { n: rows.length, label: "On site", hint: "tasks running this day", tone: "text-white" },
    { n: late.length, label: "Overdue", hint: "past their due date", tone: late.length ? "text-red-300" : "text-white" },
    { n: count("behind"), label: "Behind", hint: "less done than they should be", tone: count("behind") ? "text-amber-300" : "text-white" },
    { n: count("due"), label: "Due", hint: isToday ? "must finish today" : "finish this day", tone: "text-white" },
    { n: count("start"), label: "Starting", hint: isToday ? "begin today" : "begin this day", tone: "text-white" },
  ];

  return (
    <section className="space-y-5">
      <div className="overflow-hidden rounded-2xl bg-[radial-gradient(120%_140%_at_0%_0%,#1e293b_0%,#0b1120_55%,#060a14_100%)] text-white shadow-[0_18px_40px_-24px_rgba(2,6,23,.8)]">
        <div className="px-6 pt-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">{isToday ? "Today" : "Day plan"}</div>
          <h2 className="mt-0.5 text-2xl font-semibold tracking-tight">{fmtWeekday(day.date)}</h2>
          {!day.workDay && <p className="mt-1 text-sm text-slate-300">{day.holiday ? `Holiday: ${nice(day.holiday)}` : "Sunday"}: no work is planned.</p>}
        </div>
        {day.workDay && (
          <div className="mt-4 grid grid-cols-2 gap-px border-y border-white/10 bg-white/10 sm:grid-cols-3 lg:grid-cols-5">
            {stats.map((st) => (
              <div key={st.label} className="bg-[#0b1120] px-5 py-3">
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{st.label}</div>
                <div className={cx("text-2xl font-semibold tabular-nums", st.tone)}>{st.n}</div>
                <div className="text-[11px] text-slate-400">{st.hint}</div>
              </div>
            ))}
          </div>
        )}
        {mats.size > 0 ? (
          <div className="px-6 py-4">
            <div className="mb-2 text-xs font-medium text-slate-400">Materials needed {isToday ? "today" : "this day"}, across all its tasks</div>
            <div className="flex flex-wrap gap-2">
              {[...mats.values()].map((m) => (
                <span key={`${m.name}|${m.unit}`} className="rounded-lg bg-amber-400/10 px-3 py-1.5 text-sm ring-1 ring-inset ring-amber-400/30">
                  <span className="text-amber-100/80">{m.name}</span> <b className="tabular-nums text-amber-200">{qty(Math.round(m.amount * 10) / 10, m.unit)}</b>
                </span>
              ))}
            </div>
          </div>
        ) : <div className="h-4" />}
      </div>

      {day.workDay && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-slate-500">
          <span className="font-medium text-slate-600">Status:</span>
          {(["ok", "behind", "start", "due", "late"] as Tone[]).map((k) => (
            <span key={k} className="flex items-center gap-1.5"><span className={cx("h-2 w-2 rounded-full", TONE[k].dot)} />{TONE[k].label}</span>
          ))}
        </div>
      )}

      {day.workDay && !rows.length && (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No scheduled tasks on this day.</p>
      )}
      {day.workDay && groups.map(([name, list]) => (
        <Group key={name} title={name} count={list.length} hint={isToday ? "on site today" : "on site this day"}>
          {list.map(({ t, tone }) => <TaskRow key={t.uid} t={t} tone={tone} on={date} />)}
        </Group>
      ))}

      {late.length > 0 && (
        <Group title="Overdue — finish these first" count={late.length} hint="past their due date and still open" tone="text-red-700">
          {lateShown.map((t) => <TaskRow key={`late-${t.uid}`} t={t} tone="late" on={date} />)}
          {late.length > 4 && (
            <button onClick={() => setShowAllLate(!showAllLate)} className="w-full bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
              {showAllLate ? "Show fewer" : `Show all ${late.length} overdue tasks`}
            </button>
          )}
        </Group>
      )}
    </section>
  );
}

function Group({ title, count, hint, tone, children }: { title: string; count?: number; hint?: string; tone?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2 px-1">
        <span className={cx("text-sm font-semibold", tone || "text-slate-900")}>{title}</span>
        {count != null && <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{count}</span>}
        {hint && <span className="text-xs text-slate-500">{hint}</span>}
      </div>
      <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">{children}</div>
    </div>
  );
}

function TaskRow({ t, tone, on }: { t: DayTask; tone: Tone; on: string }) {
  const [open, setOpen] = useState(false);
  const s = TONE[tone];
  const left = daysBetween(on, t.finish);
  const due = tone === "late"
    ? `${t.daysLate ?? -left} day${(t.daysLate ?? -left) === 1 ? "" : "s"} overdue · was due ${fmtD(t.finish)}`
    : left <= 0 ? "Due today" : `Due in ${left} day${left === 1 ? "" : "s"} · ${fmtD(t.finish)}`;
  const today = t.materials.filter((m) => m.perDay && m.unit !== "Rs.");
  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <span className={cx("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", s.dot)} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-900">{nice(t.name)}</span>
            <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-semibold", s.cls)}>{s.label}</span>
            {t.critical && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 ring-1 ring-inset ring-red-200" title="Any delay here delays the project">Critical</span>}
          </div>
          <div className="text-xs text-slate-500">{area(t.path)}{where(t.path) ? ` · ${where(t.path)}` : ""}</div>
        </div>
        <div className={cx("text-right text-sm", tone === "late" ? "font-medium text-red-700" : tone === "due" ? "font-medium text-amber-800" : "text-slate-600")}>{due}</div>
      </div>

      <div className="ml-5 mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="flex w-56 items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div className={cx("h-full rounded-full", s.dot)} style={{ width: `${Math.min(100, t.percent)}%` }} />
          </div>
          <span className="w-16 text-xs tabular-nums text-slate-700">{t.percent}% done</span>
        </div>
        {tone === "behind" && <span className="text-xs text-orange-700">should be about {t.expectedPercent}% by now</span>}
        {today.length > 0 && tone !== "late" && (
          <span className="text-xs text-slate-600">
            Today: {today.map((m) => <span key={m.name} className="mr-2 whitespace-nowrap"><b className="tabular-nums text-slate-900">{qty(m.perDay!, m.unit)}</b> {material(m.name).toLowerCase()}</span>)}
          </span>
        )}
        <button onClick={() => setOpen((o) => !o)} className="ml-auto text-xs font-medium text-slate-500 hover:text-slate-900">{open ? "Hide details" : "Details"}</button>
      </div>

      {open && <Details t={t} />}
    </div>
  );
}

function Details({ t }: { t: DayTask }) {
  const shifted = t.finishVarianceDays;
  return (
    <div className="ml-5 mt-3 grid gap-3 rounded-xl bg-slate-50 p-3 text-xs md:grid-cols-2">
      <dl className="grid grid-cols-[8rem_1fr] gap-y-1">
        <dt className="text-slate-500">Planned</dt><dd className="text-slate-800">{fmtD(t.start)} → {fmtD(t.finish)}</dd>
        <dt className="text-slate-500">Original plan</dt>
        <dd className="text-slate-800">finish {fmtD(t.baselineFinish)}{shifted ? <span className={shifted > 0 ? " text-red-700" : " text-emerald-700"}> ({shifted > 0 ? `${shifted} days later now` : `${-shifted} days earlier now`})</span> : ""}</dd>
        {t.actualStart && <><dt className="text-slate-500">Started</dt><dd className="text-slate-800">{fmtD(t.actualStart)}</dd></>}
        {t.remainingDurationDays != null && <><dt className="text-slate-500">Work left</dt><dd className="text-slate-800">about {t.remainingDurationDays} working days</dd></>}
        {t.cost != null && <><dt className="text-slate-500">Cost</dt><dd className="text-slate-800">{inr(t.cost)}{t.actualCost ? ` · ${inr(t.actualCost)} spent` : ""}</dd></>}
        {t.note && <><dt className="text-slate-500">Remark</dt><dd className="text-slate-800">{t.note}</dd></>}
        {t.wbs && <><dt className="text-slate-500">WBS</dt><dd className="text-slate-800">{t.wbs}</dd></>}
      </dl>
      <div className="space-y-2">
        {t.materials.length > 0 && <MaterialsLeft materials={t.materials} />}
        {t.predecessors.length > 0 && (
          <div>
            <div className="mb-1 font-medium text-slate-600">Waits for</div>
            <ul className="space-y-0.5">
              {t.predecessors.map((p, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", p.status === "Completed" ? "bg-emerald-500" : p.status === "Overdue" ? "bg-red-500" : "bg-amber-400")} />
                  <span className="min-w-0 flex-1 truncate text-slate-700">{p.name ? nice(p.name) : `Task ${p.uid}`}</span>
                  <span className="text-slate-500">{p.status === "Completed" ? "done" : p.status?.toLowerCase()}</span>
                  <span className="text-slate-400" title={linkText(p)}>{p.type}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function MaterialsLeft({ materials }: { materials: ScheduleMaterial[] }) {
  return (
    <div>
      <div className="mb-1 font-medium text-slate-600">Materials for the whole task</div>
      <ul className="space-y-0.5">
        {materials.map((m) => (
          <li key={m.name} className="flex justify-between gap-2">
            <span className="text-slate-700">{material(m.name)}</span>
            <span className="tabular-nums text-slate-600">{qty(m.actualQuantity, m.unit)} used of {qty(m.quantity, m.unit)} · <b className="text-slate-800">{qty(m.remainingQuantity, m.unit)} left</b></span>
          </li>
        ))}
      </ul>
    </div>
  );
}
