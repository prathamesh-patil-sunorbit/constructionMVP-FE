"use client";

import { useState } from "react";
import { Badge, Button, Card, Empty, Td, Table } from "./ui";
import { fmtDate, fmtDateTime, signed } from "@/lib/format";
import type {
  AiAgentCard, AiAlert, AiNarration, AiPrediction, AlertLevel, CompletionForecast,
  Confidence, DelayAnalysis, EquipmentAnalysis, GroundAnalysis, HealthScore,
  LabourAnalysis, MaterialAnalysis, Simulation,
} from "@/lib/types";

// Everything a model wrote carries this mark, so calculated figures and generated prose are
// never confused with each other.
export const AiMark = () => (
  <span className="inline-flex items-center gap-1 rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700 ring-1 ring-inset ring-violet-200">
    AI generated
  </span>
);

export const CalculatedMark = ({ title }: { title?: string }) => (
  <span title={title} className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 ring-1 ring-inset ring-slate-200">
    Calculated
  </span>
);

export function Basis({ lines, label = "How this is calculated" }: { lines?: string[]; label?: string }) {
  if (!lines?.length) return null;
  return (
    <details className="mt-3 text-xs text-slate-500">
      <summary className="cursor-pointer select-none font-medium text-slate-600 hover:text-slate-900">{label}</summary>
      <ul className="mt-1.5 list-disc space-y-1 pl-4">
        {lines.map((l, i) => <li key={i}>{l}</li>)}
      </ul>
    </details>
  );
}

export function NoData({ reason }: { reason?: string | null }) {
  return (
    <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
      <span className="font-medium">Insufficient project data.</span> {reason}
    </div>
  );
}

const LEVEL_TONE: Record<string, string> = { Low: "green", Medium: "amber", High: "red", Critical: "purple" };
const ALERT_TONE: Record<AlertLevel, string> = { critical: "red", warning: "amber", attention: "blue", positive: "green" };
const ALERT_DOT: Record<AlertLevel, string> = { critical: "bg-red-500", warning: "bg-amber-500", attention: "bg-sky-500", positive: "bg-emerald-500" };

// ---------------------------------------------------------------------------
// Completion prediction
// ---------------------------------------------------------------------------

