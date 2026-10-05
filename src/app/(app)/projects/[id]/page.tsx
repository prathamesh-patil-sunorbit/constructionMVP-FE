"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { api, useApi } from "@/lib/api";
import { fmtDate, signed } from "@/lib/format";
import type { Activity, AiInsights, BuildingModel, Project, StructureNodeT, User } from "@/lib/types";
import { PageHeader, useIsManager } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { Badge, Button, Card, Empty, ErrorBox, Field, HealthBadge, Input, Loading, Modal, Progress, Select, StatusBadge, Table, Td } from "@/components/ui";
import { AttendancePanel, CameraPanel, InventoryPanel, SiteReportPanel } from "@/components/project-modules";
import { CompletionCard, DelayCard, EquipmentCard, HealthCard, LabourCard, MaterialCard, PlanningCard, SchedulingCard } from "@/components/ai";

const BuildingViewer = dynamic(() => import("@/components/building-viewer").then((m) => m.BuildingViewer), { ssr: false, loading: () => <Loading /> });

interface Dep { _id: string; predecessor: Activity; successor: Activity; type: string; lagDays: number }

function flatten(nodes: StructureNodeT[], depth = 0, out: { node: StructureNodeT; depth: number }[] = []) {
  for (const n of nodes) {
    out.push({ node: n, depth });
    flatten(n.children, depth + 1, out);
  }
  return out;
}

