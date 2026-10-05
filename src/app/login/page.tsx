"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, homeFor } from "@/lib/auth";
import { Button, ErrorBox, Field, Input } from "@/components/ui";

const DEMO = [
  { email: "engineer@krisala.test", label: "Site Engineer (Rahul)" },
  { email: "sm@krisala.test", label: "Site Manager (Amit)" },
  { email: "pm@krisala.test", label: "Project Manager (Priya)" },
  { email: "planning@krisala.test", label: "Planning (Neha)" },
  { email: "estimation@krisala.test", label: "Estimation (Vikram)" },
  { email: "admin@krisala.test", label: "Admin" },
];

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("engineer@krisala.test");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await login(email, password);
      router.replace(homeFor(user));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-xs font-semibold uppercase tracking-widest text-amber-600">Krisala</div>
          <h1 className="text-2xl font-semibold">Construction Intelligence</h1>
          <p className="mt-1 text-sm text-slate-500">Plan → Actual → Blocker → Impact → Early Warning</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          <Field label="Password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
          <ErrorBox message={error} />
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
          <div className="border-t border-slate-100 pt-3">
            <div className="mb-2 text-xs text-slate-500">Demo accounts (password: password123)</div>
            <div className="grid grid-cols-2 gap-2">
              {DEMO.map((d) => (
                <button type="button" key={d.email} onClick={() => setEmail(d.email)} className={`rounded-lg border px-2 py-1.5 text-left text-xs ${email === d.email ? "border-slate-800 bg-slate-50" : "border-slate-200 hover:bg-slate-50"}`}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
