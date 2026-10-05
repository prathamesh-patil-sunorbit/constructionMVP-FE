"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Bounds, ContactShadows, Edges, OrbitControls, Sky } from "@react-three/drei";
import { DoubleSide } from "three";
import type { BuildingModel } from "@/lib/types";
import { Badge, Button, Card, Empty, HealthBadge } from "./ui";
import { CalculatedMark } from "./ai";
import { fmtDate, signed } from "@/lib/format";
import type { ThreeEvent } from "@react-three/fiber";

const WALL = "#f2d7b0";
const PAINT = "#f7ebe0";
const CONCRETE = "#c5bfb3";
const SLAB = "#ddd6cb";
const FLOOR = "#d2b48c";
const FRAME = "#5c4033";
const DOOR = "#6b3a2a";
const GLASS = "#8ecae6";
const LIGHT = "#fff6c8";
const GRASS = "#5f8f3e";
const ASPHALT = "#9a9388";
const PARAPET = "#e8d4b0";
const MEP = "#5b8def";

function progressAt(activity: BuildingModel["activities"][number], day: Date) {
  const hist = activity.history.filter((h) => new Date(h.date) <= day);
  if (hist.length) return hist[hist.length - 1].progress;
  if (new Date(activity.plannedStart) > day) return 0;
  return activity.actualProgress;
}

function componentProgress(model: BuildingModel, ids: string[], day: Date) {
  const acts = ids.map((id) => model.activities.find((a) => a.id === id)).filter(Boolean) as BuildingModel["activities"];
  if (!acts.length) return null;
  return acts.reduce((t, a) => t + progressAt(a, day), 0) / acts.length;
}

