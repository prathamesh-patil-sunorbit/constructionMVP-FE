"use client";

import { useMemo, useState } from "react";
import { useApi } from "@/lib/api";
import { fmtDateTime, fmtWeekday, todayInput } from "@/lib/format";
import type { DayTask, DayTasks, Project } from "@/lib/types";
import { ErrorBox, Loading, Select } from "@/components/ui";
import { Icon } from "@/components/geotech";
import { MaterialTable, PercentBar, TaskStatus, Variance, cx, fmtD, fmtDays, inr, linkText, qty } from "@/components/schedule";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const shift = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};

export default function MppTasksPage() {
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
          <h1 className="text-xl font-semibold text-slate-900">MPP Tasks</h1>
          <p className="text-sm text-slate-500">
            {data?.import
              ? <>From <b>{data.import.file.originalName}</b>, uploaded by {data.import.uploadedBy?.name ?? "—"} on {fmtDateTime(data.import.createdAt)}</>
              : "Your work from the project schedule, day by day."}
          </p>
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
          No schedule uploaded yet. The site manager uploads the MPP file under <b>MPP Schedule</b>; your tasks show here after that.
        </div>
      ) : (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button onClick={() => goTo(shift(from, -7))} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50" aria-label="Previous week"><Icon name="left" /></button>
              <button onClick={() => goTo(today)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Today</button>
              <button onClick={() => goTo(shift(from, 7))} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50" aria-label="Next week"><Icon name="right" /></button>
              <input type="date" value={selected} onChange={(e) => e.target.value && goTo(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
              <span className="ml-auto text-xs text-slate-500">{data.workDaysPerWeek}-day work week · Sunday{data.workDaysPerWeek <= 5 ? " and Saturday" : ""} off</span>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {data.days.map((d) => {
                const key = d.date.slice(0, 10);
                const active = key === (day?.date.slice(0, 10));
                return (
                  <button key={key} onClick={() => setSelected(key)} className={cx("rounded-xl px-2 py-2 text-left transition ring-1 ring-inset",
                    active ? "bg-slate-900 text-white ring-slate-900" : d.workDay ? "bg-white ring-slate-200 hover:bg-slate-50" : "bg-slate-50 ring-slate-200 hover:bg-slate-100")}>
                    <div className={cx("text-[11px]", active ? "text-slate-300" : "text-slate-500")}>{fmtWeekday(d.date)}{key === today ? " · today" : ""}</div>
                    <div className="mt-0.5 text-lg font-semibold tabular-nums">{d.workDay ? d.tasks.length : "Off"}</div>
                    <div className={cx("text-[10px]", active ? "text-slate-300" : "text-slate-500")}>
                      {d.workDay ? [d.starting && `${d.starting} start`, d.finishing && `${d.finishing} due`].filter(Boolean).join(" · ") || "tasks" : "non-working day"}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {data.overdue.length > 0 && <Overdue tasks={data.overdue} />}

          {day && <DayView day={day} isToday={day.date.slice(0, 10) === today} />}
        </>
      )}
    </div>
  );
}

function Overdue({ tasks }: { tasks: DayTask[] }) {
  return (
    <section className="rounded-2xl border border-red-200 bg-red-50/60 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-red-900"><Icon name="alert" /> {tasks.length} task{tasks.length === 1 ? " is" : "s are"} past the finish date and not complete</div>
      <ul className="mt-2 space-y-1 text-sm">
        {tasks.map((t) => (
          <li key={t.uid} className="flex flex-wrap items-center gap-x-2 text-red-900">
            <b>{t.name}</b><span className="text-xs text-red-700">{t.path.slice(1).join(" › ")}</span>
            <span className="ml-auto text-xs">due {fmtD(t.finish)} · {t.daysLate} day{t.daysLate === 1 ? "" : "s"} late · {t.percent}% done</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DayView({ day, isToday }: { day: DayTasks["days"][number]; isToday: boolean }) {
  // Grouped by the area just under the project (e.g. A-WING, B-WING, External development).
  const groups = useMemo(() => {
    const m = new Map<string, DayTask[]>();
    for (const t of day.tasks) {
      const key = t.path[1] ?? t.path[0] ?? "Tasks";
      m.set(key, [...(m.get(key) || []), t]);
    }
    return [...m.entries()];
  }, [day]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-lg font-semibold text-slate-900">{fmtWeekday(day.date)}{isToday ? " · today" : ""}</h2>
        <span className="text-sm text-slate-500">{day.tasks.length} task{day.tasks.length === 1 ? "" : "s"} on the schedule{day.starting ? ` · ${day.starting} starting` : ""}{day.finishing ? ` · ${day.finishing} due` : ""}</span>
      </div>
      <DayMaterials day={day} />
      {!day.workDay && (
        <p className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm text-slate-600">Non-working day on the project calendar. The tasks below span this date but no work is planned today.</p>
      )}
      {!day.tasks.length ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No scheduled tasks on this day.</p>
      ) : groups.map(([area, list]) => (
        <div key={area}>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{area} · {list.length}</div>
          <div className="grid gap-3 lg:grid-cols-2">
            {list.map((t) => <TaskCard key={t.uid} t={t} workDay={day.workDay} />)}
          </div>
        </div>
      ))}
    </section>
  );
}

// What the day needs across all its tasks: each task's material spread evenly over its working days.
function DayMaterials({ day }: { day: DayTasks["days"][number] }) {
  if (!day.workDay) return null;
  const totals = new Map<string, { name: string; unit: string | null; perDay: number; tasks: number }>();
  for (const t of day.tasks) {
    for (const m of t.materials) {
      if (!m.remainingQuantity || m.unit === "Rs.") continue;
      const k = `${m.name}|${m.unit}`;
      const x = totals.get(k) || { name: m.name, unit: m.unit, perDay: 0, tasks: 0 };
      x.perDay += m.perDay ?? 0;
      x.tasks += 1;
      totals.set(k, x);
    }
  }
  if (!totals.size) return null;
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="mb-2 text-sm font-semibold text-amber-900">Materials for the day <span className="font-normal text-amber-800">(what is left of each task ÷ its working days left)</span></div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[...totals.values()].map((m) => (
          <div key={m.name} className="rounded-xl bg-white px-3 py-2 ring-1 ring-inset ring-amber-200">
            <div className="text-[11px] text-slate-500">{m.name}</div>
            <div className="text-lg font-semibold tabular-nums text-slate-900">~{qty(Math.round(m.perDay * 10) / 10, m.unit)}</div>
            <div className="text-[11px] text-slate-500">across {m.tasks} task{m.tasks === 1 ? "" : "s"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TaskCard({ t, workDay }: { t: DayTask; workDay: boolean }) {
  const behind = t.expectedPercent != null && t.percent + 5 < t.expectedPercent && t.status !== "Completed";
  return (
    <article className={cx("rounded-2xl border bg-white p-4 shadow-sm", t.critical ? "border-red-200" : "border-slate-200")}>
      <div className="flex flex-wrap items-center gap-1.5">
        <TaskStatus value={t.status} />
        {t.isStart && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">Starts today</span>}
        {t.isFinish && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Due today</span>}
        {t.critical && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">Critical</span>}
        {t.milestone && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700">Milestone</span>}
        {t.wbs && <span className="ml-auto text-[11px] tabular-nums text-slate-400">WBS {t.wbs}</span>}
      </div>
      <h3 className="mt-2 font-semibold leading-snug text-slate-900">{t.name}</h3>
      <p className="text-xs text-slate-500">{t.path.slice(1).join(" › ")}</p>
      {t.note && <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">Remark: {t.note}</p>}

      <div className="mt-3">
        <div className="mb-1 flex justify-between text-xs">
          <span className="text-slate-600">{workDay && t.dayNo ? <>Working day <b>{t.dayNo}</b> of {t.totalDays}</> : `${t.totalDays} working days`}</span>
          <span className={cx("tabular-nums", behind ? "font-medium text-amber-700" : "text-slate-600")}>{t.percent}% done{t.expectedPercent != null ? ` · should be ${t.expectedPercent}%` : ""}</span>
        </div>
        <PercentBar percent={t.percent} expected={t.expectedPercent} />
        {behind && <p className="mt-1 text-[11px] text-amber-700">Behind: about {t.expectedPercent! - t.percent}% of the work should already be done by the end of the day.</p>}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <dt className="text-slate-500">Planned</dt><dd className="text-right tabular-nums text-slate-800">{fmtD(t.start)} → {fmtD(t.finish)}</dd>
        <dt className="text-slate-500">Baseline finish</dt><dd className="text-right tabular-nums text-slate-800">{fmtD(t.baselineFinish)} · <Variance days={t.finishVarianceDays} /></dd>
        <dt className="text-slate-500">Duration</dt><dd className="text-right text-slate-800">{fmtDays(t.durationDays)}{t.remainingDurationDays != null ? ` · ${fmtDays(t.remainingDurationDays)} left` : ""}</dd>
        {t.totalSlackDays != null && <><dt className="text-slate-500">Slack</dt><dd className={cx("text-right", t.totalSlackDays <= 0 ? "font-medium text-red-700" : "text-slate-800")}>{t.totalSlackDays <= 0 ? "none — any delay moves the finish" : `${fmtDays(t.totalSlackDays)} spare`}</dd></>}
        {t.constraint && <><dt className="text-slate-500">Constraint</dt><dd className="text-right capitalize text-slate-800">{t.constraint.type}{t.constraint.date ? ` ${fmtD(t.constraint.date)}` : ""}</dd></>}
        {t.cost != null && <><dt className="text-slate-500">Cost</dt><dd className="text-right tabular-nums text-slate-800">{inr(t.cost)}{t.actualCost ? ` · spent ${inr(t.actualCost)}` : ""}</dd></>}
        {t.actualStart && <><dt className="text-slate-500">Actually started</dt><dd className="text-right tabular-nums text-slate-800">{fmtD(t.actualStart)}</dd></>}
        {t.resources.length > 0 && <><dt className="text-slate-500">Resources</dt><dd className="text-right text-slate-800">{t.resources.join(", ")}</dd></>}
      </dl>

      {t.materials.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50/40 px-3 py-2">
          <div className="mb-1 text-xs font-medium text-amber-900">Materials{workDay ? " — per day = what is left ÷ working days left" : ""}</div>
          <MaterialTable materials={t.materials} perDay={workDay} />
        </div>
      )}

      {t.predecessors.length > 0 && (
        <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs">
          <div className="mb-1 font-medium text-slate-600">Depends on</div>
          <ul className="space-y-0.5">
            {t.predecessors.map((p, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", p.status === "Completed" ? "bg-emerald-500" : p.status === "Overdue" ? "bg-red-500" : "bg-amber-400")} />
                <span className="min-w-0 flex-1 truncate text-slate-700">{p.name ?? `Task ${p.uid}`}</span>
                <span className="text-slate-400">{linkText(p)}</span>
                <span className="text-slate-500">{p.status?.toLowerCase()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
