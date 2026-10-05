"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { PageHeader } from "@/components/AppShell";
import { useApi } from "@/lib/api";
import type { BuildingModel, Project } from "@/lib/types";
import { ErrorBox, Loading, Select } from "@/components/ui";

const BuildingViewer = dynamic(() => import("@/components/building-viewer").then((m) => m.BuildingViewer), { ssr: false, loading: () => <Loading /> });

export default function ModelPage() {
  const { data: projects } = useApi<Project[]>("/projects");
  const [projectId, setProjectId] = useState("");
  const selected = projectId || projects?.[0]?._id || "";
  const { data, error, loading } = useApi<BuildingModel>(selected ? `/building/projects/${selected}/model` : null);

  return (
    <>
      <PageHeader
        title="3D / 4D building model"
        subtitle="City Life tower. Each floor is split into 3 BHK and 2 BHK rooms, with stairs and lifts in the corridor."
        actions={projects && projects.length > 1 ? (
          <Select value={selected} onChange={(e) => setProjectId(e.target.value)} className="max-w-56">
            {projects.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
          </Select>
        ) : undefined}
      />
      <ErrorBox message={error} />
      {loading && !data ? <Loading /> : data ? <BuildingViewer model={data} /> : null}
    </>
  );
}