export function CompletionCard({ data, confidence }: { data: CompletionForecast; confidence: Confidence }) {
  if (data.complete) {
    return <Card title="Completion forecast"><Empty>All planned activities are complete.</Empty></Card>;
  }
  const tone = data.delayDays > 0 ? "text-red-600" : "text-emerald-600";
  return (
    <Card
      title="Completion forecast"
      actions={<div className="flex items-center gap-2"><CalculatedMark title="Computed by the schedule engine, not by the language model" /><Badge tone={confidence.confidence >= 70 ? "green" : confidence.confidence >= 40 ? "amber" : "red"}>{confidence.confidence}% confidence</Badge></div>}
    >
      {data.scopeNote && (
        <p className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">{data.scopeNote}</p>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="text-xs text-slate-500">Planned (end of plan)</div>
          <div className="mt-1 text-xl font-semibold">{fmtDate(data.plannedCompletion, true)}</div>
        </div>
        <div className="rounded-lg border-2 border-slate-900 p-3">
          <div className="text-xs text-slate-500">Predicted (expected)</div>
          <div className="mt-1 text-xl font-semibold">{fmtDate(data.expected, true)}</div>
          <div className={`text-xs font-medium ${tone}`}>{signed(data.delayDays, " days")}</div>
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="text-xs text-slate-500">Range</div>
          <div className="mt-1 text-sm">Best <span className="font-semibold">{fmtDate(data.best)}</span></div>
          <div className="text-sm">Worst <span className="font-semibold">{fmtDate(data.worst)}</span></div>
        </div>
      </div>
      {data.criticalActivity && (
        <p className="mt-3 text-sm text-slate-600">
          Driven by <span className="font-medium">{data.criticalActivity.name}</span> ({data.criticalActivity.code}), currently {signed(data.criticalActivity.slipDays, "d")}.
        </p>
      )}
      {confidence.insufficientData && <div className="mt-3"><NoData reason={confidence.reason} /></div>}
      <Basis lines={[...data.basis, ...confidence.basis]} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Delay intelligence
// ---------------------------------------------------------------------------

export function DelayCard({ data }: { data: DelayAnalysis }) {
  return (
    <Card
      title="Delay intelligence"
      actions={<div className="flex items-center gap-2"><CalculatedMark /><Badge tone={LEVEL_TONE[data.level]}>{data.level} delay risk</Badge></div>}
    >
      <p className="text-sm text-slate-600">{data.levelReason}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Largest slip", `${data.maxSlipDays}d`],
          ["Behind plan", data.activitiesBehind],
          ["Blocked", data.activitiesBlocked],
          ["Waiting upstream", data.waitingOnPredecessor],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg bg-slate-50 p-2 text-center">
            <div className="text-lg font-semibold">{value}</div>
            <div className="text-[11px] text-slate-500">{label}</div>
          </div>
        ))}
      </div>
      {data.contributors.length ? (
        <div className="mt-4">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">What is causing it</div>
          <Table head={["Activity", "Slip", "Variance", "Why"]}>
            {data.contributors.map((c) => (
              <tr key={c.code}>
                <Td><div className="font-medium">{c.name}</div><div className="text-xs text-slate-400">{c.code} · {c.location}</div></Td>
                <Td className="whitespace-nowrap">{c.slipDays > 0 ? signed(c.slipDays, "d") : "-"}</Td>
                <Td className={c.progressVariance < 0 ? "text-red-600" : ""}>{c.progressVariance}%</Td>
                <Td><ul className="list-disc pl-4 text-xs text-slate-600">{c.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul></Td>
              </tr>
            ))}
          </Table>
        </div>
      ) : <Empty>Nothing is behind plan.</Empty>}
      {Object.entries(data.blockersByType).filter(([, n]) => n > 0).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Object.entries(data.blockersByType).filter(([, n]) => n > 0).map(([type, n]) => (
            <Badge key={type} tone="slate">{type}: {n}</Badge>
          ))}
        </div>
      )}
      <Basis lines={data.basis} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

export function LabourCard({ data }: { data: LabourAnalysis }) {
  return (
    <Card title="Labour intelligence" actions={<CalculatedMark />}>
      {data.insufficientData && !data.trades.length ? <NoData reason={data.reason} /> : (
        <>
          {data.insufficientData && <div className="mb-3"><NoData reason={data.reason} /></div>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Needed today", data.requiredToday ?? "-"],
              ["On site", data.totalPresent ?? "-"],
              [`Peak (${fmtDate(data.peakDate)})`, data.requiredPeak ?? "-"],
              ["Peak shortfall", data.shortfallPeak ?? "-"],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg bg-slate-50 p-2 text-center">
                <div className="text-lg font-semibold">{value as React.ReactNode}</div>
                <div className="text-[11px] text-slate-500">{label}</div>
              </div>
            ))}
          </div>
          {data.trades.length > 0 && (
            <div className="mt-3">
              <Table head={["Trade", "Today", "Peak", "On site", "Shortfall"]}>
                {data.trades.map((t) => (
                  <tr key={t.trade}>
                    <Td className="font-medium">{t.trade}</Td>
                    <Td>{t.requiredToday}</Td>
                    <Td>{t.requiredPeak}</Td>
                    <Td>{t.present}</Td>
                    <Td>{t.shortfallPeak > 0 ? <Badge tone="red">{t.shortfallPeak} short</Badge> : t.surplus > 0 ? <Badge tone="blue">{t.surplus} spare</Badge> : <Badge tone="green">met</Badge>}</Td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
        </>
      )}
      <Basis lines={data.basis} />
    </Card>
  );
}

export function MaterialCard({ data }: { data: MaterialAnalysis }) {
  return (
    <Card title="Material intelligence" actions={<CalculatedMark />}>
      {data.insufficientData ? <NoData reason={data.reason} /> : (
        <>
          {data.stockNote && (
            <p className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">{data.stockNote}</p>
          )}
          <Table head={data.stockTracked ? ["Material", "Stock", "Still required", "Days cover", "Risk"] : ["Material", "Still required", "Consumed to date"]}>
            {data.materials.map((m) => (
              <tr key={m.name}>
                <Td className="font-medium">{m.name}</Td>
                {data.stockTracked ? (
                  <>
                    <Td>{m.stock ?? "-"} {m.unit}</Td>
                    <Td>{m.requiredNextWindow} {m.unit}</Td>
                    <Td>{m.daysOfCover ?? "-"}</Td>
                    <Td>{m.stockRisk ? <Badge tone={m.stockRisk === "Critical" ? "red" : m.stockRisk === "Low" ? "amber" : "green"}>{m.stockRisk}</Badge> : "-"}</Td>
                  </>
                ) : (
                  <>
                    <Td>{m.requiredNextWindow} {m.unit}</Td>
                    <Td>{m.consumedToDate} {m.unit}</Td>
                  </>
                )}
              </tr>
            ))}
          </Table>
        </>
      )}
      <Basis lines={data.basis} />
    </Card>
  );
}

export function InventoryCard({ data }: { data: import("@/lib/types").InventoryAnalysis }) {
  return (
    <Card title="Inventory control" actions={<CalculatedMark />}>
      {data.insufficientData ? <NoData reason={data.reason} /> : (
        <Table head={["Item", "Stock", "Reorder", "Required (7d)", "Buy", "Risk"]}>
          {data.items.map((m) => (
            <tr key={m.name}>
              <Td className="font-medium">{m.name}<div className="text-[11px] text-slate-400">{m.supplier || m.unit}</div></Td>
              <Td>{m.stock} {m.unit}</Td>
              <Td>{m.reorderLevel}</Td>
              <Td>{m.requiredNextWindow} {m.unit}</Td>
              <Td>{m.recommendedPurchase} {m.unit}</Td>
              <Td><Badge tone={m.stockRisk === "Critical" ? "red" : m.stockRisk === "Low" ? "amber" : m.stockRisk === "Excess" ? "blue" : "green"}>{m.stockRisk}</Badge></Td>
            </tr>
          ))}
        </Table>
      )}
      <Basis lines={data.basis} />
    </Card>
  );
}

export function PlanningCard({ data }: { data: import("@/lib/types").PlanningAnalysis }) {
  return (
    <Card title="Planning" actions={<CalculatedMark />}>
      <p className="text-sm text-slate-600">
        Critical path remaining <span className="font-semibold">{data.criticalPath.remainingDays} day(s)</span>
        {data.criticalPath.activities.length ? `: ${data.criticalPath.activities.map((a) => a.code).join(" → ")}` : "."}
      </p>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Phases</div>
          <Table head={["Phase", "Activities", "Actual", "Planned", "Open"]}>
            {data.phases.map((p) => (
              <tr key={p.category}>
                <Td className="capitalize">{p.category}</Td>
                <Td>{p.activities}</Td>
                <Td>{p.actual}%</Td>
                <Td>{p.planned}%</Td>
                <Td>{p.remaining}</Td>
              </tr>
            ))}
          </Table>
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Milestones</div>
          <Table head={["Activity", "Plan", "Forecast"]}>
            {data.milestones.map((m) => (
              <tr key={m.code}>
                <Td>{m.name}<div className="text-[11px] text-slate-400">{m.code} · {m.priority}</div></Td>
                <Td>{fmtDate(m.plannedFinish)}</Td>
                <Td>{fmtDate(m.expectedFinish)}</Td>
              </tr>
            ))}
          </Table>
        </div>
      </div>
      <Basis lines={data.basis} />
    </Card>
  );
}

export function SchedulingCard({ data }: { data: import("@/lib/types").SchedulingAnalysis }) {
  return (
    <Card title="Scheduling" actions={<CalculatedMark />}>
      {data.delayed.length === 0 && data.conflicts.length === 0 ? <Empty>No schedule conflicts or delayed activities.</Empty> : (
        <>
          {data.delayed.length > 0 && (
            <Table head={["Delayed activity", "Slip", "Plan", "Forecast"]}>
              {data.delayed.map((d) => (
                <tr key={d.code}>
                  <Td>{d.name}<div className="text-[11px] text-slate-400">{d.code}</div></Td>
                  <Td className="text-red-600">+{d.slipDays}d</Td>
                  <Td>{fmtDate(d.plannedFinish)}</Td>
                  <Td>{fmtDate(d.expectedFinish)}</Td>
                </tr>
              ))}
            </Table>
          )}
          {data.conflicts.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-slate-700">
              {data.conflicts.map((c, i) => <li key={i}>{c.detail} ({c.a.code} / {c.b.code})</li>)}
            </ul>
          )}
          {data.recoveryOptions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.recoveryOptions.map((o) => <Badge key={o.type} tone="blue">{o.label}</Badge>)}
            </div>
          )}
        </>
      )}
      <Basis lines={data.basis} />
    </Card>
  );
}

export function EquipmentCard({ data }: { data: EquipmentAnalysis }) {
  return (
    <Card title="Equipment intelligence" actions={<CalculatedMark />}>
      {data.insufficientData ? <NoData reason={data.reason} /> : (
        <Table head={["Machine", "Peak need", "Deployed", `Hours (7d)`, "Utilisation"]}>
          {data.items.map((i) => (
            <tr key={i.name}>
              <Td className="font-medium">{i.name}</Td>
              <Td>{i.required}</Td>
              <Td>{i.deployed}{i.shortfall > 0 && <Badge tone="red">{i.shortfall} short</Badge>}</Td>
              <Td>{i.hoursLast7Days || "-"}</Td>
              <Td>{i.utilisationPercent === null ? <span className="text-slate-400">no hours logged</span> : <Badge tone={i.utilisationPercent > 90 ? "red" : i.utilisationPercent > 60 ? "amber" : "green"}>{i.utilisationPercent}%</Badge>}</Td>
            </tr>
          ))}
        </Table>
      )}
      <Basis lines={data.basis} />
    </Card>
  );
}

export function GroundCard({ data }: { data: GroundAnalysis }) {
  return (
    <Card title="Ground condition risk" actions={<CalculatedMark />}>
      {!data.detected ? <Empty>No rock, soil or excavation condition reported from site.</Empty> : (
        <div className="space-y-3">
          {data.reports.map((r, i) => (
            <div key={i} className="rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">{r.activity.name} <span className="text-xs font-normal text-slate-400">{r.activity.code} · {r.activity.location}</span></div>
                {r.severity && <Badge tone={r.severity === "High" ? "red" : "amber"}>{r.severity}</Badge>}
              </div>
              <p className="mt-1 text-sm text-slate-600">{r.condition}</p>
              {r.insufficientData ? <div className="mt-2"><NoData reason={r.reason} /></div> : (
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ["Extra duration", `${r.additionalDays}d`],
                    ["Duration", `${r.normalDurationDays}d → ${r.affectedDurationDays}d`],
                    ["Extra machines", r.additionalBreakerOrMachines],
                    ["Extra labour", r.additionalLabour],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded bg-slate-50 p-2 text-center">
                      <div className="text-sm font-semibold">{value as React.ReactNode}</div>
                      <div className="text-[11px] text-slate-500">{label}</div>
                    </div>
                  ))}
                </div>
              )}
              <Basis lines={r.basis} />
            </div>
          ))}
        </div>
      )}
      <Basis lines={data.basis} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Health score
// ---------------------------------------------------------------------------

export function HealthCard({ data }: { data: HealthScore }) {
  const bar = (n: number) => (n >= 75 ? "bg-emerald-500" : n >= 50 ? "bg-amber-500" : "bg-red-500");
  return (
    <Card title="Project health score" actions={<CalculatedMark />}>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold">{data.overall}</span>
        <span className="text-sm text-slate-500">/ 100</span>
      </div>
      <div className="mt-3 space-y-2">
        {data.dimensions.map((d) => (
          <div key={d.key}>
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700">{d.key}</span>
              <span className="text-slate-500">{d.score === null ? "no data" : d.score}</span>
            </div>
            <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              {d.score !== null && <div className={`h-full rounded-full ${bar(d.score)}`} style={{ width: `${d.score}%` }} />}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-400">{d.basis}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-slate-400">{data.note}</p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export function AlertList({ alerts, onAcknowledge }: { alerts: AiAlert[]; onAcknowledge?: (id: string) => void }) {
  if (!alerts.length) return <Empty>No open alerts.</Empty>;
  return (
    <div className="space-y-2">
      {alerts.map((a) => (
        <div key={a._id} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${ALERT_DOT[a.level]}`} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{a.title}</span>
              <Badge tone={ALERT_TONE[a.level]}>{a.level}</Badge>
              <Badge tone="slate">{a.category}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-slate-600">{a.message}</p>
            <Basis lines={a.basis} />
          </div>
          {onAcknowledge && a.status === "Open" && (
            <Button variant="secondary" onClick={() => onAcknowledge(a._id)}>Acknowledge</Button>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent narration
// ---------------------------------------------------------------------------

export function Narration({ data }: { data: AiNarration | null }) {
  if (!data) return null;
  if (!data.aiGenerated) {
    return <p className="text-sm text-slate-600">{data.headline}</p>;
  }
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <AiMark />
        <p className="text-sm text-slate-700">{data.summary}</p>
      </div>
      {!!data.findings?.length && (
        <ul className="space-y-1.5">
          {data.findings.map((f, i) => (
            <li key={i} className="rounded-lg bg-slate-50 p-2 text-sm">
              <span className="font-medium">{f.title}.</span> {f.detail}
              <div className="mt-0.5 text-[11px] text-slate-500">Evidence: {f.evidence}</div>
            </li>
          ))}
        </ul>
      )}
      {!!data.recommendations?.length && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recommended</div>
          <ul className="mt-1 space-y-1">
            {data.recommendations.map((r, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium">{r.action}</span>
                <span className="text-slate-500"> — {r.rationale}{r.owner ? ` (${r.owner})` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!!data.dataGaps?.length && (
        <div className="rounded-lg border border-dashed border-slate-300 p-2 text-xs text-slate-500">
          <span className="font-medium text-slate-600">To improve this answer, record: </span>
          {data.dataGaps.join("; ")}
        </div>
      )}
    </div>
  );
}

export function AgentCard({ agent, onRun, running }: { agent: AiAgentCard; onRun?: () => void; running?: boolean }) {
  return (
    <Card
      title={agent.title}
      actions={
        <div className="flex items-center gap-2">
          {agent.status === "Degraded" && <Badge tone="amber">figures only</Badge>}
          {agent.ranAt && <span className="text-[11px] text-slate-400">{fmtDateTime(agent.ranAt)}</span>}
          {onRun && <Button variant="secondary" onClick={onRun} disabled={running}>{running ? "Running…" : agent.narration ? "Re-run" : "Run"}</Button>}
        </div>
      }
    >
      <p className="mb-2 text-xs text-slate-500">{agent.description}</p>
      <p className="text-sm font-medium text-slate-800">{agent.headline}</p>
      {agent.narration?.aiGenerated && <div className="mt-3 border-t border-slate-100 pt-3"><Narration data={agent.narration} /></div>}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Predictions with human override
// ---------------------------------------------------------------------------

const STATUS_TONE: Record<string, string> = { Proposed: "slate", Accepted: "green", Rejected: "red", Overridden: "blue" };

export function PredictionRow({ prediction, canDecide, onDecide }: {
  prediction: AiPrediction;
  canDecide: boolean;
  onDecide: (id: string, decision: string, value?: unknown, reason?: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (decision: string, v?: unknown) => {
    setBusy(true);
    try {
      await onDecide(prediction._id, decision, v, reason);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">{prediction.label}</div>
        <div className="flex items-center gap-2">
          <Badge tone={STATUS_TONE[prediction.status]}>{prediction.status}</Badge>
          {prediction.confidence !== undefined && <Badge tone="slate">{prediction.confidence}% confidence</Badge>}
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
        {Object.entries(prediction.value || {})
          .filter(([, v]) => v !== null && typeof v !== "object")
          .map(([k, v]) => (
            <span key={k}>
              <span className="text-slate-500">{k}:</span>{" "}
              <span className="font-medium">{/date|Date/.test(k) ? fmtDate(String(v)) : String(v)}</span>
            </span>
          ))}
      </div>
      {prediction.override && (
        <p className="mt-2 rounded bg-sky-50 px-2 py-1 text-xs text-sky-800">
          Overridden to <span className="font-medium">{String(prediction.override.value)}</span>
          {prediction.override.reason ? ` — ${prediction.override.reason}` : ""}
          {prediction.decidedBy ? ` by ${prediction.decidedBy.name}` : ""}
        </p>
      )}
      <Basis lines={prediction.basis} />
      {canDecide && prediction.status === "Proposed" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => run("Accepted")}>Accept</Button>
          <Button variant="secondary" disabled={busy} onClick={() => run("Rejected")}>Reject</Button>
          <Button variant="ghost" disabled={busy} onClick={() => setEditing(!editing)}>Override</Button>
        </div>
      )}
      {editing && (
        <form
          className="mt-2 flex flex-wrap items-end gap-2"
          onSubmit={(e) => { e.preventDefault(); run("Overridden", value); }}
        >
          <input className="rounded-lg border border-slate-300 px-2 py-1 text-sm" placeholder="Your value (e.g. 2026-12-20)" value={value} onChange={(e) => setValue(e.target.value)} required />
          <input className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm" placeholder="Reason (stored in the audit trail)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button disabled={busy || !value}>Save override</Button>
        </form>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Simulation result
// ---------------------------------------------------------------------------

export function SimulationResult({ data }: { data: Simulation }) {
  if (data.insufficientData) return <NoData reason={data.reason} />;
  const saved = data.daysSaved ?? 0;
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{data.label}</span>
        <div className="flex items-center gap-2">
          <CalculatedMark />
          <Badge tone={saved > 0 ? "green" : saved < 0 ? "red" : "slate"}>
            {saved > 0 ? `${saved} day(s) earlier` : saved < 0 ? `${-saved} day(s) later` : "no change"}
          </Badge>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded bg-slate-50 p-2">
          <div className="text-[11px] text-slate-500">Current forecast</div>
          <div className="font-semibold">{fmtDate(data.baselineCompletion, true)}</div>
        </div>
        <div className="rounded bg-slate-50 p-2">
          <div className="text-[11px] text-slate-500">Revised forecast</div>
          <div className="font-semibold">{fmtDate(data.revisedCompletion, true)}</div>
        </div>
        <div className="rounded bg-slate-50 p-2">
          <div className="text-[11px] text-slate-500">Cost impact</div>
          <div className="font-semibold">
            {data.costImpact?.calculable
              ? `₹${data.costImpact.amount?.toLocaleString("en-IN")} ${data.costImpact.period}`
              : <span className="text-sm font-normal text-slate-400">not calculable</span>}
          </div>
          {data.costImpact?.formula && <div className="text-[11px] text-slate-400">{data.costImpact.formula}</div>}
        </div>
      </div>
      {data.costImpact && !data.costImpact.calculable && <p className="mt-2 text-xs text-slate-500">{data.costImpact.note}</p>}
      <Basis lines={data.assumptions} label="Assumptions" />
    </div>
  );
}
