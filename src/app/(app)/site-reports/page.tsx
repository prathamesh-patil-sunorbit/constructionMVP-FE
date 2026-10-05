"use client";

import { useState } from "react";
import { PageHeader } from "@/components/AppShell";
import { useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { isManager, type Project } from "@/lib/types";
import { SiteReportPanel, AttendancePanel, CameraPanel } from "@/components/project-modules";
import { Select } from "@/components/ui";

export default function SiteReportsPage() {
  const { user } = useAuth();
  const canEdit = isManager(user?.role) || user?.role === "site_engineer";
  const { data: projects } = useApi<Project[]>("/projects");
  const [projectId, setProjectId] = useState("");
  const selected = projectId || projects?.[0]?._id || "";
  const [tab, setTab] = useState<"report" | "labour" | "camera">("report");

  return (
    <>
      <PageHeader
        title="Daily site operations"
        subtitle="Attendance, daily progress reports and site photographs."
        actions={projects && projects.length > 1 ? (
          <Select value={selected} onChange={(e) => setProjectId(e.target.value)} className="max-w-56">
            {projects.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
          </Select>
        ) : undefined}
      />
      {selected && (
        <>
          <div className="mb-4 flex gap-1 border-b border-slate-200">
            {(["report", "labour", "camera"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`-mb-px border-b-2 px-3 py-2 text-sm capitalize ${tab === t ? "border-slate-900" : "border-transparent text-slate-500"}`}>{t === "report" ? "Site reports" : t === "labour" ? "Attendance" : "Camera"}</button>
            ))}
          </div>
          {tab === "report" && <SiteReportPanel projectId={selected} canEdit={!!canEdit} />}
          {tab === "labour" && <AttendancePanel projectId={selected} canEdit={!!canEdit} />}
          {tab === "camera" && <CameraPanel projectId={selected} canEdit={!!canEdit} />}
        </>
      )}
    </>
  );
}
