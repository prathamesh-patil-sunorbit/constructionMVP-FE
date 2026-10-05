"use client";

import Link from "next/link";
import { useApi } from "@/lib/api";
import { display, fmtDateTime } from "@/lib/format";
import type { AuditLog } from "@/lib/types";
import { PageHeader } from "@/components/AppShell";
import { Card, ErrorBox, Loading, Table, Td } from "@/components/ui";

export default function AuditPage() {
  const { data, error, loading } = useApi<AuditLog[]>("/audit-logs?limit=300");
  return (
    <>
      <PageHeader title="Audit Trail" subtitle="Every important action, for accountability and future analytics" />
      <ErrorBox message={error} />
      <Card>
        {loading && !data ? <Loading /> : (
          <Table head={["When", "User", "Action", "Activity", "Field", "Previous", "New", "Comment"]}>
            {data?.map((l) => (
              <tr key={l._id}>
                <Td className="whitespace-nowrap text-slate-500">{fmtDateTime(l.createdAt)}</Td>
                <Td>{l.userName}</Td>
                <Td className="font-medium">{l.action}</Td>
                <Td>{l.activity ? <Link href={`/activities/${l.activity._id}`} className="hover:underline">{l.activity.name}</Link> : "-"}</Td>
                <Td className="text-slate-500">{l.field || "-"}</Td>
                <Td className="max-w-40 truncate">{display(l.previousValue)}</Td>
                <Td className="max-w-40 truncate">{display(l.newValue)}</Td>
                <Td className="max-w-72 text-slate-600">{l.comment || "-"}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
