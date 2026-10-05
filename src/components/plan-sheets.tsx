"use client";

import { useEffect, useState } from "react";
import { Card } from "./ui";

const SHEETS = [
  { src: "/city-life/exterior.png", title: "City Life exterior", note: "Coloured tower, dark podium and retail" },
  { src: "/city-life/typical-floor.jpg", title: "Typical floor plan", note: "10 flats along the 1.50 m corridor" },
  { src: "/city-life/refuge-floor.jpg", title: "Refuge floor plan", note: "Floors 4, 9, 14 and 19" },
  { src: "/city-life/3bhk.jpg", title: "3 BHK", note: "878 sq.ft carpet" },
  { src: "/city-life/2bhk-convertible.jpg", title: "2 BHK convertible", note: "Same shell as the 3 BHK" },
  { src: "/city-life/2bhk.jpg", title: "2 BHK", note: "709 sq.ft carpet" },
];

export function PlanSheets() {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const sheet = SHEETS[active];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowRight") setActive((i) => (i + 1) % SHEETS.length);
      if (e.key === "ArrowLeft") setActive((i) => (i - 1 + SHEETS.length) % SHEETS.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <Card title="Drawings, as issued" actions={<span className="text-xs text-slate-400">Click the plan for the full sheet</span>}>
      <div className="overflow-hidden rounded-lg bg-slate-100">
        <button type="button" className="block w-full" onClick={() => setOpen(true)} aria-label={`Open ${sheet.title}`}>
          <img src={sheet.src} alt={sheet.title} className="max-h-[520px] w-full object-contain" />
        </button>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {SHEETS.map((item, i) => (
          <button
            key={item.src}
            type="button"
            onClick={() => setActive(i)}
            className={`w-36 shrink-0 overflow-hidden rounded-lg border text-left ${i === active ? "border-slate-900" : "border-slate-200"}`}
          >
            <img src={item.src} alt="" className="h-20 w-full bg-slate-100 object-cover object-center" />
            <div className="px-2 py-1.5">
              <div className="text-xs font-medium text-slate-800">{item.title}</div>
              <div className="text-[10px] text-slate-500">{item.note}</div>
            </div>
          </button>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/90" onMouseDown={() => setOpen(false)}>
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-white" onMouseDown={(e) => e.stopPropagation()}>
            <div>
              <div className="font-medium">{sheet.title}</div>
              <div className="text-xs text-slate-300">{sheet.note}</div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="rounded-lg px-3 py-1.5 text-sm hover:bg-white/10" onClick={() => setActive((i) => (i - 1 + SHEETS.length) % SHEETS.length)}>Previous</button>
              <button type="button" className="rounded-lg px-3 py-1.5 text-sm hover:bg-white/10" onClick={() => setActive((i) => (i + 1) % SHEETS.length)}>Next</button>
              <button type="button" className="rounded-lg px-3 py-1.5 text-sm hover:bg-white/10" onClick={() => setOpen(false)} aria-label="Close">Close</button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-4 pb-6" onMouseDown={(e) => e.stopPropagation()}>
            <img src={sheet.src} alt={sheet.title} className="mx-auto max-w-none" />
          </div>
        </div>
      )}
    </Card>
  );
}
