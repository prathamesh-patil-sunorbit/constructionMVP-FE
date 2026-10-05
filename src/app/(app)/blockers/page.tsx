"use client";

import Link from "next/link";
import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { BLOCKER_TYPES, type Activity, type Blocker, type User } from "@/lib/types";
import { PageHeader, useIsManager } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { Badge, BlockerStatusBadge, Card, Empty, ErrorBox, Loading, Select, SeverityBadge, Table, Td } from "@/components/ui";

const FILTERS = { active: "Open,Assigned,In Progress", resolved: "Resolved,Closed", all: "" };

export default function BlockersPage() {
  const manager = useIsManager();
  const { user } = useAuth();
  const engineer = user?.role === "site_engineer";
  const [filter, setFilter] = useState<keyof typeof FILTERS>("active");
  const [type, setType] = useState("");
  const qs = new URLSearchParams();
  if (FILTERS[filter]) qs.set("status", FILTERS[filter]);
  if (type) qs.set("type", type);
  if (engineer) qs.set("mine", "true");
  const { data, error, loading, reload } = useApi<Blocker[]>(`/blockers?${qs}`);
  const { data: managers } = useApi<User[]>(manager ? "/users" : null);

  const assign = async (id: string, assignedTo: string) => {
    await api(`/blockers/${id}`, { method: "PATCH", json: { assignedTo } });
    reload();
  };

  return (
    <>
      <PageHeader
        title={engineer ? "My Blockers" : "Blockers"}
        subtitle={engineer ? "Blockers on activities assigned to you" : "Why work is not progressing"}
        actions={
          <>
            <Select value={type} onChange={(e) => setType(e.target.value)} className="w-40">
              <option value="">All types</option>
              {BLOCKER_TYPES.map((t) => <option key={t}>{t}</option>)}
            </Select>
            <Select value={filter} onChange={(e) => setFilter(e.target.value as keyof typeof FILTERS)} className="w-36">
              <option value="active">Active</option>
              <option value="resolved">Resolved / closed</option>
              <option value="all">All</option>
            </Select>
          </>
        }
      />
      <ErrorBox message={error} />
      <Card>
        {loading && !data ? <Loading /> : data?.length === 0 ? <Empty>No blockers.</Empty> : (
          <Table head={["Activity", "Type", "Description", "Severity", "Reported", "Expected resolution", "Status", "Assigned to"]}>
            {data?.map((b) => {
              const act = b.activity as Activity;
              return (
                <tr key={b._id} className="hover:bg-slate-50">
                  <Td><Link href={`/activities/${act._id}`} className="font-medium hover:underline">{act.name}</Link><div className="text-xs text-slate-400">{act.code}</div></Td>
                  <Td><Badge tone="purple">{b.type}</Badge></Td>
                  <Td className="max-w-64">{b.description}</Td>
                  <Td><SeverityBadge value={b.severity} /></Td>
                  <Td className="whitespace-nowrap text-slate-600">{fmtDate(b.reportedDate)} · {b.reportedBy?.name}</Td>
                  <Td>{fmtDate(b.expectedResolution)}</Td>
                  <Td><BlockerStatusBadge value={b.status} /></Td>
                  <Td>
                    {manager && !["Resolved", "Closed"].includes(b.status) ? (
                      <Select value={b.assignedTo?._id || ""} onChange={(e) => assign(b._id, e.target.value)} className="w-40">
                        <option value="">Unassigned</option>
                        {managers?.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
                      </Select>
                    ) : b.assignedTo?.name || "-"}
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
      <p className="mt-3 text-xs text-slate-500">Open an activity to move a blocker through its lifecycle: Open → Assigned → In Progress → Resolved → Closed.</p>
    </>
  );
}