function appearance(type: string, wallColor: string, night: boolean, selected: boolean) {
  if (selected) return { color: "#1e293b", roughness: 0.5, metalness: 0.1, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
  switch (type) {
    case "wall":
    case "parapet":
      return { color: type === "parapet" ? PARAPET : wallColor || WALL, roughness: 0.92, metalness: 0.02, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "flooring":
      return { color: FLOOR, roughness: 0.55, metalness: 0.05, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "slab":
      return { color: SLAB, roughness: 0.85, metalness: 0.02, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "column":
      return { color: CONCRETE, roughness: 0.8, metalness: 0.04, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "mullion":
    case "frame":
      return { color: type === "mullion" ? "#f7f1e8" : "#4a3728", roughness: 0.45, metalness: 0.12, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "railing":
      return { color: "#2f3540", roughness: 0.35, metalness: 0.55, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "furniture":
      return { color: "#8b5a2b", roughness: 0.6, metalness: 0.05, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "canopy":
    case "step":
      return { color: "#c9c2b6", roughness: 0.8, metalness: 0.05, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "band":
      return { color: "#d7c4a3", roughness: 0.75, metalness: 0.04, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "ac":
      return { color: "#9aa3ad", roughness: 0.4, metalness: 0.35, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "hedge":
      return { color: "#4f7a3e", roughness: 0.95, metalness: 0, opacity: 1, emissive: night ? "#1a3318" : "#000", emissiveIntensity: 0 };
    case "tree":
      return { color: "#3f7a32", roughness: 0.9, metalness: 0, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "trunk":
      return { color: "#5c3a21", roughness: 0.9, metalness: 0, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "ground":
      return { color: GRASS, roughness: 1, metalness: 0, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "window":
      return {
        color: "#7ec8e3", roughness: 0.04, metalness: 0.25, opacity: night ? 0.78 : 0.38, transparent: true,
        emissive: night ? "#ffcc66" : "#eaf6ff", emissiveIntensity: night ? 2.2 : 0.25,
      };
    case "door":
      return { color: DOOR, roughness: 0.55, metalness: 0.08, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "light":
      return { color: LIGHT, roughness: 0.2, metalness: 0.3, opacity: 1, emissive: LIGHT, emissiveIntensity: night ? 3.2 : 1.1 };
    case "balcony":
      return { color: PAINT, roughness: 0.7, metalness: 0.05, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "stair":
      return { color: "#d9d0c3", roughness: 0.62, metalness: 0.04, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "mep":
      return { color: MEP, roughness: 0.45, metalness: 0.25, opacity: 1, emissive: night ? "#8cb4ff" : "#000", emissiveIntensity: night ? 0.4 : 0 };
    case "beam":
      return { color: "#b9b3a8", roughness: 0.72, metalness: 0.06, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "shaft":
      return { color: "#d5dbe6", roughness: 0.25, metalness: 0.12, opacity: 0.22, emissive: "#000", emissiveIntensity: 0 };
    case "cold":
      return { color: "#2f6bff", roughness: 0.32, metalness: 0.5, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "hot":
      return { color: "#e11d2e", roughness: 0.32, metalness: 0.45, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "drain":
      return { color: "#3f3f46", roughness: 0.4, metalness: 0.3, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "conduit":
      return { color: "#f5c542", roughness: 0.38, metalness: 0.22, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "board":
      return { color: "#f8fafc", roughness: 0.45, metalness: 0.25, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "tile":
      return { color: "#f3e6d0", roughness: 0.42, metalness: 0.06, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "parking":
      return { color: ASPHALT, roughness: 0.95, metalness: 0, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "base":
      return { color: CONCRETE, roughness: 0.9, metalness: 0, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    default:
      return { color: type === "column" ? MEP : CONCRETE, roughness: 0.7, metalness: 0.05, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
  }
}

function lookType(c: BuildingModel["components"][number]) {
  if (c.subtype === "cold" || c.subtype === "hot" || c.subtype === "drain" || c.subtype === "conduit" || c.subtype === "board" || c.subtype === "tile") return c.subtype;
  if (c.type === "beam" || c.type === "shaft" || c.type === "pipe") return c.type === "pipe" ? (c.subtype || "mep") : c.type;
  if (c.category === "mep" && c.type === "column") return "mep";
  if (c.subtype === "trunk") return "trunk";
  if (c.subtype === "crown") return "tree";
  return c.type;
}

const FACADE = new Set(["wall", "window", "door", "frame", "mullion", "band", "canopy"]);

function cutAway(c: BuildingModel["components"][number]) {
  if (c.side === "front" && FACADE.has(c.type)) return true;
  if (c.type === "parapet" && c.position[2] < 0.5) return true;
  if (c.type === "furniture") return true;
  return false;
}

function PartGeometry({ c }: { c: BuildingModel["components"][number] }) {
  const [sx, sy, sz] = c.size;
  const cubic = Math.abs(sx - sy) < 0.12 && Math.abs(sy - sz) < 0.12;
  if (c.type === "tree" && c.subtype === "crown") return <sphereGeometry args={[Math.max(sx, sy, sz) / 2, 18, 14]} />;
  if (c.type === "tree" || c.subtype === "trunk") return <cylinderGeometry args={[sx / 2, sx / 2.3, sy, 8]} />;
  if (c.type === "pipe" || c.subtype === "cold" || c.subtype === "hot" || c.subtype === "drain" || c.subtype === "conduit") {
    return <cylinderGeometry args={[sx / 2, sx / 2, sy, 12]} />;
  }
  if (c.type === "column" && c.category !== "mep") return <cylinderGeometry args={[sx / 2, sx / 2, sy, 8]} />;
  if (c.type === "light" && cubic) return <sphereGeometry args={[Math.max(sx, sz) / 2, 14, 12]} />;
  if (c.type === "light" && sy > sx) return <cylinderGeometry args={[sx / 2, sx / 2.5, sy, 8]} />;
  if (c.type === "railing" && sx <= 0.08 && sz <= 0.08) return <cylinderGeometry args={[sx / 2, sx / 2, sy, 6]} />;
  return <boxGeometry args={c.size} />;
}

function Part({
  c, model, day, explode, night, fourD, bim, selected, wallColor, onSelect,
}: {
  c: BuildingModel["components"][number];
  model: BuildingModel;
  day: Date;
  explode: boolean;
  night: boolean;
  fourD: boolean;
  bim: boolean;
  selected: boolean;
  wallColor: string;
  onSelect: (id: string) => void;
}) {
  const y = c.position[1] + (explode && c.floorIndex >= 0 ? c.floorIndex * 1.8 : 0);
  const p = componentProgress(model, c.activityIds, day);
  const siteAlways = c.category === "site" || ["parking", "light", "tree", "hedge", "step", "canopy", "ground"].includes(c.type);
  const built = !fourD || p === null || p >= 8 || siteAlways;
  const ghost = fourD && p !== null && p < 100 && p >= 8 && !siteAlways;
  const look = appearance(lookType(c), wallColor, night, selected);
  const shell = bim && (c.type === "wall" || c.type === "parapet");
  const opacity = !built ? 0 : shell ? 0.2 : ghost ? Math.max(0.4, (p || 0) / 100) : look.opacity;
  if (!built) return null;
  const glass = c.type === "window" || c.type === "shaft";
  const edged = c.type === "wall" || c.type === "parapet" || c.type === "frame" || c.type === "slab" || c.type === "beam" || c.type === "shaft";

  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(c.id);
  };

  return (
    <mesh
      position={[c.position[0], y, c.position[2]]}
      rotation={c.rotation || [0, 0, 0]}
      castShadow
      receiveShadow
      onClick={click}
    >
      <PartGeometry c={c} />
      {glass ? (
        <meshStandardMaterial
          color={look.color}
          roughness={0.04}
          metalness={0.22}
          transparent
          opacity={opacity}
          emissive={look.emissive}
          emissiveIntensity={look.emissiveIntensity}
          side={DoubleSide}
          depthWrite={false}
        />
      ) : (
        <meshStandardMaterial
          color={look.color}
          roughness={look.roughness}
          metalness={look.metalness}
          transparent={opacity < 0.99}
          opacity={opacity}
          emissive={look.emissive}
          emissiveIntensity={look.emissiveIntensity}
        />
      )}
      {edged && <Edges threshold={22} color={c.type === "shaft" ? "#64748b" : "#9a8466"} />}
    </mesh>
  );
}

function CutawayCamera({ active, model }: { active: boolean; model: BuildingModel }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target: { set: (x: number, y: number, z: number) => void }; update: () => void } | null;
  const was = useRef(false);
  useEffect(() => {
    if (active && !was.current) {
      const { plateWidthM: w, plateDepthM: d, totalHeightM: h } = model.dimensions;
      camera.position.set(w * 0.2, Math.max(4, h * 0.75), -d * 1.45);
      controls?.target.set(w / 2, h * 0.4, d / 2);
      controls?.update();
    }
    was.current = active;
  }, [active, camera, controls, model.dimensions]);
  return null;
}

export function BuildingViewer({ model }: { model: BuildingModel }) {
  const [dayIndex, setDayIndex] = useState(model.timeline ? model.timeline.days - 1 : 0);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [floor, setFloor] = useState<string>("all");
  const [explode, setExplode] = useState(false);
  const [night, setNight] = useState(false);
  const [fourD, setFourD] = useState(false);
  const [bim, setBim] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const wallColor = String(model.spec.wallColor || WALL);

  const day = useMemo(() => {
    if (!model.timeline) return new Date();
    const start = new Date(model.timeline.start).getTime();
    return new Date(start + dayIndex * 86400000);
  }, [model.timeline, dayIndex]);

  const selectedComp = model.components.find((c) => c.id === selected);
  const linked = selectedComp
    ? selectedComp.activityIds.map((id) => model.activities.find((a) => a.id === id)).filter(Boolean)
    : [];

  const lights = model.components.filter((c) => c.type === "light").slice(0, 10);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <Card
        title="3D / 4D building"
        actions={<CalculatedMark title="Coloured architectural massing from the activity plan — not a BIM model" />}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-2">
            Floor
            <select className="rounded border px-2 py-1" value={floor} onChange={(e) => setFloor(e.target.value)}>
              <option value="all">All floors</option>
              {model.towers.flatMap((t) => t.floors.map((f) => (
                <option key={f.id} value={f.name}>{t.name} · {f.name}</option>
              )))}
            </select>
          </label>
          {model.categories.map((c) => (
            <button key={c} onClick={() => setHidden({ ...hidden, [c]: !hidden[c] })} className={`rounded-full px-2 py-0.5 ring-1 ${hidden[c] ? "bg-slate-100 text-slate-400" : "bg-white text-slate-700"}`}>
              {c}
            </button>
          ))}
          <Button variant="ghost" onClick={() => setExplode(!explode)}>{explode ? "Collapse" : "Explode floors"}</Button>
          <Button variant="ghost" onClick={() => setNight(!night)}>{night ? "Day" : "Night"}</Button>
          <Button variant={fourD ? "secondary" : "ghost"} onClick={() => setFourD(!fourD)}>{fourD ? "4D progress on" : "4D progress"}</Button>
          <Button variant={bim ? "secondary" : "ghost"} onClick={() => setBim(!bim)}>{bim ? "Close engineering view" : "Engineering cutaway"}</Button>
        </div>
        <div className={`relative h-[560px] overflow-hidden rounded-lg ${night ? "bg-[#0b1220]" : "bg-gradient-to-b from-sky-200 to-emerald-100"}`}>
          <Canvas shadows camera={{ position: [18, 11, 22], fov: 36 }} onPointerMissed={() => setSelected(null)}>
            <color attach="background" args={[night ? "#0b1220" : "#b9d7f2"]} />
            {!night && <Sky sunPosition={[18, 22, 10]} turbidity={6} rayleigh={0.65} mieCoefficient={0.004} mieDirectionalG={0.8} />}
            <hemisphereLight args={night ? ["#1e293b", "#020617", 0.4] : ["#fff6e0", "#7dae62", 0.95]} />
            <ambientLight intensity={night ? 0.22 : 0.55} />
            <directionalLight
              position={[16, 24, 10]}
              intensity={night ? 0.22 : 1.55}
              castShadow
              shadow-mapSize-width={2048}
              shadow-mapSize-height={2048}
            />
            {night && lights.map((l) => (
              <pointLight
                key={`pl-${l.id}`}
                position={[l.position[0], l.position[1] - 0.15, l.position[2]]}
                color="#ffd27a"
                intensity={10}
                distance={8}
                decay={2}
              />
            ))}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[model.dimensions.plateWidthM / 2, -0.03, model.dimensions.plateDepthM / 2]} receiveShadow>
              <planeGeometry args={[140, 140]} />
              <meshStandardMaterial color={night ? "#152414" : GRASS} roughness={1} />
            </mesh>
            <CutawayCamera active={bim} model={model} />
            <Bounds fit observe={!bim} margin={1.25}>
              <group>
                {model.components.map((c) => {
                  if (hidden[c.category]) return null;
                  if (c.engineering && !bim) return null;
                  if (bim && cutAway(c)) return null;
                  if (floor !== "all" && c.floorName && c.floorName !== floor) return null;
                  return (
                    <Part
                      key={c.id}
                      c={c}
                      model={model}
                      day={day}
                      explode={explode}
                      night={night}
                      fourD={fourD}
                      bim={bim}
                      selected={selected === c.id}
                      wallColor={wallColor}
                      onSelect={setSelected}
                    />
                  );
                })}
              </group>
            </Bounds>
            <ContactShadows position={[0, 0, 0]} opacity={0.28} scale={90} blur={2.2} far={22} />
            <OrbitControls makeDefault minDistance={6} maxDistance={90} maxPolarAngle={Math.PI / 2.08} />
          </Canvas>
          {bim && (
            <div className="absolute left-3 top-3 rounded-md border border-slate-300 bg-white/95 px-3 py-2 text-[11px] text-slate-700 shadow">
              <div className="mb-1 font-semibold tracking-wide">SERVICES</div>
              <div><span className="mr-1 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: "#2f6bff" }} /> Cold water</div>
              <div><span className="mr-1 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: "#e11d2e" }} /> Hot water</div>
              <div><span className="mr-1 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: "#3f3f46" }} /> Drainage</div>
              <div><span className="mr-1 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: "#f5c542" }} /> Electrical conduit</div>
            </div>
          )}
        </div>
        {model.timeline && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs text-slate-500">
              <span>{fmtDate(model.timeline.start, true)}</span>
              <span className="font-medium text-slate-800">{fmtDate(day.toISOString(), true)}</span>
              <span>{fmtDate(model.timeline.end, true)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(0, model.timeline.days - 1)}
              value={dayIndex}
              onChange={(e) => { setDayIndex(Number(e.target.value)); setFourD(true); }}
              className="w-full"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Default view is the finished coloured building (walls, glass, ceiling lights). Turn on 4D progress to ghost work that is not yet reported on the selected date.
            </p>
          </div>
        )}
        <p className="mt-3 text-[11px] text-slate-400">{model.disclaimer}</p>
      </Card>

      <div className="space-y-3">
        <Card title="Digital twin">
          {!selectedComp ? <Empty>Click a wall, window, slab or light.</Empty> : (
            <div className="space-y-2 text-sm">
              <div className="font-medium">{selectedComp.label}</div>
              <div className="text-xs text-slate-500">{selectedComp.tower} · {selectedComp.type} · {selectedComp.category}</div>
              {linked.length === 0 ? (
                <p className="text-xs text-slate-500">No activity is linked to this component yet, so progress and resources cannot be shown.</p>
              ) : linked.map((a) => a && (
                <div key={a.id} className="rounded-lg border border-slate-200 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{a.name}</span>
                    <HealthBadge value={a.health} />
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{a.code} · {a.responsible || "unassigned"}</div>
                  <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
                    <div>Planned {a.plannedProgress}%</div>
                    <div>Actual {a.actualProgress}%</div>
                    <div>Plan {fmtDate(a.plannedFinish)}</div>
                    <div>Forecast {fmtDate(a.expectedFinish)}</div>
                    <div>Delay {a.slipDays ? signed(a.slipDays, "d") : "none"}</div>
                    <div>On this date {Math.round(progressAt(a, day))}%</div>
                  </div>
                  {!!a.labour.length && <div className="mt-1 text-xs text-slate-500">Labour: {a.labour.map((l) => `${l.trade} ×${l.count}`).join(", ")}</div>}
                  {!!a.materials.length && <div className="text-xs text-slate-500">Material: {a.materials.map((m) => `${m.name} ${m.quantity}${m.unit ? ` ${m.unit}` : ""}`).join(", ")}</div>}
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Colours">
          <ul className="space-y-1 text-[11px] text-slate-600">
            <li><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: wallColor }} /> Walls — cream plaster</li>
            <li><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: GLASS }} /> Windows — glass, glow at night</li>
            <li><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: LIGHT }} /> Ceiling light fittings</li>
            <li><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: FLOOR }} /> Floor finish</li>
            <li><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: CONCRETE }} /> Columns / slab</li>
            <li><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: "#3f7a32" }} /> Trees / hedges</li>
            <li><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: "#2f3540" }} /> Balcony railings</li>
            <li><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: "#2f6bff" }} /> Cold water — engineering view</li>
            <li><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: "#e11d2e" }} /> Hot water</li>
            <li><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: "#3f3f46" }} /> Drainage</li>
            <li><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: "#f5c542" }} /> Electrical conduit</li>
          </ul>
        </Card>
        <Card title="Model basis">
          <ul className="space-y-1 text-[11px] text-slate-500">
            {Object.entries(model.sources).slice(0, 8).map(([k, v]) => (
              <li key={k}><span className="font-medium text-slate-700">{k}:</span> {v}</li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-1">
            <Badge tone="slate">{model.dimensions.towers} tower(s)</Badge>
            <Badge tone="slate">{model.dimensions.detailedFloors} floors</Badge>
            <Badge tone="slate">{model.dimensions.plateWidthM}×{model.dimensions.plateDepthM} m</Badge>
            <Badge tone="slate">{model.dimensions.totalHeightM} m high</Badge>
          </div>
        </Card>
      </div>
    </div>
  );
}