function TreeNode({ node, selected, onSelect, depth = 0 }: { node: StructureNodeT; selected: string; onSelect: (id: string) => void; depth?: number }) {
  const s = node.summary;
  return (
    <div>
      <button onClick={() => onSelect(node._id)} className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm ${selected === node._id ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`} style={{ paddingLeft: 8 + depth * 16 }}>
        <span><span className="text-xs opacity-60">{node.type}</span> {node.name}</span>
        <span className="flex gap-1 text-[11px]">
          {s.Blocked > 0 && <span className="rounded bg-violet-500 px-1 text-white">{s.Blocked}</span>}
          {s.Delayed > 0 && <span className="rounded bg-red-500 px-1 text-white">{s.Delayed}</span>}
          {s["At Risk"] > 0 && <span className="rounded bg-amber-400 px-1 text-slate-900">{s["At Risk"]}</span>}
          <span className="opacity-60">{s.total}</span>
        </span>
      </button>
      {node.children.map((c) => <TreeNode key={c._id} node={c} selected={selected} onSelect={onSelect} depth={depth + 1} />)}
    </div>
  );
}

function ActivityForm({ projectId, nodes, onDone }: { projectId: string; nodes: { node: StructureNodeT; depth: number }[]; onDone: () => void }) {
  const { data: users } = useApi<User[]>("/users?role=site_engineer");
  const [f, setF] = useState({ code: "", name: "", structureNode: "", wbs: "", plannedStart: "", plannedFinish: "", plannedQuantity: "", unit: "", responsible: "", priority: "Medium" });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api("/activities", { method: "POST", json: { ...f, project: projectId } });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3">
      <div className="col-span-2"><Field label="Activity name"><Input required value={f.name} onChange={set("name")} placeholder="Mivan Slab Formwork" /></Field></div>
      <Field label="Activity ID" hint="Auto-generated if blank"><Input value={f.code} onChange={set("code")} /></Field>
      <Field label="WBS"><Input value={f.wbs} onChange={set("wbs")} /></Field>
      <div className="col-span-2">
        <Field label="Tower / Floor / Zone">
          <Select required value={f.structureNode} onChange={set("structureNode")}>
            <option value="">Select location</option>
            {nodes.map(({ node, depth }) => <option key={node._id} value={node._id}>{"\u00a0\u00a0".repeat(depth)}{node.type} {node.name}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Planned start"><Input type="date" required value={f.plannedStart} onChange={set("plannedStart")} /></Field>
      <Field label="Planned finish"><Input type="date" required value={f.plannedFinish} onChange={set("plannedFinish")} /></Field>
      <Field label="Planned quantity"><Input type="number" step="any" value={f.plannedQuantity} onChange={set("plannedQuantity")} /></Field>
      <Field label="Unit"><Input value={f.unit} onChange={set("unit")} placeholder="sq.ft" /></Field>
      <Field label="Responsible engineer">
        <Select value={f.responsible} onChange={set("responsible")}>
          <option value="">-</option>
          {users?.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
        </Select>
      </Field>
      <Field label="Priority">
        <Select value={f.priority} onChange={set("priority")}>{["Low", "Medium", "High", "Critical"].map((p) => <option key={p}>{p}</option>)}</Select>
      </Field>
      <div className="col-span-2"><ErrorBox message={error} /></div>
      <div className="col-span-2 flex justify-end"><Button>Create activity</Button></div>
    </form>
  );
}

function NodeForm({ projectId, nodes, onDone }: { projectId: string; nodes: { node: StructureNodeT; depth: number }[]; onDone: () => void }) {
  const [f, setF] = useState({ name: "", type: "Tower", parent: "" });
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api(`/projects/${projectId}/structure`, { method: "POST", json: f });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Parent">
        <Select value={f.parent} onChange={(e) => setF({ ...f, parent: e.target.value })}>
          <option value="">(Top level, directly under project)</option>
          {nodes.map(({ node, depth }) => <option key={node._id} value={node._id}>{"\u00a0\u00a0".repeat(depth)}{node.type} {node.name}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type" hint="Free text: Tower, Building, Wing, Floor, Zone, Podium…"><Input required value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} /></Field>
        <Field label="Name"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Tower B / Floor 20" /></Field>
      </div>
      <ErrorBox message={error} />
      <div className="flex justify-end"><Button>Add</Button></div>
    </form>
  );
}

function DependencyForm({ activities, onDone }: { activities: Activity[]; onDone: () => void }) {
  const [f, setF] = useState({ predecessor: "", successor: "", lagDays: "0" });
  const [error, setError] = useState<string | null>(null);
  const label = (a: Activity) => `${a.code} · ${a.name}`;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api("/dependencies", { method: "POST", json: f });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Parent activity (must finish first)">
        <Select required value={f.predecessor} onChange={(e) => setF({ ...f, predecessor: e.target.value })}>
          <option value="">Select</option>
          {activities.map((a) => <option key={a._id} value={a._id}>{label(a)}</option>)}
        </Select>
      </Field>
      <Field label="Dependent activity (starts after)">
        <Select required value={f.successor} onChange={(e) => setF({ ...f, successor: e.target.value })}>
          <option value="">Select</option>
          {activities.map((a) => <option key={a._id} value={a._id}>{label(a)}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type"><Input disabled value="Finish → Start" /></Field>
        <Field label="Lag (days)"><Input type="number" value={f.lagDays} onChange={(e) => setF({ ...f, lagDays: e.target.value })} /></Field>
      </div>
      <ErrorBox message={error} />
      <div className="flex justify-end"><Button>Add dependency</Button></div>
    </form>
  );
}

const PROJECT_TABS = [
  "Overview", "Schedule", "Labour", "Materials", "Inventory", "Equipment",
  "Site reports", "Camera", "3D / 4D", "AI Insights",
] as const;

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const manager = useIsManager();
  const { user } = useAuth();
  const canSite = manager || user?.role === "site_engineer";
  const canStock = manager || user?.role === "estimation_engineer";
  const { data: project } = useApi<Project>(`/projects/${id}`);
  const tree = useApi<StructureNodeT[]>(`/projects/${id}/tree`);
  const [selected, setSelected] = useState("");
  const acts = useApi<Activity[]>(`/activities?project=${id}${selected ? `&node=${selected}` : ""}`);
  const allActs = useApi<Activity[]>(`/activities?project=${id}`);
  const deps = useApi<Dep[]>(`/dependencies?project=${id}`);
  const insights = useApi<AiInsights>(`/ai/projects/${id}/insights`);
  const model = useApi<BuildingModel>(`/building/projects/${id}/model`);
  const [modal, setModal] = useState<"" | "activity" | "node" | "dep">("");
  const [tab, setTab] = useState<(typeof PROJECT_TABS)[number]>("Overview");
  const nodes = useMemo(() => flatten(tree.data || []), [tree.data]);
  const selectedNode = nodes.find((n) => n.node._id === selected)?.node;

  const refresh = () => {
    setModal("");
    tree.reload();
    acts.reload();
    allActs.reload();
    deps.reload();
  };

  const removeDep = async (depId: string) => {
    await api(`/dependencies/${depId}`, { method: "DELETE" });
    refresh();
  };

  if (!project) return <Loading />;

  return (
    <>
      <PageHeader
        title={project.name}
        subtitle={<>{project.code} · {project.location} · {fmtDate(project.startDate, true)} → {fmtDate(project.plannedCompletionDate, true)} · PM {project.projectManager?.name || "-"} · SM {project.siteManager?.name || "-"}</>}
        actions={manager && (
          <>
            <Button variant="secondary" onClick={() => setModal("node")}>Add tower/floor</Button>
            <Button variant="secondary" onClick={() => setModal("dep")}>Add dependency</Button>
            <Button onClick={() => setModal("activity")}>Add activity</Button>
          </>
        )}
      />
      <div className="grid gap-5 md:grid-cols-[260px_1fr]">
        <Card title="Drill-down">
          <button onClick={() => setSelected("")} className={`mb-1 w-full rounded-lg px-2 py-1.5 text-left text-sm ${selected === "" ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`}>Whole project</button>
          {tree.data?.map((n) => <TreeNode key={n._id} node={n} selected={selected} onSelect={setSelected} />)}
          {tree.data?.length === 0 && <Empty>Add a tower / building to start.</Empty>}
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
            <span><span className="inline-block h-2 w-2 rounded bg-violet-500" /> Blocked</span>
            <span><span className="inline-block h-2 w-2 rounded bg-red-500" /> Delayed</span>
            <span><span className="inline-block h-2 w-2 rounded bg-amber-400" /> At risk</span>
          </div>
        </Card>

        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 text-sm">
            {PROJECT_TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1.5 ${tab === t ? "bg-slate-900 text-white" : "hover:bg-slate-50"}`}>{t}</button>
            ))}
          </div>
          {tab === "Overview" && insights.data && (
            <div className="space-y-4">
              <CompletionCard data={insights.data.analysis.completion} confidence={insights.data.analysis.confidence} />
              <HealthCard data={insights.data.analysis.health} />
              <PlanningCard data={insights.data.analysis.planning} />
            </div>
          )}
          {tab === "Schedule" && (
            <div className="space-y-4">
              {insights.data && <SchedulingCard data={insights.data.analysis.scheduling} />}
              <Card title="Activity dependencies (Finish → Start)">
                {deps.data?.length === 0 ? <Empty>No dependencies defined.</Empty> : (
                  <Table head={["Parent activity", "", "Dependent activity", "Lag", ""]}>
                    {deps.data?.map((d) => (
                      <tr key={d._id}>
                        <Td><Link href={`/activities/${d.predecessor._id}`} className="hover:underline">{d.predecessor.name}</Link> <span className="text-xs text-slate-400">{d.predecessor.code}</span> <HealthBadge value={d.predecessor.health} /></Td>
                        <Td><Badge>FS →</Badge></Td>
                        <Td><Link href={`/activities/${d.successor._id}`} className="hover:underline">{d.successor.name}</Link> <span className="text-xs text-slate-400">{d.successor.code}</span> <HealthBadge value={d.successor.health} /></Td>
                        <Td>{d.lagDays}d</Td>
                        <Td>{manager && <Button variant="ghost" onClick={() => removeDep(d._id)}>Remove</Button>}</Td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Card>
            </div>
          )}
          {tab === "Labour" && insights.data && <><LabourCard data={insights.data.analysis.labour} /><AttendancePanel projectId={id} canEdit={!!canSite} /></>}
          {tab === "Materials" && insights.data && <MaterialCard data={insights.data.analysis.material} />}
          {tab === "Inventory" && <InventoryPanel projectId={id} canEdit={!!canStock} />}
          {tab === "Equipment" && insights.data && <EquipmentCard data={insights.data.analysis.equipment} />}
          {tab === "Site reports" && <SiteReportPanel projectId={id} canEdit={!!canSite} />}
          {tab === "Camera" && <CameraPanel projectId={id} canEdit={!!canSite} />}
          {tab === "3D / 4D" && (model.data ? <BuildingViewer model={model.data} /> : <Empty>Loading model…</Empty>)}
          {tab === "AI Insights" && insights.data && (
            <div className="space-y-4">
              <DelayCard data={insights.data.analysis.delay} />
              <CompletionCard data={insights.data.analysis.completion} confidence={insights.data.analysis.confidence} />
            </div>
          )}
          {tab === "Overview" && (
            <Card title={selectedNode ? `${selectedNode.type} ${selectedNode.name}` : "All activities"}>
              <ErrorBox message={acts.error} />
              {acts.data?.length === 0 ? <Empty>No activities here yet.</Empty> : (
                <Table head={["Activity", "Location", "Planned", "Progress", "Variance", "Expected finish", "Status"]}>
                  {acts.data?.map((a) => {
                    const node = typeof a.structureNode === "object" ? a.structureNode : undefined;
                    return (
                      <tr key={a._id} className="hover:bg-slate-50">
                        <Td><Link href={`/activities/${a._id}`} className="font-medium hover:underline">{a.name}</Link><div className="text-xs text-slate-400">{a.code} · {a.responsible?.name || "unassigned"} · <span className={a.source === "colab" ? "text-sky-600" : "text-emerald-600"}>{a.source === "colab" ? "Colab plan" : "Site"}</span></div></Td>
                        <Td className="text-slate-600">{node?.name}</Td>
                        <Td className="whitespace-nowrap text-slate-600">{fmtDate(a.plannedStart)} → {fmtDate(a.plannedFinish)}</Td>
                        <Td className="w-36">
                          <div className="mb-1 text-xs text-slate-500">{a.metrics.actualProgress}% / {a.metrics.plannedProgress}%</div>
                          <Progress planned={a.metrics.plannedProgress} actual={a.metrics.actualProgress} />
                        </Td>
                        <Td className={a.metrics.progressVariance < 0 ? "text-red-600" : "text-slate-600"}>{signed(a.metrics.progressVariance, "%")}</Td>
                        <Td className="whitespace-nowrap">
                          {fmtDate(a.metrics.expectedFinish)}
                          {a.metrics.scheduleVarianceDays > 0 && <span className="ml-1 font-semibold text-red-600">+{a.metrics.scheduleVarianceDays}d</span>}
                        </Td>
                        <Td><div className="flex flex-col items-start gap-1"><StatusBadge value={a.status} /><HealthBadge value={a.health} /></div></Td>
                      </tr>
                    );
                  })}
                </Table>
              )}
            </Card>
          )}
        </div>
      </div>

      <Modal open={modal === "activity"} onClose={() => setModal("")} title="New activity">
        <ActivityForm projectId={id} nodes={nodes} onDone={refresh} />
      </Modal>
      <Modal open={modal === "node"} onClose={() => setModal("")} title="Add structure node">
        <NodeForm projectId={id} nodes={nodes} onDone={refresh} />
      </Modal>
      <Modal open={modal === "dep"} onClose={() => setModal("")} title="New dependency">
        <DependencyForm activities={allActs.data || []} onDone={refresh} />
      </Modal>
    </>
  );
}
