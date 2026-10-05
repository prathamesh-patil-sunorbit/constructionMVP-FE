"use client";

import { useApi } from "@/lib/api";
import type { PlanCheck } from "@/lib/types";
import { PageHeader } from "@/components/AppShell";
import { Badge, Card, ErrorBox, Loading, Stat, Table, Td } from "@/components/ui";
import { PlanSheets } from "@/components/plan-sheets";

const STATUS_TONE = { pass: "green", warning: "amber", fail: "red" } as const;

export default function PlanCheckPage() {
  const { data, error, loading } = useApi<PlanCheck>("/plans/city-life");

  return (
    <>
      <PageHeader
        title="Drawing check"
        subtitle="iTREND City Life, S.No. 236 Hinjawadi. Job 2184 checked against the May 2022 issue and the July booklet."
      />
      <ErrorBox message={error} />
      {loading && !data ? <Loading /> : data && (
        <div className="space-y-4">
          <PlanSheets />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Passed" value={data.summary.pass} tone="text-emerald-700" />
            <Stat label="Warnings" value={data.summary.warning} tone="text-amber-700" />
            <Stat label="Failed" value={data.summary.fail} tone="text-red-700" />
            <Stat label="Sheets" value={data.sheets.length} />
          </div>

          <Card title="What this set is">
            <div className="grid gap-3 text-sm md:grid-cols-2">
              <div>
                <div className="font-medium text-slate-800">{data.project.name}</div>
                <p className="mt-1 text-slate-600">{data.project.location}. Architect {data.project.architect}, drawn by {data.project.drawnBy}, job {data.project.jobNo}.</p>
                <p className="mt-1 text-slate-600">Unit-plan client: {data.project.clientOnUnitPlans}. Booklet brand: {data.project.marketing}.</p>
              </div>
              <div className="space-y-1 text-slate-600">
                <div>Drawing stack: {data.project.stackOnDrawing}</div>
                <div>Booklet stack: {data.project.stackOnBooklet}</div>
                <div>Corridor {data.project.corridorM} m · Lifts {data.project.lifts}</div>
                <div>Refuge area called out at {data.project.refugeAreaSqm} m² · {data.shopCount} shops on the ground floor</div>
              </div>
            </div>
          </Card>

          <Card title="Checks">
            <Table head={["", "Check", "Result", "Source"]}>
              {data.checks.map((c) => (
                <tr key={c.id}>
                  <Td><Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge></Td>
                  <Td className="font-medium">{c.title}</Td>
                  <Td className="max-w-xl text-slate-600">{c.detail}</Td>
                  <Td className="whitespace-nowrap text-slate-500">{c.source}</Td>
                </tr>
              ))}
            </Table>
          </Card>

          <Card title="Residential areas">
            <Table head={["Type", "Carpet m²", "Balcony m²", "Terrace m²", "Total m²", "Sheet sq.ft", "Computed sq.ft", "Saleable sq.ft"]}>
              {data.residential.map((r) => (
                <tr key={r.type}>
                  <Td className="font-medium">{r.type}</Td>
                  <Td>{r.carpet}</Td>
                  <Td>{r.balcony}</Td>
                  <Td>{r.terrace || "—"}</Td>
                  <Td>{r.totalSqm}</Td>
                  <Td>{r.carpetSqft}</Td>
                  <Td>{r.computedCarpetSqft}</Td>
                  <Td>{r.salableSqft}</Td>
                </tr>
              ))}
            </Table>
            <p className="mt-3 text-xs text-slate-500">Total m² is carpet + utility + open balcony, plus terrace on the first-floor 2 BHK-A. Saleable sq.ft uses a 1.4 loading on that total. 3 BHK and 2 BHK convertible share one shell.</p>
          </Card>

          <Card title="Ground floor shops">
            <Table head={["Type", "Shops", "Carpet m²", "Mezzanine m²", "Total m²", "Saleable sq.ft", "Computed"]}>
              {data.shops.map((s) => (
                <tr key={s.type}>
                  <Td className="font-medium">{s.type}</Td>
                  <Td>{s.count}</Td>
                  <Td>{s.carpet}</Td>
                  <Td>{s.mezz}</Td>
                  <Td>{s.totalSqm}</Td>
                  <Td>{s.groupSalableSqft ? `${s.salableSqft} each · ${s.groupSalableSqft} group` : s.salableSqft}</Td>
                  <Td>{s.computedSalableSqft}</Td>
                </tr>
              ))}
            </Table>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Floor types">
              <ul className="space-y-2 text-sm text-slate-600">
                <li>Typical floors {data.floors.typical.floors.join(", ")} — {data.floors.typical.flatsPerFloor} flats each.</li>
                <li>Refuge floors {data.floors.refuge.floors.join(", ")} — same plate, with 2 BHK-R, 1 BHK-R and a {data.floors.refuge.refugeAreaSqm} m² refuge.</li>
                <li>First floor flats {data.floors.first.largeFlats.join(", ")} are 3 BHK / convertible. {data.floors.first.twoBhkA.join(", ")} are 2 BHK-A terrace flats.</li>
              </ul>
            </Card>
            <Card title="Sheet register">
              <Table head={["No.", "Rev", "Title", "Date", "Files"]}>
                {data.sheets.map((s) => (
                  <tr key={s.number}>
                    <Td className="font-medium">{s.number}</Td>
                    <Td>{s.rev}</Td>
                    <Td>{s.title}</Td>
                    <Td className="whitespace-nowrap">{s.date}</Td>
                    <Td>{s.dwgPresent && s.pdfPresent ? <Badge tone="green">DWG + PDF</Badge> : <Badge tone="red">Missing</Badge>}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
          </div>

          <Card title="Room sizes on the unit plans">
            <div className="grid gap-4 md:grid-cols-3">
              {data.rooms.map((unit) => (
                <div key={unit.type}>
                  <div className="mb-2 text-sm font-medium text-slate-800">{unit.type}</div>
                  <ul className="space-y-1 text-xs text-slate-600">
                    {unit.rooms.map((room, i) => (
                      <li key={`${unit.type}-${i}`}>{room.name} {room.widthM} × {room.depthM} m</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
