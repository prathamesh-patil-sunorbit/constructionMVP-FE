"use client";

import Link from "next/link";
import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { fmtDateTime, signed } from "@/lib/format";
import { ROLE_LABELS, type Escalation, type Risk } from "@/lib/types";
import { PageHeader } from "@/components/AppShell";
import { Badge, Button, Card, Empty, ErrorBox, HealthBadge, Loading, Select, SeverityBadge, Table, Td } from "@/components/ui";

export default function RisksPage() {
  const [status, setStatus] = useState("Open");
  const risks = useApi<Risk[]>(`/risks${status ? `?status=${status}` : ""}`);
  const [mine, setMine] = useState(false);
  const escalations = useApi<Escalation[]>(`/escalations?mine=${mine}`);

  const ack = async (id: string) => {
    await api(`/escalations/${id}/acknowledge`, { method: "PATCH", json: {} });
    escalations.reload();
  };

  return (
    <>
      <PageHeader
        title="Risks & Early Warnings"
        subtitle="Generated automatically by the rules engine from delay, blockers and dependency impact"
        actions={
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-32">
            <option value="Open">Open</option>
            <option value="Closed">Closed</option>
            <option value="">All</option>
          </Select>
        }
      />
      <ErrorBox message={risks.error} />
      {risks.loading && !risks.data ? <Loading /> : (
        <div className="space-y-3">
          {risks.data?.length === 0 && <Empty>No risks.</Empty>}
          {risks.data?.map((r) => (
            <Card key={r._id}>
              <div className="flex flex-wrap items-center gap-2">
                <SeverityBadge value={r.severity} />
                <Badge tone={r.status === "Open" ? "red" : "slate"}>{r.status}</Badge>
                <Link href={`/activities/${r.activity?._id}`} className="font-semibold hover:underline">{r.activity?.name}</Link>
                <span className="text-xs text-slate-400">{r.activity?.code}</span>
                {r.activityHealth && <HealthBadge value={r.activityHealth} />}
              </div>
              <p className="mt-2 text-sm">⚠ {r.message}</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600 md:grid-cols-5">
                <div>Variance <b>{signed(r.progressVariance, "%")}</b></div>
                <div>Delay <b>+{r.delayDays}d</b></div>
                <div>Blocker <b>{r.blockerType || "-"}</b></div>
                <div>Expected impact <b>+{r.expectedImpactDays}d</b> on {r.impacted.length} activities</div>
                <div>Escalated to <b>{r.escalatedTo?.name || "-"}</b>{r.escalatedTo && ` (${ROLE_LABELS[r.escalatedTo.role]})`}</div>
              </div>
              <details className="mt-2 text-xs text-slate-500">
                <summary className="cursor-pointer">History ({r.history.length})</summary>
                <ol className="mt-1 space-y-1 border-l border-slate-200 pl-3">
                  {r.history.map((h, i) => <li key={i}>{fmtDateTime(h.at)} · <b>{h.event}</b>{h.message ? `: ${h.message}` : ""}</li>)}
                </ol>
              </details>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-8">
        <Card title="Escalations" actions={
          <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Only escalated to me</label>
        }>
          {escalations.data?.length === 0 ? <Empty>No escalations.</Empty> : (
            <Table head={["When", "Activity", "Severity", "Escalated to", "Reason", "Status", ""]}>
              {escalations.data?.map((e) => (
                <tr key={e._id}>
                  <Td className="whitespace-nowrap text-slate-500">{fmtDateTime(e.createdAt)}</Td>
                  <Td><Link href={`/activities/${e.activity?._id}`} className="hover:underline">{e.activity?.name}</Link></Td>
                  <Td><SeverityBadge value={e.severity} /></Td>
                  <Td>{e.escalatedTo?.name} <span className="text-xs text-slate-400">{ROLE_LABELS[e.level]}</span></Td>
                  <Td className="max-w-md text-slate-600">{e.reason}</Td>
                  <Td><Badge tone={e.status === "Open" ? "amber" : "green"}>{e.status}</Badge></Td>
                  <Td>{e.status === "Open" && <Button variant="secondary" onClick={() => ack(e._id)}>Acknowledge</Button>}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
