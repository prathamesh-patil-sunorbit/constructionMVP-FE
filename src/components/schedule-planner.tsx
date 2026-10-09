"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import type { CostRow, ScenarioInput, ScenarioResult, ScheduleAdvice, ScheduleImport, SchedulePlan } from "@/lib/types";
import { Button, ErrorBox, Loading } from "@/components/ui";
import { AiMark, CalculatedMark } from "@/components/ai";
import { Icon, Spinner } from "@/components/geotech";
import { PercentBar, Variance, cx, fmtD, inr } from "@/components/schedule";

const Panel = ({ title, icon, actions, children, className }: { title: React.ReactNode; icon?: Parameters<typeof Icon>[0]["name"]; actions?: React.ReactNode; children: React.ReactNode; className?: string }) => (
  <section className={cx("rounded-2xl border border-slate-200 bg-white shadow-sm", className)}>
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">{icon && <Icon name={icon} />}{title}</h2>
      {actions}
    </header>
    <div className="p-5">{children}</div>
  </section>
);

const net = (n: number) => <span className={cx("font-semibold tabular-nums", n >= 0 ? "text-emerald-700" : "text-red-700")}>{n >= 0 ? `saves ${inr(n)}` : `costs ${inr(-n)}`}</span>;

// ---------------------------------------------------------------------------
// AI planner tab
// ---------------------------------------------------------------------------

export function SchedulePlanner({ doc }: { doc: ScheduleImport }) {
  const { data: plan, error, setData } = useApi<SchedulePlan>(`/schedule/imports/${doc._id}/plan`);
  if (error) return <ErrorBox message={error} />;
  if (!plan) return <Loading />;
  return (
    <div className="space-y-5">
      <Forecast plan={plan} />
      <Advice plan={plan} docId={doc._id} onAdvice={(advice) => setData((p) => (p ? { ...p, advice } : p))} />
      <Scenarios plan={plan} />
      <CustomScenario plan={plan} docId={doc._id} />
      <Drivers base={plan.base} />
    </div>
  );
}

function Forecast({ plan }: { plan: SchedulePlan }) {
  const p = plan.pace;
  const spiTone = p.spi == null ? "text-slate-700" : p.spi >= 0.95 ? "text-emerald-700" : p.spi >= 0.8 ? "text-amber-700" : "text-red-700";
  return (
    <Panel title="AI forecast: when will it really finish?" icon="calendar" actions={<CalculatedMark title="From MS Project's planned % against actual %, no model involved" />}>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200">
          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Schedule says</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{fmtD(p.scheduledFinish)}</div>
          <div className="text-xs text-slate-500">finish in the MS Project file</div>
        </div>
        <div className={cx("rounded-xl p-4 ring-1 ring-inset", p.extraDays > 0 ? "bg-red-50 ring-red-200" : "bg-emerald-50 ring-emerald-200")}>
          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">At the current pace</div>
          <div className={cx("mt-1 text-2xl font-semibold tabular-nums", p.extraDays > 0 ? "text-red-700" : "text-emerald-700")}>{fmtD(p.predictedFinish)}</div>
          <div className="text-xs text-slate-600">{p.extraDays > 0 ? `${p.extraDays} days later than planned` : p.extraDays < 0 ? `${-p.extraDays} days earlier` : "on time"}</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200">
          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Pace (SPI)</div>
          <div className={cx("mt-1 text-2xl font-semibold tabular-nums", spiTone)}>{p.spi ?? "—"}</div>
          <div className="text-xs text-slate-500">{p.behind} of {p.tasksMeasured} measured tasks behind plan · 1.0 = on plan</div>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">{p.basis}</p>
    </Panel>
  );
}

