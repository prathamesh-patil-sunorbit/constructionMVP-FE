"use client";

import Link from "next/link";
import { useState } from "react";
import { useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate, fmtWeekday } from "@/lib/format";
import { isManager } from "@/lib/types";
import { PageHeader } from "@/components/AppShell";
import { Badge, Button, Card, Empty, ErrorBox, HealthBadge, Loading, Modal, Progress, StatusBadge } from "@/components/ui";
import { BlockerForm, ProgressUpdateForm } from "@/components/forms";

interface PlanItem {
  _id: string;
  code: string;
  name: string;
  location: string;
  target: string;
  targetProgress: number;
  status: string;
  health: string;
  actualProgress: number;
  plannedFinish: string;
  plannedQuantity?: number;
  unit?: string;
  responsible?: string;
  blockers: { type: string; description: string }[];
}
interface DailyPlan { date: string; today: { date: string; items: PlanItem[] }; upcoming: { date: string; items: PlanItem[] }[] }

export default function TodayPage() {
  const { user } = useAuth();
  const manager = isManager(user?.role);
  const [mine, setMine] = useState(user?.role === "site_engineer");
  const { data, error, loading, reload } = useApi<DailyPlan>(`/daily-plan?days=5&mine=${mine}`);
  const [updating, setUpdating] = useState<PlanItem | null>(null);
  const [blocking, setBlocking] = useState<PlanItem | null>(null);

  const done = () => {
    setUpdating(null);
    setBlocking(null);
    reload();
  };

  return (
    <>
      <PageHeader
        title={`Good day, ${user?.name.split(" ")[0]}`}
        subtitle={data ? `Today's plan · ${fmtWeekday(data.date)}` : "Today's plan"}
        actions={user?.role !== "site_engineer" && (
          <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
            <button onClick={() => setMine(true)} className={`rounded-md px-3 py-1 ${mine ? "bg-slate-900 text-white" : ""}`}>My activities</button>
            <button onClick={() => setMine(false)} className={`rounded-md px-3 py-1 ${!mine ? "bg-slate-900 text-white" : ""}`}>All activities</button>
          </div>
        )}
      />
      <ErrorBox message={error} />
      {loading && !data ? <Loading /> : data && (
        <div className="space-y-6">
          <Card title={<>Today <span className="font-normal text-slate-400">· {data.today.items.length} activities</span></>}>
            {data.today.items.length === 0 ? <Empty>No activities planned for today.</Empty> : (
              <div className="divide-y divide-slate-100">
                {data.today.items.map((it) => (
                  <div key={it._id} className="flex flex-wrap items-center gap-4 py-3">
                    <div className="min-w-56 flex-1">
                      <Link href={`/activities/${it._id}`} className="font-medium hover:underline">{it.name}</Link>
                      <div className="text-xs text-slate-500">{it.location} · {it.code}{manager && it.responsible ? ` · ${it.responsible}` : ""}</div>
                      {it.blockers.map((b, i) => (
                        <div key={i} className="mt-1 text-xs text-violet-700">⛔ {b.type}: {b.description}</div>
                      ))}
                    </div>
                    <div className="w-28 text-sm">
                      <div className="text-xs text-slate-500">Planned today</div>
                      <div className="font-medium">{it.target}</div>
                    </div>
                    <div className="w-40">
                      <div className="mb-1 flex justify-between text-xs text-slate-500"><span>Actual {it.actualProgress}%</span><span>Plan {it.targetProgress}%</span></div>
                      <Progress planned={it.targetProgress} actual={it.actualProgress} />
                    </div>
                    <div className="flex w-44 gap-1"><StatusBadge value={it.status} /><HealthBadge value={it.health} /></div>
                    <div className="flex gap-2">
                      {it.status !== "Completed" && <Button onClick={() => setUpdating(it)}>Update</Button>}
                      {it.status !== "Completed" && <Button variant="secondary" onClick={() => setBlocking(it)}>Blocker</Button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Next 5 days">
            <div className="grid gap-3 md:grid-cols-5">
              {data.upcoming.map((day) => (
                <div key={day.date} className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{fmtWeekday(day.date)}</div>
                  {day.items.length === 0 ? <div className="text-xs text-slate-400">Nothing planned</div> : (
                    <ul className="space-y-2">
                      {day.items.map((it) => (
                        <li key={it._id}>
                          <Link href={`/activities/${it._id}`} className="block rounded-md bg-white p-2 text-sm shadow-sm ring-1 ring-slate-200 hover:ring-slate-400">
                            <div className="font-medium leading-tight">{it.name}</div>
                            <div className="mt-0.5 text-xs text-slate-500">{it.location.split(" › ").slice(-1)[0]} · {it.target}</div>
                            {it.health !== "On Track" && <div className="mt-1"><HealthBadge value={it.health} /></div>}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </Card>
          <p className="text-xs text-slate-400">
            Planned % is the linear target by end of day. <Badge>Overdue</Badge> items are past planned finish ({data.today.items.filter((i) => i.target === "Overdue").map((i) => `${i.name} due ${fmtDate(i.plannedFinish)}`).join(", ") || "none"}).
          </p>
        </div>
      )}

      <Modal open={!!updating} onClose={() => setUpdating(null)} title="Daily actual update">
        {updating && <ProgressUpdateForm activity={updating} onDone={done} />}
      </Modal>
      <Modal open={!!blocking} onClose={() => setBlocking(null)} title={`Report blocker · ${blocking?.name}`}>
        {blocking && <BlockerForm activityId={blocking._id} onDone={done} />}
      </Modal>
    </>
  );
}
