"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { PageHeader } from "@/components/AppShell";
import { useApi } from "@/lib/api";
import type { BuildingModel, Project } from "@/lib/types";
import { Button, Empty, ErrorBox, Loading, Select } from "@/components/ui";
import { FloorplanUpload } from "@/components/floorplan-upload";

const BuildingViewer = dynamic(() => import("@/components/building-viewer").then((m) => m.BuildingViewer), { ssr: false, loading: () => <Loading /> });

export default function ModelPage() {
  const { data: projects, loading: loadingProjects } = useApi<Project[]>("/projects");
  const [projectId, setProjectId] = useState("");
  const [sample, setSample] = useState(false);
  const selected = projectId || projects?.[0]?._id || "";
  const { data, error, loading, setData } = useApi<BuildingModel>(selected ? `/building/projects/${selected}/model` : null);
  const hasPlan = Boolean(data?.floorplan);

  return (
    <>
      <PageHeader
        title="3D / 4D building model"
        subtitle={hasPlan ? "Generated from the uploaded floor plan, with rooms, furniture, stairs and lifts." : "Upload a DWG or DXF floor plan to generate the building from your own drawing."}
        actions={projects && projects.length > 1 ? (
          <Select value={selected} onChange={(e) => { setProjectId(e.target.value); setSample(false); }} className="max-w-56">
            {projects.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
          </Select>
        ) : undefined}
      />
      <ErrorBox message={error} />
      {loadingProjects ? <Loading /> : !selected ? (
        <Empty>No project yet. Create a project first, then upload its floor plan here to generate the 3D building.</Empty>
      ) : loading && !data ? <Loading /> : data ? (
        <>
          <FloorplanUpload model={data} onModel={setData} />
          {hasPlan || sample ? (
            <BuildingViewer key={data.floorplan?.source?.uploadedAt || "sample"} model={data} />
          ) : (
            <div className="flex flex-col items-center gap-3 py-10 text-sm text-slate-500">
              <p>No floor plan uploaded for this project yet.</p>
              <Button variant="ghost" onClick={() => setSample(true)}>Preview the sample City Life tower</Button>
            </div>
          )}
        </>
      ) : null}
    </>
  );
}