function Advice({ plan, docId, onAdvice }: { plan: SchedulePlan; docId: string; onAdvice: (a: ScheduleAdvice) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const a = plan.advice;
  const ask = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await api<{ advice: ScheduleAdvice | null; error: string | null }>(`/schedule/imports/${docId}/advice`, { method: "POST" });
      if (res.advice) onAdvice(res.advice);
      if (res.error) setErr(res.error);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const label = (key?: string) => plan.scenarios.find((s) => s.key === key)?.label;
  return (
    <Panel
      title="AI advice"
      icon="sparkles"
      className="border-violet-200"
      actions={<span className="flex items-center gap-2">{a && <AiMark />}<Button onClick={ask} disabled={busy} className="py-1 text-xs">{busy ? <><Spinner /> Thinking…</> : <><Icon name="sparkles" /> {a ? "Ask again" : "Get AI advice"}</>}</Button></span>}
    >
      {!a ? (
        <p className="text-sm text-slate-500">The AI reads the forecast, the costs and every scenario below, then tells you what to do first and why. It only uses the calculated numbers on this page.</p>
      ) : (
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-50 via-white to-amber-50/60 p-5 ring-1 ring-violet-100">
            <span className="absolute inset-y-4 left-0 w-1 rounded-r bg-violet-400" />
            <p className="pl-2 text-[15px] font-semibold text-slate-900">{a.headline}</p>
            <p className="mt-1 pl-2 text-sm leading-relaxed text-slate-700">{a.situation}</p>
          </div>
          <ol className="grid gap-3 md:grid-cols-2">
            {a.recommendations.map((r, i) => (
              <li key={i} className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
                <div className="flex items-start gap-2">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">{i + 1}</span>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{r.action}</div>
                    {label(r.scenarioKey) && <div className="mt-0.5 text-[11px] font-medium text-violet-700">Scenario: {label(r.scenarioKey)}</div>}
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{r.rationale}</p>
                    {r.prerequisites && <p className="mt-1.5 text-xs text-slate-500"><b>First arrange:</b> {r.prerequisites}</p>}
                  </div>
                </div>
              </li>
            ))}
          </ol>
          {!!a.risks?.length && (
            <div className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900">
              <div className="mb-1 font-semibold">Risks</div>
              <ul className="list-disc space-y-0.5 pl-4">{a.risks.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </div>
          )}
          <p className="text-[11px] text-slate-400">{a.model ? `${a.model} · ` : ""}{fmtDateTime(a.at)}</p>
        </div>
      )}
      {err && <div className="mt-3"><ErrorBox message={err} /></div>}
    </Panel>
  );
}

function Scenarios({ plan }: { plan: SchedulePlan }) {
  const max = Math.max(1, ...plan.scenarios.map((s) => s.result.calendarDaysSaved));
  // Best value: most days saved without costing money; else most days per rupee.
  const best = [...plan.scenarios].filter((s) => s.result.calendarDaysSaved > 0).sort((a, b) =>
    Number(b.result.cost.net >= 0) - Number(a.result.cost.net >= 0) || b.result.calendarDaysSaved - a.result.calendarDaysSaved)[0];
  return (
    <Panel title="What if we add labour or run work in parallel?" icon="users" actions={<CalculatedMark title="Each option re-runs the whole schedule over its task links" />}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-slate-500">
              {["Option", "New finish", "Days sooner", "Extra labour", "Overheads saved", "Net"].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {plan.scenarios.map((s) => (
              <tr key={s.key} className={cx(best?.key === s.key && "bg-emerald-50/60")}>
                <td className="px-2 py-2.5">
                  <div className="font-medium text-slate-900">{s.label}{best?.key === s.key && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">BEST VALUE</span>}</div>
                  <div className="text-[11px] text-slate-500">{s.result.tasksSpedUp ? `${s.result.tasksSpedUp} tasks faster` : ""}{s.result.linksOverlapped ? `${s.result.tasksSpedUp ? " · " : ""}${s.result.linksOverlapped} links overlapped` : ""}</div>
                </td>
                <td className="whitespace-nowrap px-2 py-2.5 tabular-nums">{fmtD(s.result.finish)}</td>
                <td className="w-48 px-2 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-sky-500" style={{ width: `${(s.result.calendarDaysSaved / max) * 100}%` }} /></div>
                    <span className="w-14 text-right font-semibold tabular-nums">{s.result.calendarDaysSaved} d</span>
                  </div>
                </td>
                <td className="whitespace-nowrap px-2 py-2.5 tabular-nums text-slate-600">{inr(s.result.cost.extraLabourCost + s.result.cost.reworkCost)}</td>
                <td className="whitespace-nowrap px-2 py-2.5 tabular-nums text-slate-600">{inr(s.result.cost.overheadSaving)}</td>
                <td className="whitespace-nowrap px-2 py-2.5">{net(s.result.cost.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        &ldquo;Critical work&rdquo; = the {plan.base.criticalTasks} tasks that set each wing&apos;s finish date. Labour and overheads use the planning rates (labour {Math.round(plan.rules.labourShareOfCost * 100)}% of task cost, site overheads {inr(plan.rules.siteOverheadPerDay)}/day), changeable under Users &amp; Rules.
      </p>
    </Panel>
  );
}

function CustomScenario({ plan, docId }: { plan: SchedulePlan; docId: string }) {
  const [labour, setLabour] = useState(25);
  const [overlap, setOverlap] = useState(0);
  const [area, setArea] = useState("");
  const [pkgs, setPkgs] = useState<string[]>([]);
  const [critical, setCritical] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<ScenarioResult | null>(null);
  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const body: ScenarioInput = { labourPct: labour, overlapPct: overlap, scope: { areas: area ? [Number(area)] : [], packages: pkgs, criticalOnly: critical } };
      setRes(await api<ScenarioResult>(`/schedule/imports/${docId}/simulate`, { method: "POST", json: body }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const toggle = (p: string) => setPkgs((x) => (x.includes(p) ? x.filter((y) => y !== p) : [...x, p]));
  return (
    <Panel title="Try your own plan" icon="wrench">
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          <label className="block">
            <div className="flex justify-between text-sm"><span className="font-medium text-slate-700">More labour</span><b className="tabular-nums">+{labour}%</b></div>
            <input type="range" min={0} max={100} step={5} value={labour} onChange={(e) => setLabour(Number(e.target.value))} className="w-full accent-slate-900" />
            <div className="text-[11px] text-slate-500">Adds people to each task in scope. +{labour}% people ≈ {Math.round((1 - 1 / (1 + (labour / 100) * plan.rules.labourEfficiency)) * 100)}% shorter (crews crowd each other), at most {Math.round(plan.rules.maxCompression * 100)}% shorter.</div>
          </label>
          <label className="block">
            <div className="flex justify-between text-sm"><span className="font-medium text-slate-700">Run work in parallel (overlap)</span><b className="tabular-nums">{overlap}%</b></div>
            <input type="range" min={0} max={Math.round(plan.rules.maxOverlap * 100)} step={5} value={overlap} onChange={(e) => setOverlap(Number(e.target.value))} className="w-full accent-slate-900" />
            <div className="text-[11px] text-slate-500">The next task starts when {100 - overlap}% of the one before is done. Concreting, curing, testing, NOCs and handover never overlap.</div>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Where</span>
              <select value={area} onChange={(e) => setArea(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                <option value="">Whole project</option>
                {plan.options.areas.map((a) => <option key={a.uid} value={a.uid}>{a.name}</option>)}
              </select>
            </label>
            <label className="flex items-end gap-2 pb-1.5 text-sm text-slate-700"><input type="checkbox" checked={critical} onChange={(e) => setCritical(e.target.checked)} /> Only the critical work</label>
          </div>
          <div>
            <div className="mb-1 text-sm font-medium text-slate-700">Which work <span className="font-normal text-slate-400">(none ticked = all)</span></div>
            <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
              {plan.options.packages.map((p) => (
                <button key={p} type="button" onClick={() => toggle(p)} className={cx("rounded-full px-2.5 py-1 text-[11px] ring-1 ring-inset", pkgs.includes(p) ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50")}>{p}</button>
              ))}
            </div>
          </div>
          <Button onClick={run} disabled={busy || (!labour && !overlap)}>{busy ? <><Spinner /> Re-running the schedule…</> : "Calculate"}</Button>
          {err && <ErrorBox message={err} />}
        </div>
        <div>
          {!res ? (
            <div className="grid h-full place-items-center rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Set the labour and overlap, pick where, then Calculate. The whole schedule is re-run with its links.</div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-sky-50 p-4 ring-1 ring-inset ring-sky-200">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-sky-800">Finish</div>
                  <div className="text-2xl font-semibold tabular-nums text-slate-900">{fmtD(res.finish)}</div>
                  <div className="text-xs text-slate-600">{res.calendarDaysSaved > 0 ? `${res.calendarDaysSaved} days sooner than ${fmtD(res.baseFinish)}` : `no change from ${fmtD(res.baseFinish)}`}</div>
                </div>
                <div className={cx("rounded-xl p-4 ring-1 ring-inset", res.cost.net >= 0 ? "bg-emerald-50 ring-emerald-200" : "bg-red-50 ring-red-200")}>
                  <div className="text-[11px] font-medium uppercase tracking-wide text-slate-600">Money</div>
                  <div className="text-2xl font-semibold">{net(res.cost.net)}</div>
                  <div className="text-xs text-slate-600">labour +{inr(res.cost.extraLabourCost)}{res.cost.reworkCost ? ` · rework +${inr(res.cost.reworkCost)}` : ""} · overheads −{inr(res.cost.overheadSaving)}</div>
                </div>
              </div>
              <p className="text-xs text-slate-600">{res.tasksSpedUp} tasks made faster{res.linksOverlapped ? `, ${res.linksOverlapped} links overlapped` : ""}.{res.calendarDaysSaved === 0 && (res.tasksSpedUp || res.linksOverlapped) ? " This work is not what sets the finish date, so speeding it up does not bring the end forward." : ""}</p>
              <div className="text-xs">
                <div className="mb-1 font-medium text-slate-600">Now sets the finish</div>
                <ul className="space-y-0.5 text-slate-700">{res.criticalPath.slice(-6).map((t) => <li key={t.uid}>· {t.name} <span className="text-slate-400">{t.area}</span></li>)}</ul>
              </div>
              <details className="text-xs text-slate-600">
                <summary className="cursor-pointer select-none font-medium text-slate-500">How this is calculated</summary>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">{res.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>
              </details>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function Drivers({ base }: { base: ScenarioResult }) {
  return (
    <Panel title="What sets the finish date today" icon="flag">
      <ol className="space-y-1 text-sm">
        {base.criticalPath.map((t, i) => (
          <li key={t.uid} className="flex items-center gap-2">
            <span className="w-6 text-right text-xs tabular-nums text-slate-400">{i + 1}</span>
            <span className="text-slate-800">{t.name}</span>
            <span className="text-xs text-slate-400">{t.area}{t.wbs ? ` · ${t.wbs}` : ""}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-slate-500">The chain of linked tasks that ends on the project finish. Delay any of them and the finish moves; speed up other work and it does not.</p>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Cost tab
// ---------------------------------------------------------------------------

export function CostBreakdown({ doc }: { doc: ScheduleImport }) {
  const { data: plan, error } = useApi<SchedulePlan>(`/schedule/imports/${doc._id}/plan`);
  const [open, setOpen] = useState<number | null>(null);
  if (error) return <ErrorBox message={error} />;
  if (!plan) return <Loading />;
  const s = doc.summary;
  const total = Math.max(1, ...plan.costs.areas.map((a) => a.cost || 0));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Construction cost (current)", value: inr(s.cost), sub: "as now scheduled" },
          { label: "Baseline budget", value: inr(s.baselineCost), sub: s.cost != null && s.baselineCost != null ? `${s.baselineCost >= s.cost ? inr(s.baselineCost - s.cost) + " under" : inr(s.cost - s.baselineCost) + " over"} budget` : "" },
          { label: "Spent so far", value: inr(s.actualCost), sub: s.cost ? `${Math.round(((s.actualCost ?? 0) / s.cost) * 100)}% of current cost` : "" },
          { label: "Still to spend", value: inr(s.remainingCost), sub: `${s.percent}% of the work done` },
        ].map((t) => (
          <div key={t.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{t.label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{t.value}</div>
            <div className="text-xs text-slate-500">{t.sub}</div>
          </div>
        ))}
      </div>
      <Panel title="Cost by wing and work package" icon="layers" actions={<span className="text-[11px] text-slate-400">from the MS Project cost fields · click a wing</span>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-500">
                {["Area / package", "Current cost", "Baseline", "Over / under", "Spent", "Spent %", "Work done", "Finish vs baseline"].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {plan.costs.areas.flatMap((a) => [
                <Row key={a.uid} r={a} strong share={(a.cost || 0) / total} onClick={() => setOpen(open === a.uid ? null : a.uid)} open={open === a.uid} expandable={a.packages.length > 0} />,
                ...(open === a.uid ? a.packages.map((p) => <Row key={`${a.uid}-${p.uid}`} r={p} />) : []),
              ])}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Row({ r, strong, share, onClick, open, expandable }: { r: CostRow; strong?: boolean; share?: number; onClick?: () => void; open?: boolean; expandable?: boolean }) {
  const diff = r.cost != null && r.baselineCost != null ? r.cost - r.baselineCost : null;
  const spentPct = r.cost ? Math.round((r.actualCost / r.cost) * 100) : 0;
  return (
    <tr onClick={onClick} className={cx(onClick && "cursor-pointer hover:bg-slate-50", strong && "bg-slate-50/60")}>
      <td className={cx("px-2 py-2", strong ? "font-semibold text-slate-900" : "pl-8 text-slate-700")}>
        <div className="flex items-center gap-1.5">{expandable && <Icon name={open ? "left" : "right"} className={cx("h-3.5 w-3.5 text-slate-400", open && "-rotate-90")} />}{r.name}</div>
        {share != null && <div className="mt-1 h-1 w-40 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-amber-400" style={{ width: `${share * 100}%` }} /></div>}
      </td>
      <td className="whitespace-nowrap px-2 py-2 tabular-nums">{inr(r.cost)}</td>
      <td className="whitespace-nowrap px-2 py-2 tabular-nums text-slate-500">{inr(r.baselineCost)}</td>
      <td className="whitespace-nowrap px-2 py-2 tabular-nums">{diff == null || diff === 0 ? <span className="text-slate-400">—</span> : <span className={diff > 0 ? "text-red-600" : "text-emerald-600"}>{diff > 0 ? `+${inr(diff)}` : `−${inr(-diff)}`}</span>}</td>
      <td className="whitespace-nowrap px-2 py-2 tabular-nums text-slate-600">{inr(r.actualCost)}</td>
      <td className="w-28 px-2 py-2"><div className="flex items-center gap-1.5"><PercentBar percent={spentPct} expected={r.percent} /><span className="w-8 text-right text-xs tabular-nums">{spentPct}%</span></div></td>
      <td className="whitespace-nowrap px-2 py-2 text-xs tabular-nums">{r.percent}%</td>
      <td className="whitespace-nowrap px-2 py-2 text-xs"><Variance days={r.finishVarianceDays} /></td>
    </tr>
  );
}
