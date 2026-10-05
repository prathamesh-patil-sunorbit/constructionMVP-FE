"use client";

import Link from "next/link";
import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { fmtDateTime, fmtWeekday, signed } from "@/lib/format";
import { ROLE_LABELS, type Escalation, type Portfolio, type Project, type Risk } from "@/lib/types";
import { AlertList } from "@/components/ai";
import { PageHeader, useIsManager } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { canAccess } from "@/lib/navigation";
import { Badge, Button, Card, Empty, ErrorBox, HealthBadge, Loading, Select, SeverityBadge, Table, Td } from "@/components/ui";

interface Dashboard {
  asOf: string;
  status: Record<string, number>;
  blockersByType: Record<string, number>;
  risksBySeverity: Record<string, number>;
  delayed: { _id: string; name: string; code: string; location: string; delayDays: number; progressVariance: number; reason: string; impact: string[]; health: string; status: string; severity?: string }[];
  risks: Risk[];
  escalations: Escalation[];
}

function Bars({ data, colors }: { data: Record<string, number>; colors?: Record<string, string> }) {
  const max = Math.max(1, ...Object.values(data));
  const entries = Object.entries(data).filter(([, v]) => v > 0);
  if (!entries.length) return <Empty>None active</Empty>;
  return (
    <div className="space-y-2">
      {entries.sort((a, b) => b[1] - a[1]).map(([k, v]) => (
        <div key={k} className="flex items-center gap-2 text-sm">
          <div className="w-28 shrink-0 text-slate-600">{k}</div>
          <div className="h-5 flex-1 rounded bg-slate-100">
            <div className={`h-5 rounded ${colors?.[k] || "bg-slate-700"}`} style={{ width: `${(v / max) * 100}%` }} />
          </div>
          <div className="w-6 text-right font-semibold">{v}</div>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const manager = useIsManager();
  const { user } = useAuth();
  const { data: projects } = useApi<Project[]>("/projects");
  const [projectId, setProjectId] = useState("");
  const { data, error, loading, reload } = useApi<Dashboard>(`/dashboard${projectId ? `?project=${projectId}` : ""}`);
  const { data: portfolio } = useApi<Portfolio>("/ai/portfolio");
  const [busy, setBusy] = useState(false);

  const recalc = async () => {
    setBusy(true);
    const ids = projectId ? [projectId] : (projects || []).map((p) => p._id);
    for (const id of ids) await api(`/projects/${id}/evaluate`, { method: "POST" });
    await reload();
    setBusy(false);
  };

  const ack = async (id: string) => {
    await api(`/escalations/${id}/acknowledge`, { method: "PATCH", json: {} });
    reload();
  };

  const s = data?.status;
  const statusTiles: [string, string, string][] = [
    ["On Track", "text-emerald-600", "border-l-emerald-500"],
    ["At Risk", "text-amber-600", "border-l-amber-400"],
    ["Delayed", "text-red-600", "border-l-red-500"],
    ["Blocked", "text-violet-600", "border-l-violet-500"],
  ];

  return (
    <>
      <PageHeader
        title="Management Dashboard"
        subtitle={data ? `As of ${fmtWeekday(data.asOf)}` : undefined}
        actions={
          <>
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-56">
              <option value="">All projects</option>
              {projects?.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
            </Select>
            {manager && <Button variant="secondary" onClick={recalc} disabled={busy}>{busy ? "Recalculating…" : "Recalculate"}</Button>}
          </>
        }
      />
      <ErrorBox message={error} />
      {loading && !data ? <Loading /> : data && s && (
        <div className="space-y-5">
          {portfolio && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card title="Projects"><div className="text-2xl font-semibold">{portfolio.projects}</div></Card>
              <Card title="Average progress"><div className="text-2xl font-semibold">{portfolio.averageProgress}%</div></Card>
              <Card title="Projects at risk"><div className="text-2xl font-semibold text-amber-600">{portfolio.projectsAtRisk}</div></Card>
              <Card title="Labour on latest report"><div className="text-2xl font-semibold">{portfolio.labourToday || "—"}</div><div className="text-[11px] text-slate-400">{portfolio.labourAsOf ? "from execution reports" : "no report yet"}</div></Card>
              <Card title="Low / critical stock"><div className="text-2xl font-semibold">{portfolio.lowStockItems}</div></Card>
              <Card title="Critical AI alerts"><div className="text-2xl font-semibold text-red-600">{portfolio.criticalAlerts}</div></Card>
            </div>
          )}
          {portfolio?.alerts?.length ? (
            <Card title="AI alert centre">
              <AlertList alerts={portfolio.alerts} />
            </Card>
          ) : null}
          <Card title="1 · What is happening? Project status">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
              <div className="rounded-lg border border-slate-200 p-3"><div className="text-xs text-slate-500">Total activities</div><div className="text-2xl font-semibold">{s.total}</div></div>
              {statusTiles.map(([k, tone, border]) => (
                <div key={k} className={`rounded-lg border border-l-4 border-slate-200 p-3 ${border}`}>
                  <div className="text-xs text-slate-500">{k}</div>
                  <div className={`text-2xl font-semibold ${tone}`}>{s[k]}</div>
                </div>
              ))}
              <div className="rounded-lg border border-slate-200 p-3"><div className="text-xs text-slate-500">Completed</div><div className="text-2xl font-semibold text-slate-600">{s.Completed}</div></div>
            </div>
          </Card>

          <div className="grid gap-5 md:grid-cols-2">
            <Card title="3 · Why? Active blockers by type"><Bars data={data.blockersByType} /></Card>
            <Card title="Active risks by level">
              <Bars data={{ High: data.risksBySeverity.High, Medium: data.risksBySeverity.Medium, Low: data.risksBySeverity.Low }} colors={{ High: "bg-red-500", Medium: "bg-amber-400", Low: "bg-sky-400" }} />
            </Card>
          </div>

          <Card title="2 · What is going wrong? Delayed & blocked activities">
            {data.delayed.length === 0 ? <Empty>No delayed or blocked activities 🎉</Empty> : (
              <Table head={["Activity", "Location", "Delay", "Variance", "Reason", "4 · Potential impact", "Status", "Risk"]}>
                {data.delayed.map((d) => (
                  <tr key={d._id} className="hover:bg-slate-50">
                    <Td><Link className="font-medium hover:underline" href={`/activities/${d._id}`}>{d.name}</Link><div className="text-xs text-slate-400">{d.code}</div></Td>
                    <Td className="text-slate-600">{d.location}</Td>
                    <Td className="font-semibold text-red-600">{d.delayDays > 0 ? `+${d.delayDays}d` : "-"}</Td>
                    <Td className={d.progressVariance < 0 ? "text-red-600" : ""}>{signed(d.progressVariance, "%")}</Td>
                    <Td className="max-w-56 text-slate-700">{d.reason}</Td>
                    <Td className="max-w-56 text-slate-600">{d.impact.length ? `${d.impact.slice(0, 3).join(", ")}${d.impact.length > 3 ? ` +${d.impact.length - 3} more` : ""}` : "-"}</Td>
                    <Td><HealthBadge value={d.health} /></Td>
                    <Td><SeverityBadge value={d.severity} /></Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          <div className="grid gap-5 md:grid-cols-2">
            <Card title="Early warnings" actions={user && canAccess(user.role, "/risks") && <Link href="/risks" className="text-xs text-slate-500 hover:underline">All risks →</Link>}>
              {data.risks.length === 0 ? <Empty>No open risks</Empty> : (
                <ul className="space-y-3">
                  {data.risks.map((r) => (
                    <li key={r._id} className="rounded-lg border border-slate-200 p-3">
                      <div className="mb-1 flex items-center gap-2"><SeverityBadge value={r.severity} /><Link href={`/activities/${r.activity?._id}`} className="text-sm font-medium hover:underline">{r.activity?.name}</Link></div>
                      <p className="text-sm text-slate-700">⚠ {r.message}</p>
                      <div className="mt-1 text-xs text-slate-500">Expected impact +{r.expectedImpactDays}d · Escalated to {r.escalatedTo ? `${r.escalatedTo.name} (${ROLE_LABELS[r.escalatedTo.role]})` : "-"}</div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="5 · Who needs to act? Open escalations">
              {data.escalations.length === 0 ? <Empty>No open escalations</Empty> : (
                <ul className="divide-y divide-slate-100">
                  {data.escalations.map((e) => (
                    <li key={e._id} className="flex items-start justify-between gap-3 py-2">
                      <div className="text-sm">
                        <div className="flex items-center gap-2"><SeverityBadge value={e.severity} /><span className="font-medium">{e.activity?.name}</span></div>
                        <div className="mt-0.5 text-xs text-slate-500">→ {e.escalatedTo?.name} <Badge>{ROLE_LABELS[e.level]}</Badge> · {fmtDateTime(e.createdAt)}</div>
                      </div>
                      <Button variant="secondary" onClick={() => ack(e._id)}>Acknowledge</Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
