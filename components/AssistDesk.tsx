"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { countryOptions } from "@/lib/countries";
import { detectEscalation } from "@/lib/escalate";
import { CURRENCIES, formatMoney } from "@/lib/money";
import type { PriceBook } from "@/lib/pricing";
import { CATALOG } from "@/lib/pricing";
import { ESCALATION, PROGRAMS, REPS } from "@/lib/reps";
import type { Currency, Lead, PlanId, ProgramId, RepName } from "@/lib/types";
import { TrialBadge } from "./TrialBadge";

type UiTurn = {
  role: "user" | "assistant";
  content: string;
  source?: "grok" | "local";
  model?: string | null;
  grokError?: string;
};

const PROMPTS = [
  "Draft a reply to the customer.",
  "Are they eligible for a trial lesson?",
  "Quote the selected plan.",
  "Who should I escalate to?",
];

export function AssistDesk() {
  const params = useSearchParams();
  const countries = countryOptions();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadId, setLeadId] = useState("");
  const [countryCode, setCountryCode] = useState("GB");
  const [rep, setRep] = useState<RepName | "">("Asmaa");
  const [currency, setCurrency] = useState<Currency>("GBP");
  const [program, setProgram] = useState<ProgramId>("egyptian");
  const [planId, setPlanId] = useState<PlanId>("private-30");
  const [customerName, setCustomerName] = useState("");
  const [customerMessage, setCustomerMessage] = useState("");
  const [book, setBook] = useState<PriceBook | null>(null);
  const [turns, setTurns] = useState<UiTurn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const applied = useRef("");
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/leads")
      .then((response) => response.json())
      .then((data: { leads?: Lead[] }) => setLeads(data.leads ?? []))
      .catch(() => setError("Could not load leads."));
    fetch("/api/pricing")
      .then((response) => response.json())
      .then((data: PriceBook) => setBook(data))
      .catch(() => setBook(null));
  }, []);

  useEffect(() => {
    const id = params.get("lead");
    if (id) setLeadId(id);
  }, [params]);

  useEffect(() => {
    if (!leadId || applied.current === leadId) return;
    const lead = leads.find((item) => item.id === leadId);
    if (!lead) return;
    applied.current = leadId;
    setCountryCode(lead.countryCode);
    setRep(lead.rep);
    setCurrency(lead.currency);
    setProgram(lead.program);
    setPlanId(lead.planId);
    setCustomerName(lead.name);
    const lastCustomer = [...lead.messages].reverse().find((message) => message.role === "customer");
    setCustomerMessage(lastCustomer?.text ?? "");
    setTurns([]);
  }, [leadId, leads]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [turns, pending]);

  const escalation = detectEscalation(customerMessage);
  const selected = book?.plans.find((plan) => plan.id === planId);
  const amount = selected?.prices[currency];

  async function send(text: string) {
    const content = text.trim();
    if (!content || pending) return;
    const nextTurns = [...turns, { role: "user" as const, content }];
    setTurns(nextTurns);
    setInput("");
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextTurns.map((turn) => ({ role: turn.role, content: turn.content })),
          customerName,
          customerMessage,
          countryCode,
          rep,
          currency,
          program,
          planId,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Draft failed.");
      setTurns((current) => [
        ...current,
        {
          role: "assistant",
          content: data.message,
          source: data.source,
          model: data.model,
          grokError: data.grokError,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Draft failed.");
    } finally {
      setPending(false);
    }
  }

  async function saveDraft() {
    const last = [...turns].reverse().find((turn) => turn.role === "assistant");
    if (!leadId || !last) return;
    setNotice("");
    setError("");
    const response = await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appendMessage: { role: "assistant", text: last.content } }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Could not save the draft.");
      return;
    }
    setNotice("Draft saved on the lead.");
  }

  async function copyDraft() {
    const last = [...turns].reverse().find((turn) => turn.role === "assistant");
    if (!last) return;
    await navigator.clipboard.writeText(last.content);
    setNotice("Draft copied.");
  }

  return (
    <div className="page">
      <header className="page-head">
        <p className="kicker">Assist</p>
        <h1>Draft the next reply</h1>
        <p className="lede">
          Chat with the desk. Grok writes the draft when XAI_API_KEY or GROK_API_KEY is set.
          Trial, list prices, and escalation stay in the answer.
        </p>
      </header>
      <div className="assist-grid">
        <section className="panel" aria-label="Assist chat">
          <div className="chat-log" ref={logRef} aria-live="polite">
            {turns.length === 0 ? (
              <p className="muted">
                Ask for a customer draft, a trial check, or a quote. The residence country decides the trial lesson.
              </p>
            ) : null}
            {turns.map((turn, index) => (
              <article key={`${turn.role}-${index}`} className={`bubble ${turn.role}`}>
                {turn.content}
                {turn.role === "assistant" ? (
                  <p className="meta">
                    {turn.source === "grok"
                      ? `Drafted by Grok${turn.model ? ` · ${turn.model}` : ""}`
                      : "Local draft. Set XAI_API_KEY or GROK_API_KEY for Grok."}
                    {turn.grokError ? ` Grok error: ${turn.grokError}` : ""}
                  </p>
                ) : null}
              </article>
            ))}
            {pending ? <p className="muted">Drafting…</p> : null}
          </div>
          <div className="chips">
            {PROMPTS.map((prompt) => (
              <button key={prompt} type="button" onClick={() => send(prompt)} disabled={pending}>
                {prompt}
              </button>
            ))}
          </div>
          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
          >
            <label className="field">
              <span>Message to the desk</span>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send(input);
                  }
                }}
                placeholder="Ask about this lead, or say “Draft a reply”."
              />
            </label>
            <div className="row">
              <button className="btn" type="submit" disabled={pending || !input.trim()}>
                Send
              </button>
              <button className="btn ghost" type="button" onClick={() => void copyDraft()} disabled={!turns.some((turn) => turn.role === "assistant")}>
                Copy draft
              </button>
              <button className="btn ghost" type="button" onClick={() => void saveDraft()} disabled={!leadId || !turns.some((turn) => turn.role === "assistant")}>
                Save draft to lead
              </button>
            </div>
          </form>
          {error ? <p className="error">{error}</p> : null}
          {notice ? <p className="muted">{notice}</p> : null}
        </section>
        <aside className="panel stack">
          <label className="field">
            <span>Lead</span>
            <select
              value={leadId}
              onChange={(event) => {
                applied.current = "";
                setLeadId(event.target.value);
              }}
            >
              <option value="">No lead selected</option>
              {leads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.name} · {lead.countryCode}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Customer name</span>
            <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
          </label>
          <label className="field">
            <span>Residence</span>
            <select value={countryCode} onChange={(event) => setCountryCode(event.target.value)}>
              {countries.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name} ({country.code})
                </option>
              ))}
            </select>
          </label>
          <TrialBadge countryCode={countryCode} />
          <div className="row">
            <label className="field grow">
              <span>Rep</span>
              <select value={rep} onChange={(event) => setRep(event.target.value as RepName | "")}>
                <option value="">Unassigned</option>
                {REPS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field grow">
              <span>Currency</span>
              <select value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}>
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span>Program</span>
            <select value={program} onChange={(event) => setProgram(event.target.value as ProgramId)}>
              {PROGRAMS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Plan</span>
            <select value={planId} onChange={(event) => setPlanId(event.target.value as PlanId)}>
              {CATALOG.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
          </label>
          <p>
            <strong>
              {amount == null ? `${currency} unavailable` : formatMoney(amount, currency)}
            </strong>
            <span className="muted"> · {selected?.name ?? "Plan"}</span>
          </p>
          <label className="field">
            <span>Latest customer message</span>
            <textarea value={customerMessage} onChange={(event) => setCustomerMessage(event.target.value)} />
          </label>
          {escalation.required ? (
            <p className="error">
              Escalation: {escalation.reasons.join(", ")}. Hand off to {ESCALATION.name} on {ESCALATION.phone}.
            </p>
          ) : (
            <p className="muted">
              Escalation contact is {ESCALATION.name}, {ESCALATION.phone}.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
