"use client";

import { fmtDate, fmtDateTime, signed } from "@/lib/format";
import type { ActivityDetail, ExecutionLog } from "@/lib/types";
import { Badge, Card, Empty, Table, Td } from "./ui";

const inr = (n?: number) => (n == null ? "-" : `₹${n.toLocaleString("en-IN")}`);

function SourceTag({ source, synced }: { source?: string; synced?: string }) {
  if (!source) return null;
  return <span className="text-[11px] font-normal text-slate-400">from {source}{synced ? ` · ${fmtDateTime(synced)}` : ""}</span>;
}

function teamLead(a: ActivityDetail, type: string) {
  const t = a.teams.find((x) => x.type === type);
  return t ? `${t.name}${t.lead ? ` · ${t.lead.name}` : ""}` : null;
}

export function TeamDataCards({ a }: { a: ActivityDetail }) {
  const est = a.estimates[0];
  const latest = a.executionLogs[0];
  const m = a.metrics;
  const bl = a.baseline;

  return (
    <div className="grid gap-5 lg:col-span-3 lg:grid-cols-3">
      <Card title={<span className="flex items-center gap-2">Planning team <SourceTag source={bl?.source || a.source} synced={a.lastSyncedAt} /></span>}>
        <div className="mb-2 text-xs text-slate-500">{teamLead(a, "Planning") || "No planning team linked"}</div>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            <tr><td className="py-1.5 text-slate-500">Baseline {bl?.version && <Badge>{bl.version}</Badge>}</td><td className="text-right">{bl?.start ? `${fmtDate(bl.start)} → ${fmtDate(bl.finish)}` : "-"}</td></tr>
            <tr><td className="py-1.5 text-slate-500">Current plan</td><td className="text-right">{fmtDate(a.plannedStart)} → {fmtDate(a.plannedFinish)}</td></tr>
            <tr><td className="py-1.5 text-slate-500">Expected finish</td><td className="text-right">{fmtDate(m.actualFinish || m.expectedFinish)}</td></tr>
            <tr>
              <td className="py-1.5 text-slate-500">vs baseline</td>
              <td className={`text-right font-semibold ${(m.baselineVarianceDays ?? 0) > 0 ? "text-red-600" : ""}`}>{m.baselineVarianceDays == null ? "-" : signed(m.baselineVarianceDays, " days")}</td>
            </tr>
          </tbody>
        </table>
        {bl?.approvedBy && <div className="mt-2 text-xs text-slate-400">Baseline approved by {bl.approvedBy}</div>}
      </Card>

      <Card title={<span className="flex items-center gap-2">Estimation team <SourceTag source={est?.source} synced={est?.lastSyncedAt} /></span>}>
        <div className="mb-2 text-xs text-slate-500">{teamLead(a, "Estimation") || "No estimation team linked"}</div>
        {!est ? <Empty>No estimate received yet.</Empty> : (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">{est.boqCode} {est.version && <Badge>{est.version}</Badge>}</span><Badge tone={est.status === "Approved" ? "green" : "amber"}>{est.status}</Badge></div>
            <div className="flex justify-between"><span className="text-slate-500">Quantity × rate</span><span>{est.quantity} {est.unit} × {inr(est.rate)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Estimated cost</span><span className="font-semibold">{inr(est.amount)}</span></div>
            <div className="flex justify-between">
              <span className="text-slate-500">Duration: estimated vs planned</span>
              <span className={est.estimatedDurationDays && est.estimatedDurationDays > a.plannedDuration ? "font-semibold text-red-600" : ""}>{est.estimatedDurationDays ?? "-"}d vs {a.plannedDuration}d</span>
            </div>
            <div className="flex justify-between"><span className="text-slate-500">Productivity</span><span>{est.productivityPerDay ?? "-"} {est.unit}/day</span></div>
            <div className="border-t border-slate-100 pt-2 text-xs text-slate-600">
              <div><b>Labour/day:</b> {est.labour.map((l) => `${l.trade} ${l.count}`).join(", ") || "-"}</div>
              <div><b>Materials:</b> {est.materials.map((x) => `${x.name} ${x.quantity} ${x.unit}`).join(", ") || "-"}</div>
              <div><b>Machinery:</b> {est.machinery.map((x) => `${x.name} ×${x.count}`).join(", ") || "-"}</div>
            </div>
          </div>
        )}
      </Card>

      <Card title={<span className="flex items-center gap-2">Execution team <SourceTag source={latest?.source} /></span>}>
        <div className="mb-2 text-xs text-slate-500">{teamLead(a, "Execution") || "No execution team linked"}</div>
        {!latest ? <Empty>No daily report received yet.</Empty> : (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-xs text-slate-500"><span>Latest DPR {fmtDate(latest.date)} · {latest.contractor}</span><span>{latest.weather}</span></div>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th>Trade</th><th className="text-right">Planned</th><th className="text-right">Actual</th></tr></thead>
              <tbody>
                {latest.manpower.map((mp) => (
                  <tr key={mp.trade}>
                    <td>{mp.trade}</td>
                    <td className="text-right">{mp.planned}</td>
                    <td className={`text-right font-medium ${mp.actual < mp.planned ? "text-red-600" : ""}`}>{mp.actual}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {m.manpower?.short && <div className="rounded bg-red-50 p-2 text-xs text-red-800">Shortfall: {m.manpower.trade} {m.manpower.actual} of {m.manpower.planned} planned</div>}
            {latest.remarks && <div className="text-xs text-slate-600">“{latest.remarks}”</div>}
            <div className="text-xs text-slate-500">Machinery: {latest.machinery.map((x) => `${x.name} ×${x.count}${x.hours ? ` (${x.hours}h)` : ""}`).join(", ") || "-"}</div>
          </div>
        )}
      </Card>
    </div>
  );
}

export function ExecutionReportsTable({ logs, unit }: { logs: ExecutionLog[]; unit?: string }) {
  if (!logs.length) return <Empty>No daily execution reports.</Empty>;
  return (
    <Table head={["Date", "Contractor", "Manpower (actual / planned)", "Machinery", "Materials consumed", "Weather", "Remarks"]}>
      {logs.map((l) => {
        const planned = l.manpower.reduce((s, x) => s + x.planned, 0);
        const actual = l.manpower.reduce((s, x) => s + x.actual, 0);
        return (
          <tr key={l._id}>
            <Td className="whitespace-nowrap">{fmtDate(l.date)}</Td>
            <Td className="text-slate-600">{l.contractor || "-"}</Td>
            <Td>
              <span className={actual < planned ? "font-semibold text-red-600" : "font-semibold"}>{actual} / {planned}</span>
              <div className="text-xs text-slate-500">{l.manpower.map((x) => `${x.trade} ${x.actual}/${x.planned}`).join(", ")}</div>
            </Td>
            <Td className="text-xs text-slate-600">{l.machinery.map((x) => `${x.name} ×${x.count}`).join(", ") || "-"}</Td>
            <Td className="text-xs text-slate-600">{l.materialsConsumed.map((x) => `${x.name} ${x.quantity} ${x.unit || unit || ""}`).join(", ") || "-"}</Td>
            <Td className="text-slate-600">{l.weather || "-"}</Td>
            <Td className="max-w-56 text-slate-600">{l.remarks || "-"}</Td>
          </tr>
        );
      })}
    </Table>
  );
}
