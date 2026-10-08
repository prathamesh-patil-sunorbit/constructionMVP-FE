"use client";

import { Fragment, useState } from "react";
import type { FoundationType, GeotechEstimate, GeotechFacts, GeotechPhase, SoilLayer } from "@/lib/types";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// Real photos for the equipment that is visually distinctive enough to recognise at a glance.
// Unbranded stock photos (Pexels license: free for commercial use, no attribution required).
// Smaller or look-alike items (rock breaker, bar bending machine, needle vibrator, concrete
// pump) fall back to the line icon below instead of a photo that could be mistaken for another machine.
const EQUIPMENT_PHOTOS: Record<string, string> = {
  JCB: "/equipment/jcb.jpg",
  "Concrete mixer": "/equipment/concrete-mixer.jpg",
  "Transit mixer": "/equipment/transit-mixer.jpg",
  Tipper: "/equipment/tipper.jpg",
  "Plate compactor": "/equipment/plate-compactor.jpg",
  "Dewatering pump": "/equipment/dewatering-pump.jpg",
};
export const equipmentPhoto = (name: string) => EQUIPMENT_PHOTOS[name];

// ---------------------------------------------------------------------------
// Icons (inline, stroke-based so they inherit text colour)
// ---------------------------------------------------------------------------

const ICONS = {
  upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" /></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h5" /></>,
  sparkles: <><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z" /></>,
  calc: <><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h8" /></>,
  check: <><circle cx="12" cy="12" r="10" /><path d="M9 12l2 2 4-4" /></>,
  x: <><circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" /></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  digger: <><path d="M2 19h11v-5H7l-2 3H2z" /><path d="M10 14l3-7 6 2-1 5" /><path d="M18 14l3 2-2 3" /><circle cx="5" cy="20.5" r="1" /><circle cx="10" cy="20.5" r="1" /></>,
  truck: <><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2M15 18H9" /><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14" /><circle cx="17" cy="18" r="2" /><circle cx="7" cy="18" r="2" /></>,
  wrench: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z" />,
  alert: <><path d="M21.73 18l-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z" /><path d="M12 9v4M12 17h.01" /></>,
  info: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>,
  layers: <><path d="M12 2L2 7l10 5 10-5z" /><path d="M2 17l10 5 10-5M2 12l10 5 10-5" /></>,
  droplet: <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />,
  mountain: <path d="M8 3l4 8 5-5 5 15H2z" />,
  gauge: <><path d="M12 14l4-4" /><path d="M3.34 19a10 10 0 1 1 17.32 0" /></>,
  ruler: <><path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0z" /><path d="M14.5 12.5l2-2M11.5 9.5l2-2M8.5 6.5l2-2M17.5 15.5l2-2" /></>,
  foundation: <><path d="M3 21h18M6 21V11h12v10M9 11V5h6v6" /></>,
  brain: <><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18z" /><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18z" /></>,
  retry: <><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></>,
  external: <><path d="M15 3h6v6M10 14L21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" /></>,
  left: <path d="M15 18l-6-6 6-6" />,
  right: <path d="M9 18l6-6-6-6" />,
  clipboard: <><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M9 14l2 2 4-4" /></>,
  clock: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
  flag: <><path d="M4 22V4M4 4h13l-2 4 2 4H4" /></>,
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cx("animate-spin", className)} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Upload dropzone
// ---------------------------------------------------------------------------

const fmtSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function Dropzone({ file, onFile, disabled }: { file: File | null; onFile: (f: File | null) => void; disabled?: boolean }) {
  const [over, setOver] = useState(false);
  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) onFile(e.dataTransfer.files?.[0] || null); }}
      className={cx(
        "flex h-full min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-center transition",
        over ? "border-amber-400 bg-amber-50" : file ? "border-emerald-300 bg-emerald-50/50" : "border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-white",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      <input type="file" accept="application/pdf,image/*" className="sr-only" disabled={disabled} onChange={(e) => onFile(e.target.files?.[0] || null)} />
      {file ? (
        <>
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-white text-red-600 shadow-sm ring-1 ring-slate-200"><Icon name="file" className="h-5 w-5" /></span>
          <span className="max-w-full truncate text-sm font-medium text-slate-800">{file.name}</span>
          <span className="text-xs text-slate-500">{fmtSize(file.size)} · <span className="underline">change file</span></span>
        </>
      ) : (
        <>
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-white text-slate-500 shadow-sm ring-1 ring-slate-200"><Icon name="upload" className="h-5 w-5" /></span>
          <span className="text-sm font-medium text-slate-800">Drop the geotechnical report here</span>
          <span className="text-xs text-slate-500">or <span className="font-medium text-slate-700 underline">browse</span> · PDF or photo, max 12 MB</span>
        </>
      )}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Soil layer view: bore-log column with water table, excavation bottom and foundation
// ---------------------------------------------------------------------------

// Same word rules as the backend classifier, used here only to colour the layers.
const ROCK_RE = /\b(rock|basalt|granite|boulders?|trap|gneiss|quartzite|sandstone|limestone)\b/i;
const WEATHERED_RE = /\b(weathered|disintegrated|fractured|soft rock|sdr|murr?um|moorum)\b/i;
const HARD_RE = /\b(hard|very dense|dense|gravel|gravelly|cemented|stiff)\b/i;
const SOFT_RE = /\b(soft|loose|black cotton|marine clay|peat|silt|silty clay|made ground|fill|filled)\b/i;

const MATERIAL = {
  soft: { fill: "#b9977a", name: "Soft / fill" },
  ordinary: { fill: "#e2c995", name: "Soil" },
  hard: { fill: "#c48b3c", name: "Hard / weathered" },
  rock: { fill: "#5f6b7d", name: "Rock" },
} as const;

function material(description: string) {
  if (ROCK_RE.test(description) && !WEATHERED_RE.test(description)) return MATERIAL.rock;
  if (WEATHERED_RE.test(description) || HARD_RE.test(description)) return MATERIAL.hard;
  if (SOFT_RE.test(description)) return MATERIAL.soft;
  return MATERIAL.ordinary;
}

// Fill gaps in stated depths from the neighbouring layers; flag layers whose depth was not stated.
function placeLayers(layers: SoilLayer[], bottom: number) {
  const n = layers.length;
  return layers.map((l, i) => {
    const prevTo = i > 0 ? layers[i - 1].toDepthM : 0;
    const nextFrom = i < n - 1 ? layers[i + 1].fromDepthM : null;
    // Reports saved before depths were cleaned can hold a misread bottom a fraction of a cm below the top.
    const ownTo = l.toDepthM !== null && l.fromDepthM !== null && l.toDepthM - l.fromDepthM < 0.05 ? null : l.toDepthM;
    const from = l.fromDepthM ?? prevTo ?? (bottom * i) / n;
    const to = ownTo ?? (nextFrom !== null && nextFrom > from ? nextFrom : null) ?? (i === n - 1 ? bottom : (bottom * (i + 1)) / n);
    return { ...l, from: fmtNum(from), to: fmtNum(Math.max(to, from)), stated: l.fromDepthM !== null && ownTo !== null };
  });
}

// Depths are shown to two decimals at most; anything longer is a misread, not precision.
const fmtNum = (d: number) => Math.round(d * 100) / 100;

const TEXTURE: Record<string, string> = {
  "Soft / fill": "tx-soft",
  Soil: "tx-soil",
  "Hard / weathered": "tx-hard",
  Rock: "tx-rock",
};

export function SoilProfile({ facts, depthM, foundation }: { facts: GeotechFacts; depthM: number; foundation?: FoundationType }) {
  const [hi, setHi] = useState<number | null>(null);
  const gw = facts.groundwaterDepthM;
  const lastTo = Math.max(0, ...facts.layers.map((l) => l.toDepthM ?? l.fromDepthM ?? 0));
  const bottom = Math.max(3, lastTo, depthM + 0.75, gw !== null ? gw + 0.5 : 0);
  const layers = placeLayers(facts.layers, lastTo || bottom);
  const used = new Set(layers.map((l) => material(l.description).name));
  // Reports with several boreholes give each layer as a range that overlaps the next one.
  // Stacking those in one column would hide that; draw one bore column per layer instead.
  const ranges = layers.some((l, i) => i > 0 && l.from < layers[i - 1].to - 0.05);

  const W = 560;
  const top = 58;
  const H = 320;
  const colX = 58;
  const colW = W - colX - 18;
  const y = (d: number) => top + (d / bottom) * H;
  const step = bottom > 8 ? 2 : bottom > 4 ? 1 : 0.5;
  const ticks = Array.from({ length: Math.floor(bottom / step) + 1 }, (_, i) => i * step);
  const exY = y(depthM);
  const lane = ranges ? colW / Math.max(1, layers.length) : colW;
  const pitW = colW * 0.34;
  const pitX = colX + (colW - pitW) / 2;
  const wet = gw !== null && gw < depthM;

  const tip = (l: (typeof layers)[number]) =>
    `${l.from}–${l.to} m: ${l.description}${l.sptN !== null ? ` (SPT N ${l.sptN})` : ""}${l.page ? ` · page ${l.page}` : ""}${l.sourceText ? `\nReport: “${l.sourceText}”` : ""}${l.stated ? "" : "\nDepth not stated in the report"}`;

  return (
    <div>
      <div className="overflow-hidden rounded-2xl bg-gradient-to-b from-sky-50 via-white to-amber-50/40 ring-1 ring-slate-200">
        <svg viewBox={`0 0 ${W} ${top + H + 16}`} className="block w-full" role="img" aria-label={`Soil cross-section to ${fmtNum(bottom)} m with excavation at ${depthM} m`}>
          <defs>
            <pattern id="tx-soil" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="2" cy="3" r="0.9" fill="#fff" fillOpacity="0.55" /><circle cx="7" cy="7" r="0.9" fill="#7c5a2a" fillOpacity="0.35" /></pattern>
            <pattern id="tx-soft" width="14" height="8" patternUnits="userSpaceOnUse"><path d="M0 4 Q3.5 0 7 4 T14 4" fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="1.2" /></pattern>
            <pattern id="tx-hard" width="14" height="12" patternUnits="userSpaceOnUse"><circle cx="3.5" cy="3" r="2" fill="#fff" fillOpacity="0.28" /><circle cx="10" cy="8.5" r="2.6" fill="#5b3a0e" fillOpacity="0.28" /><circle cx="11" cy="2" r="0.9" fill="#fff" fillOpacity="0.5" /></pattern>
            <pattern id="tx-rock" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M0 12 L12 0 M-3 3 L3 -3 M9 15 L15 9" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.2" /></pattern>
            <pattern id="unstated" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#fff" strokeOpacity="0.8" strokeWidth="1.5" /></pattern>
            <linearGradient id="shine" x1="0" x2="1"><stop offset="0" stopColor="#000" stopOpacity="0.16" /><stop offset="0.35" stopColor="#fff" stopOpacity="0.2" /><stop offset="1" stopColor="#000" stopOpacity="0.12" /></linearGradient>
            <linearGradient id="water" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#38bdf8" stopOpacity="0.55" /><stop offset="1" stopColor="#0284c7" stopOpacity="0.8" /></linearGradient>
            <clipPath id="strata"><rect x={colX} y={top} width={colW} height={H} rx="14" /></clipPath>
          </defs>

          {/* depth axis */}
          {ticks.map((d) => (
            <g key={d}>
              <text x={colX - 12} y={y(d) + 3.5} textAnchor="end" fontSize="10" className="fill-slate-400">{d} m</text>
              <line x1={colX - 6} x2={colX} y1={y(d)} y2={y(d)} stroke="#cbd5e1" />
            </g>
          ))}

          <g clipPath="url(#strata)">
            <rect x={colX} y={top} width={colW} height={H} fill="#f1f5f9" />
            {!layers.length && <rect x={colX} y={top} width={colW} height={H} fill="#cbd5e1" />}
            {layers.map((l, i) => {
              const m = material(l.description);
              const y1 = y(l.from);
              const h = Math.max(4, y(l.to) - y1);
              const x = ranges ? colX + i * lane : colX;
              const w = ranges ? lane : colW;
              const dim = hi !== null && hi !== i;
              return (
                <g key={i} opacity={dim ? 0.35 : 1} style={{ transition: "opacity .15s" }} onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)}>
                  <title>{tip(l)}</title>
                  <rect x={x} y={y1} width={w} height={h} fill={m.fill} />
                  <rect x={x} y={y1} width={w} height={h} fill={`url(#${TEXTURE[m.name]})`} />
                  {ranges && <rect x={x} y={y1} width={w} height={h} fill="url(#shine)" />}
                  {!l.stated && <rect x={x} y={y1} width={w} height={h} fill="url(#unstated)" opacity="0.5" />}
                  <rect x={x} y={y1} width={w} height={h} fill="none" stroke="#fff" strokeOpacity="0.85" strokeWidth={ranges ? 2 : 1.5} />
                  {(ranges || h > 22) && (
                    <g transform={`translate(${ranges ? x + w / 2 : colX + 18} ${y1 + Math.min(h / 2, 16)})`}>
                      <circle r="9.5" fill="#0f172a" fillOpacity="0.78" stroke="#fff" strokeWidth="1.5" />
                      <text y="3.7" textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">{i + 1}</text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* flooded part of the pit */}
            {wet && <rect x={pitX} y={y(gw)} width={pitW} height={exY - y(gw)} fill="url(#water)" />}
          </g>

          {/* excavation envelope */}
          <path d={`M ${pitX - 10} ${top} L ${pitX + 2} ${exY} L ${pitX + pitW - 2} ${exY} L ${pitX + pitW + 10} ${top}`} fill="#fff" fillOpacity="0.5" stroke="#ef4444" strokeWidth="1.6" strokeDasharray="5 4" strokeLinejoin="round" />
          <Foundation type={foundation} x={pitX} w={pitW} y={exY} />
          <line x1={pitX - 2} x2={pitX + pitW + 2} y1={exY} y2={exY} stroke="#dc2626" strokeWidth="3" strokeLinecap="round" />

          {/* depth dimension */}
          <g stroke="#dc2626" fill="#dc2626">
            <line x1={pitX + pitW + 26} x2={pitX + pitW + 26} y1={top + 4} y2={exY - 4} strokeWidth="1.4" />
            <path d={`M ${pitX + pitW + 26} ${top + 3} l -3.5 7 h 7 z M ${pitX + pitW + 26} ${exY - 3} l -3.5 -7 h 7 z`} stroke="none" />
          </g>
          <rect x={pitX + pitW + 34} y={(top + exY) / 2 - 12} width={74} height={24} rx="12" fill="#fff" stroke="#fca5a5" />
          <text x={pitX + pitW + 71} y={(top + exY) / 2 + 4} textAnchor="middle" fontSize="11" fontWeight="700" className="fill-red-700">dig {depthM} m</text>

          {/* water table */}
          {gw !== null && (
            <g>
              <title>{`Water table at ${gw} m${facts.groundwaterNote ? ` (${facts.groundwaterNote})` : ""}${gw <= depthM ? ` — ${gw < depthM ? "above" : "at"} the excavation bottom: dewatering needed` : ""}`}</title>
              <path d={`M ${colX} ${y(gw)} ${"q 5 -4 10 0 t 10 0 ".repeat(Math.ceil(colW / 20))}`} fill="none" stroke="#0284c7" strokeWidth="2.2" clipPath="url(#strata)" />
              <g transform={`translate(${colX + 8} ${y(gw) - 24})`}>
                <rect width={wet ? 118 : 82} height="19" rx="9.5" fill="#0284c7" />
                <text x={wet ? 59 : 41} y="13" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#fff">{wet ? `💧 Water ${gw} m · pump` : `💧 Water ${gw} m`}</text>
              </g>
            </g>
          )}

          {/* ground surface */}
          <rect x={colX - 4} y={top - 10} width={colW + 8} height="10" rx="5" fill="#65a30d" />
          <rect x={colX - 4} y={top - 10} width={colW + 8} height="4" rx="2" fill="#a3e635" />
          <text x={colX} y={top - 22} fontSize="10" fontWeight="700" letterSpacing="1.5" className="fill-slate-500">GROUND LEVEL · 0 m</text>
          <rect x={colX} y={top} width={colW} height={H} rx="14" fill="none" stroke="#cbd5e1" />
        </svg>
      </div>

      {/* layer cards: one per layer, hover to highlight in the section */}
      <ol className="mt-3 grid gap-2 sm:grid-cols-2">
        {layers.map((l, i) => {
          const m = material(l.description);
          const a = Math.min(100, (l.from / bottom) * 100);
          const b = Math.min(100, (l.to / bottom) * 100);
          return (
            <li
              key={i}
              onMouseEnter={() => setHi(i)}
              onMouseLeave={() => setHi(null)}
              title={tip(l)}
              className={cx("flex gap-3 rounded-xl border bg-white p-2.5 transition", hi === i ? "border-slate-400 shadow-md" : "border-slate-200")}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm font-bold text-white" style={{ background: m.fill }}>{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-slate-800">{l.description}</span>
                <span className="mt-0.5 block text-[11px] text-slate-500">
                  {`${l.from}–${l.to} m`}{l.sptN !== null ? ` · SPT N ${l.sptN}` : ""}{l.page ? ` · p.${l.page}` : ""}{l.stated ? "" : " · depth not stated"}
                </span>
                <span className="mt-1.5 block h-1.5 rounded-full bg-slate-100">
                  <span className="relative block h-full rounded-full" style={{ marginLeft: `${a}%`, width: `${Math.max(3, b - a)}%`, background: m.fill }} />
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
        {Object.values(MATERIAL).filter((m) => used.has(m.name)).map((m) => (
          <span key={m.name} className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 ring-1 ring-slate-200"><span className="h-2.5 w-2.5 rounded-full" style={{ background: m.fill }} />{m.name}</span>
        ))}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-red-700 ring-1 ring-red-200">Excavation envelope</span>
        {gw !== null && <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-sky-700 ring-1 ring-sky-200">Water table</span>}
      </div>
      {ranges && (
        <p className="mt-2 text-xs text-slate-500">
          Depths vary between boreholes, so each numbered column shows the full depth range the report gives for that layer.
        </p>
      )}
      {gw === null && (
        <p className="mt-2 text-xs text-slate-500">Groundwater: {(facts.groundwaterNote || "not stated in the report").replace(/\.+$/, "")}.</p>
      )}
    </div>
  );
}

function Foundation({ type, x, w, y }: { type?: FoundationType; x: number; w: number; y: number }) {
  if (!type) return null;
  const concrete = "#1e293b";
  if (type === "raft") {
    return <rect x={x + 6} y={y - 10} width={w - 12} height={10} rx="1.5" fill={concrete}><title>Raft over the plinth area</title></rect>;
  }
  if (type === "pile") {
    return (
      <g>
        <title>Piles: count and length not in the report</title>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={x + w * f} x2={x + w * f} y1={y} y2={y + 56} stroke={concrete} strokeWidth="4" strokeDasharray="3 3" />)}
        <rect x={x + 10} y={y - 8} width={w - 20} height={8} rx="1" fill={concrete} />
      </g>
    );
  }
  return (
    <g>
      <title>Isolated footings on PCC</title>
      {[0.24, 0.76].map((f) => (
        <g key={f}>
          <rect x={x + w * f - 18} y={y - 3} width={36} height={3} fill="#94a3b8" />
          <rect x={x + w * f - 14} y={y - 13} width={28} height={10} rx="1" fill={concrete} />
          <rect x={x + w * f - 3.5} y={y - 36} width={7} height={23} fill={concrete} />
        </g>
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Phase timeline + workers per day (one shared day axis)
// ---------------------------------------------------------------------------

export function PhaseTimeline({ estimate }: { estimate: GeotechEstimate }) {
  const total = Math.max(1, estimate.totals.calendarDays);
  const phases = estimate.phases;
  const pct = (d: number) => `${(d / total) * 100}%`;
  const perDay = Array.from({ length: total }, (_, d) => {
    const p = phases.find((ph) => !ph.insufficientData && d >= ph.startDay && d < ph.endDay);
    return { day: d + 1, phase: p?.name ?? "-", workers: p?.workerTotal ?? 0 };
  });
  const peak = Math.max(1, ...perDay.map((d) => d.workers));
  const peakPhase = perDay.find((d) => d.workers === peak)?.phase;
  // Phase boundaries as ticks, dropping any that would crowd the previous one.
  const ticks = Array.from(new Set([0, ...phases.map((p) => p.endDay)]))
    .filter((d) => d <= total)
    .reduce<number[]>((kept, d) => (kept.length && (d - kept[kept.length - 1]) / total < 0.05 && d !== total ? kept : [...kept, d]), []);
  const grid = "grid grid-cols-[6.5rem_1fr] gap-3 sm:grid-cols-[8rem_1fr]";

  return (
    <div className="space-y-2">
      {phases.map((p, i) => (
        <div key={p.key} className={cx(grid, "items-center")}>
          <span className="flex items-center gap-2 truncate text-sm text-slate-700">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">{i + 1}</span>
            <span className="truncate">{p.name}</span>
          </span>
          <div className="relative h-7 rounded-md bg-slate-50 ring-1 ring-inset ring-slate-100">
            {p.insufficientData ? (
              <span className="absolute inset-y-1 flex items-center rounded border border-dashed border-amber-400 bg-amber-50 px-2 text-[11px] font-medium text-amber-800" style={{ left: pct(p.startDay) }}>
                not estimated
              </span>
            ) : (
              <div
                className="absolute inset-y-1 flex items-center justify-end overflow-hidden rounded bg-slate-800 px-1.5 text-[11px] font-semibold text-white"
                style={{ left: pct(p.startDay), width: `max(1.25rem, calc(${pct(p.days)} - 2px))` }}
                title={`${p.name}: day ${p.startDay + 1}–${p.endDay}, ${p.days} days, ${p.workerTotal} workers`}
              >
                {p.days / total > 0.06 ? `${p.days}d` : ""}
              </div>
            )}
          </div>
        </div>
      ))}

      <div className={cx(grid, "items-end pt-4")}>
        <span className="pb-1 text-xs leading-tight text-slate-500">Workers on site<br /><span className="text-slate-400">peak {peak} · {peakPhase}</span></span>
        <div className="flex h-20 items-end gap-px border-b border-slate-200">
          {perDay.map((d) => (
            <div
              key={d.day}
              className={cx("flex-1 rounded-t-sm transition-colors hover:bg-slate-800", d.workers === peak ? "bg-amber-500" : "bg-slate-300")}
              style={{ height: `${(d.workers / peak) * 100}%` }}
              title={`Day ${d.day}: ${d.phase}, ${d.workers} workers`}
            />
          ))}
        </div>
      </div>
      <div className={grid}>
        <span />
        <div className="relative h-4 text-[10px] tabular-nums text-slate-400">
          {ticks.map((d) => <span key={d} className="absolute -translate-x-1/2" style={{ left: pct(d) }}>{d === total ? `${d} days` : d}</span>)}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase cards
// ---------------------------------------------------------------------------

function Chips({ icon, label, items }: { icon: IconName; label: string; items: { text: string }[] }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-400"><Icon name={icon} className="h-3.5 w-3.5" />{label}</div>
      <div className="flex flex-wrap gap-1">
        {items.length ? items.map((x) => (
          <span key={x.text} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{x.text}</span>
        )) : <span className="text-xs text-slate-400">—</span>}
      </div>
    </div>
  );
}

// A real photo where the machine is visually distinctive enough to show one; a line icon
// otherwise, so nothing is misrepresented as a machine it is not.
const EQUIPMENT_ICON: Record<string, IconName> = { "Rock breaker": "wrench", "Concrete pump": "wrench", "Bar bending machine": "wrench", "Needle vibrator": "wrench" };

export function EquipmentTile({ name, count, kind, size = "md" }: { name: string; count: number; kind: "machine" | "vehicle"; size?: "md" | "sm" }) {
  const photo = equipmentPhoto(name);
  const thumb = (
    <span className={cx("relative shrink-0 place-items-center overflow-hidden rounded-md bg-slate-100 text-slate-400", size === "sm" ? "grid h-6 w-6 rounded" : "grid h-9 w-9")}>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <Icon name={EQUIPMENT_ICON[name] || (kind === "vehicle" ? "truck" : "wrench")} className={size === "sm" ? "h-3 w-3" : "h-4 w-4"} />
      )}
      <span className={cx("absolute grid place-items-center rounded-full bg-slate-900 font-bold leading-none text-white", size === "sm" ? "-right-1 -top-1 h-3.5 min-w-3.5 px-0.5 text-[8px]" : "-right-1 -top-1 h-4 min-w-4 px-1 text-[9px]")}>{count}</span>
    </span>
  );
  if (size === "sm") return <span title={`${count} ${name}`}>{thumb}</span>;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white py-1 pl-1 pr-2.5">
      {thumb}
      <span className="text-xs font-medium leading-tight text-slate-700">{name}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Daily work plan: each phase's total split evenly across its days, written as a
// plain-English sentence. This is a guide for sequencing crew and machines, not a
// measured record — actual daily output varies on site.
// ---------------------------------------------------------------------------

const round1 = (n: number) => Math.round(n * 10) / 10;

const PHASE_VERB: Record<string, string> = {
  excavation: "digging out the plinth excavation",
  pcc: "laying the PCC (plain cement concrete) base",
  plinthBeam: "casting the plinth beam",
  backfill: "backfilling and compacting around the foundation",
};

function verbFor(p: GeotechPhase) {
  return PHASE_VERB[p.key] || (p.key === "foundation" ? `casting the ${p.name.toLowerCase()}` : `working on ${p.name.toLowerCase()}`);
}

function dayLine(p: GeotechPhase, dayInPhase: number) {
  const stage = dayInPhase === 1 ? "Starting" : dayInPhase === p.days ? "Finishing" : "Continuing";
  const verb = verbFor(p);
  const q = p.quantity;
  if (!q) return `${stage} ${verb}.`;
  const perDay = q.value / p.days;
  const cumulative = Math.min(q.value, round1(perDay * dayInPhase));
  const pct = Math.min(100, Math.round((dayInPhase / p.days) * 100));
  return `${stage} ${verb} — about ${round1(perDay)} ${q.unit} today (${cumulative} of ${q.value} ${q.unit} done, ${pct}%).`;
}

export function DailyWorkPlan({ phases }: { phases: GeotechPhase[] }) {
  return (
    <div className="max-h-[34rem] overflow-y-auto rounded-xl border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2 font-medium">Day</th>
            <th className="px-3 py-2 font-medium">What happens</th>
            <th className="px-3 py-2 font-medium">Crew on site</th>
            <th className="px-3 py-2 font-medium">Machinery</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {phases.map((p) => {
            if (p.insufficientData) {
              return (
                <tr key={p.key} className="bg-amber-50/60">
                  <td colSpan={4} className="px-3 py-2 text-xs text-amber-800"><span className="font-semibold">{p.name}:</span> {p.reason}</td>
                </tr>
              );
            }
            const equipment = [
              ...p.machines.map((m) => ({ ...m, kind: "machine" as const })),
              ...p.vehicles.map((v) => ({ ...v, kind: "vehicle" as const })),
            ];
            return (
              <Fragment key={p.key}>
                <tr className="bg-slate-50">
                  <td colSpan={4} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {p.name} · day {p.startDay + 1}–{p.endDay} · {p.days} day{p.days === 1 ? "" : "s"}
                  </td>
                </tr>
                {Array.from({ length: p.days }, (_, i) => i + 1).map((d) => (
                  <tr key={d} className="align-top">
                    <td className="px-3 py-2 font-medium tabular-nums text-slate-700">{p.startDay + d}</td>
                    <td className="px-3 py-2 text-slate-700">{dayLine(p, d)}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{p.workers.map((w) => `${w.count} ${w.trade}`).join(", ") || "—"}</td>
                    <td className="px-3 py-2">
                      {equipment.length ? (
                        <div className="flex flex-wrap gap-1">
                          {equipment.map((m) => <EquipmentTile key={m.name} name={m.name} count={m.count} kind={m.kind} size="sm" />)}
                        </div>
                      ) : <span className="text-xs text-slate-400">—</span>}
                    </td>
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EquipmentGrid({ icon, label, items, kind }: { icon: IconName; label: string; items: { name: string; count: number }[]; kind: "machine" | "vehicle" }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-400"><Icon name={icon} className="h-3.5 w-3.5" />{label}</div>
      {items.length ? (
        <div className="flex flex-wrap gap-1.5">
          {items.map((x) => <EquipmentTile key={x.name} name={x.name} count={x.count} kind={kind} />)}
        </div>
      ) : <span className="text-xs text-slate-400">—</span>}
    </div>
  );
}

export function PhaseCards({ phases }: { phases: GeotechPhase[] }) {
  return (
    <ol className="space-y-3">
      {phases.map((p, i) => (
        <li key={p.key} className={cx("rounded-xl border p-4", p.insufficientData ? "border-amber-200 bg-amber-50/40" : "border-slate-200 bg-white")}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className={cx("grid h-8 w-8 place-items-center rounded-lg text-sm font-semibold", p.insufficientData ? "bg-amber-100 text-amber-800" : "bg-slate-900 text-white")}>{i + 1}</span>
              <div>
                <div className="font-semibold text-slate-900">{p.name}</div>
                <div className="text-xs text-slate-500">
                  {p.insufficientData ? "Not estimated" : `${p.quantity?.value} ${p.quantity?.unit} ${p.quantity?.label} · day ${p.startDay + 1}–${p.endDay}`}
                </div>
              </div>
            </div>
            {!p.insufficientData && (
              <div className="flex gap-2">
                <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm"><span className="font-semibold tabular-nums">{p.days}</span> <span className="text-slate-500">days</span></span>
                <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm"><span className="font-semibold tabular-nums">{p.workerTotal}</span> <span className="text-slate-500">workers</span></span>
              </div>
            )}
          </div>
          {p.insufficientData ? (
            <p className="mt-3 text-sm text-amber-900">{p.reason}</p>
          ) : (
            <>
              <div className="mt-3 space-y-3">
                <Chips icon="users" label="Crew" items={p.workers.map((w) => ({ text: `${w.count} ${w.trade}` }))} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <EquipmentGrid icon="wrench" label="Machines" items={p.machines} kind="machine" />
                  <EquipmentGrid icon="truck" label="Vehicles" items={p.vehicles} kind="vehicle" />
                </div>
              </div>
              <details className="mt-3 text-xs text-slate-600">
                <summary className="cursor-pointer select-none font-medium text-slate-500 hover:text-slate-900">How this is calculated</summary>
                <ul className="mt-2 space-y-1 rounded-lg bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-slate-600">
                  {p.basis.map((l, j) => <li key={j}>{l}</li>)}
                </ul>
              </details>
            </>
          )}
        </li>
      ))}
    </ol>
  );
}
