"use client";

import Link from "next/link";
import { api, useApi } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import type { Notification } from "@/lib/types";
import { PageHeader } from "@/components/AppShell";
import { Button, Card, Empty, ErrorBox, Loading } from "@/components/ui";

const ICON: Record<string, string> = { critical: "🔴", warning: "⚠️", success: "✅", info: "ℹ️" };

export default function NotificationsPage() {
  const { data, error, loading, reload } = useApi<{ items: Notification[]; unread: number }>("/notifications");

  const markAll = async () => {
    await api("/notifications/read-all", { method: "PATCH" });
    reload();
  };
  const markRead = (id: string) => api(`/notifications/${id}/read`, { method: "PATCH" });

  return (
    <>
      <PageHeader title="Notifications" subtitle={data ? `${data.unread} unread` : undefined} actions={data?.unread ? <Button variant="secondary" onClick={markAll}>Mark all read</Button> : null} />
      <ErrorBox message={error} />
      {loading && !data ? <Loading /> : data?.items.length === 0 ? <Empty>You have no notifications.</Empty> : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {data?.items.map((n) => (
              <li key={n._id} className={`flex gap-3 py-3 ${n.read ? "opacity-60" : ""}`}>
                <div className="text-lg">{ICON[n.type] || ICON.info}</div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold">{n.title}</div>
                    <div className="text-xs text-slate-400">{fmtDateTime(n.createdAt)}</div>
                  </div>
                  <p className="text-sm text-slate-700">{n.message}</p>
                  {n.link && <Link href={n.link} onClick={() => markRead(n._id)} className="text-xs font-medium text-sky-700 hover:underline">Review →</Link>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
