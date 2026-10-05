"use client";

import { useRef, useState } from "react";
import { PageHeader } from "@/components/AppShell";
import { api, useApi } from "@/lib/api";
import type { AiStatus, CopilotAnswer, Project } from "@/lib/types";
import { Badge, Button, Card, ErrorBox, Input, Select } from "@/components/ui";
import { AiMark, Basis, SimulationResult } from "@/components/ai";

const SUGGESTIONS = [
  "What is delaying this project?",
  "When will this project finish?",
  "How many labourers do I need next week?",
  "Which activity is on the critical path?",
  "What happens if I add 10 labourers?",
  "What happens if rain stops work for 2 days?",
  "How many JCBs are required?",
  "Which materials are needed next?",
];

interface Turn {
  question: string;
  answer?: CopilotAnswer;
  error?: string;
}

export default function CopilotPage() {
  const { data: projects } = useApi<Project[]>("/projects");
  const { data: status } = useApi<AiStatus>("/ai/status");
  const [projectId, setProjectId] = useState("");
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversation = useRef<string | undefined>(undefined);
  const selected = projectId || projects?.[0]?._id || "";

  const ask = async (q: string) => {
    if (!q.trim() || busy) return;
    setBusy(true);
    setError(null);
    setQuestion("");
    setTurns((t) => [...t, { question: q }]);
    try {
      const answer = await api<CopilotAnswer>("/ai/ask", {
        method: "POST",
        json: { question: q, project: selected, conversation: conversation.current },
      });
      conversation.current = answer.conversationId;
      setTurns((t) => t.map((turn, i) => (i === t.length - 1 ? { ...turn, answer } : turn)));
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      setTurns((t) => t.map((turn, i) => (i === t.length - 1 ? { ...turn, error: message } : turn)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Management Copilot"
        subtitle="Ask about progress, delays, labour, materials or equipment. Answers are drawn from this project's records."
        actions={
          projects && projects.length > 1 ? (
            <Select value={selected} onChange={(e) => setProjectId(e.target.value)} className="max-w-56">
              {projects.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
            </Select>
          ) : null
        }
      />

      {status && !status.configured && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="font-medium">Gemini is not configured,</span> so the copilot can only return the
          calculated figures without a written answer. Set GEMINI_API_KEY in the backend environment to enable it.
        </div>
      )}

      <div className="space-y-4">
        {turns.length === 0 && (
          <Card title="Try asking">
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="rounded-full border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </Card>
        )}

        {turns.map((turn, i) => (
          <div key={i} className="space-y-2">
            <div className="flex justify-end">
              <div className="max-w-2xl rounded-2xl rounded-br-sm bg-slate-900 px-4 py-2 text-sm text-white">{turn.question}</div>
            </div>
            {turn.error && <ErrorBox message={turn.error} />}
            {turn.answer && <AnswerBlock answer={turn.answer} />}
            {!turn.answer && !turn.error && <div className="text-sm text-slate-400">Thinking…</div>}
          </div>
        ))}

        <form onSubmit={(e) => { e.preventDefault(); ask(question); }} className="sticky bottom-4 flex gap-2">
          <Input
            placeholder="Ask about this project…"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="shadow-sm"
            maxLength={1000}
          />
          <Button disabled={busy || !question.trim()}>{busy ? "…" : "Ask"}</Button>
        </form>
        <ErrorBox message={error} />
      </div>
    </>
  );
}

function AnswerBlock({ answer }: { answer: CopilotAnswer }) {
  return (
    <Card
      title={<span className="flex items-center gap-2">Answer <Badge tone="slate">{answer.agent}</Badge></span>}
      actions={answer.aiGenerated ? <AiMark /> : <Badge tone="amber">figures only</Badge>}
    >
      <p className="whitespace-pre-line text-sm text-slate-800">{answer.answer}</p>

      {!!answer.findings?.length && (
        <ul className="mt-3 space-y-1.5">
          {answer.findings.map((f, i) => (
            <li key={i} className="rounded-lg bg-slate-50 p-2 text-sm">
              <span className="font-medium">{f.title}.</span> {f.detail}
              <div className="mt-0.5 text-[11px] text-slate-500">Evidence: {f.evidence}</div>
            </li>
          ))}
        </ul>
      )}

      {!!answer.recommendations?.length && (
        <div className="mt-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recommended</div>
          <ul className="mt-1 space-y-1">
            {answer.recommendations.map((r, i) => (
              <li key={i} className="text-sm"><span className="font-medium">{r.action}</span><span className="text-slate-500"> — {r.rationale}</span></li>
            ))}
          </ul>
        </div>
      )}

      {answer.simulation && <div className="mt-3"><SimulationResult data={answer.simulation} /></div>}

      <Basis lines={answer.sources} label="Records used" />

      {!!answer.followUps?.length && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {answer.followUps.map((f) => <Badge key={f} tone="blue">{f}</Badge>)}
        </div>
      )}
    </Card>
  );
}
