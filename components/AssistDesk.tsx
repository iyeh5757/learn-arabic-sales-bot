"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { countryOptions } from "@/lib/countries";
import { detectEscalation } from "@/lib/escalate";
import { presentReply } from "@/lib/firstReply";
import { CURRENCIES, formatMoney } from "@/lib/money";
import type { PriceBook } from "@/lib/pricing";
import { CATALOG } from "@/lib/pricing";
import { ESCALATION, PROGRAMS, REPS } from "@/lib/reps";
import type { Currency, Lead, PlanId, ProgramId, RepName } from "@/lib/types";
import { TrialBadge } from "./TrialBadge";

type UiTurn = {
  role: "user" | "assistant";
  content: string;
  source?: "grok" | "unconfigured" | "unavailable";
  model?: string | null;
  grokError?: string;
  toolsUsed?: string[];
  retryable?: boolean;
};

const DRAFT_CLIENT_TIMEOUT_MS = 190_000;

function visibleUserText(content: string): string {
  if (!content.startsWith("Draft a short WhatsApp reply")) return content;
  const pasted = content.split("Customer message:\n")[1]?.trim() ?? "";
  if (!pasted || pasted.startsWith("No customer message")) return "Draft a reply";
  return `Draft a reply\n\n${pasted}`;
}

function timeoutMessage(error: unknown): string | null {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "The draft took too long. Nothing was sent. Try again.";
  }
  if (error instanceof Error && /too long|timeout|timed out|aborted/i.test(error.message)) {
    return "The draft took too long. Nothing was sent. Try again.";
  }
  return null;
}

const PROMPTS = [
  {
    label: "Rep note: trial eligibility",
    text: "Internal note only for me, not a customer draft. Is a trial allowed for this residence? Keep the answer in the note to the salesperson.",
  },
  {
    label: "Rep note: price book",
    text: "Internal note only for me, not a customer draft. Show the package prices in the note to the salesperson. Do not write prices into a customer message.",
  },
];

function AssistantDraft({
  turn,
  footer,
  onCopyDraft,
  onCopyNote,
}: {
  turn: UiTurn;
  footer: string;
  onCopyDraft: (text: string) => void;
  onCopyNote: (text: string) => void;
}) {
  const presented = presentReply(turn.content);
  const structured = turn.source === "grok" && (presented.hasDraftHeading || presented.showNote);
  if (!structured) {
    return (
      <article className="bubble assistant">
        {turn.content}
        <p className="meta">
          {footer}
          {turn.grokError ? ` Grok error: ${turn.grokError}` : ""}
        </p>
      </article>
    );
  }

  return (
    <article className="draft-result">
      {presented.draft ? (
        <div className="draft-card">
          <div className="draft-card-head">
            <p className="kicker">Draft to copy</p>
            <button className="btn" type="button" onClick={() => onCopyDraft(presented.draft)}>
              Copy draft
            </button>
          </div>
          <div className="draft-body">{presented.draft}</div>
        </div>
      ) : null}
      {presented.showNote ? (
        <aside className="rep-note" aria-label="Internal note for the salesperson">
          <div className="rep-note-head">
            <p className="rep-note-kicker">Internal only · not for the customer</p>
            <button className="btn ghost" type="button" onClick={() => onCopyNote(presented.note)}>
              Copy note
            </button>
          </div>
          <p>{presented.note}</p>
        </aside>
      ) : null}
      <p className="meta">
        {footer}
        {turn.grokError ? ` Grok error: ${turn.grokError}` : ""}
      </p>
    </article>
  );
}

export function AssistDesk() {
  const params = useSearchParams();
  const countries = countryOptions();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadId, setLeadId] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [rep, setRep] = useState<RepName | "">("");
  const [currency, setCurrency] = useState<Currency | "">("");
  const [program, setProgram] = useState<ProgramId | "">("");
  const [planId, setPlanId] = useState<PlanId | "">("");
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");
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
    if (!leadId) {
      applied.current = "";
      return;
    }
    if (applied.current === leadId) return;
    const lead = leads.find((item) => item.id === leadId);
    if (!lead) return;
    applied.current = leadId;
    setCountryCode(lead.countryCode);
    setRep(lead.rep);
    setCurrency(lead.currency);
    setProgram(lead.program);
    setPlanId(lead.planId);
    setCustomerName(lead.name);
    setNotes(lead.notes);
    const lastCustomer = [...lead.messages].reverse().find((message) => message.role === "customer");
    setCustomerMessage(lastCustomer?.text ?? "");
    setTurns([]);
  }, [leadId, leads]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [turns, pending]);

  const escalation = detectEscalation(`${customerMessage}\n${notes}`);
  const selected = planId ? book?.plans.find((plan) => plan.id === planId) : undefined;
  const amount = selected && currency ? selected.prices[currency] : undefined;
  const lastAssistant = [...turns].reverse().find((turn) => turn.role === "assistant");
  const lastCopyText =
    lastAssistant?.source === "grok" ? presentReply(lastAssistant.content).copyText : "";
  const canCopy = Boolean(lastCopyText);

  function contextBody() {
    return {
      customerName,
      customerMessage,
      countryCode,
      rep,
      notes,
      ...(currency ? { currency } : {}),
      ...(program ? { program } : {}),
      ...(planId ? { planId } : {}),
    };
  }

  function draftRequest(): string {
    const paste = customerMessage.trim();
    return [
      "Draft a short WhatsApp reply for me to copy. Do not send it.",
      "If they only said they want to start, welcome them and ask one question about their level or their goal.",
      "",
      paste ? `Customer message:\n${paste}` : "No customer message was pasted.",
    ].join("\n");
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || pending) return;
    const nextTurns = [...turns, { role: "user" as const, content }];
    setTurns(nextTurns);
    setInput("");
    setPending(true);
    setError("");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DRAFT_CLIENT_TIMEOUT_MS);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextTurns.map((turn) => ({ role: turn.role, content: turn.content })),
          ...contextBody(),
        }),
        signal: controller.signal,
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
        source?: UiTurn["source"];
        model?: string | null;
        grokError?: string;
        toolsUsed?: string[];
        retryable?: boolean;
      } | null;
      const platformTimeout = response.status === 502 || response.status === 504;
      if (!response.ok || !data?.message) {
        throw new Error(
          data?.retryable || platformTimeout
            ? "The draft took too long. Nothing was sent. Try again."
            : data?.error || "Draft failed. Try again.",
        );
      }
      setTurns((current) => [
        ...current,
        {
          role: "assistant",
          content: data.message ?? "",
          source: data.source,
          model: data.model,
          grokError: data.grokError,
          toolsUsed: data.toolsUsed,
          retryable: data.retryable,
        },
      ]);
    } catch (err) {
      setError(timeoutMessage(err) ?? (err instanceof Error ? err.message : "Draft failed. Try again."));
    } finally {
      clearTimeout(timer);
      setPending(false);
    }
  }

  async function saveDraft() {
    if (!leadId || !canCopy || !lastAssistant) return;
    setNotice("");
    setError("");
    const response = await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appendMessage: { role: "assistant", text: lastCopyText } }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Could not save the draft.");
      return;
    }
    setNotice("Draft saved on the lead.");
  }

  async function copyText(text: string, message: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setError("");
      setNotice(message);
    } catch {
      setError("Could not copy. Select the draft and copy it manually.");
    }
  }

  function sourceLabel(turn: UiTurn): string {
    if (turn.source === "grok") {
      const tools = turn.toolsUsed?.length ? ` · tools ${turn.toolsUsed.join(", ")}` : "";
      return `Drafted by Grok${turn.model ? ` · ${turn.model}` : ""}${tools}. Copy it yourself. Nothing was sent.`;
    }
    if (turn.source === "unavailable") {
      return turn.retryable
        ? "Nothing was sent. Try the draft again."
        : "Grok did not respond. No customer draft was written.";
    }
    return "Grok is not connected. No customer draft was written.";
  }

  return (
    <div className="page">
      <header className="page-head">
        <p className="kicker">Assist</p>
        <h1>Draft the next reply</h1>
        <p className="lede">
          Paste what the customer wrote. A first reply is a warm welcome and one question.
          Trial and prices wait until they ask, or until you have qualified them. Nothing is sent.
        </p>
      </header>
      <div className="assist-grid">
        <section className="panel" aria-label="Assist chat">
          <div className="chat-log" ref={logRef} aria-live="polite">
            {turns.length === 0 ? (
              <p className="muted">
                Customer context starts empty. Paste their message, then draft with Grok. The first reply should not open with a trial or a price list.
              </p>
            ) : null}
            {turns.map((turn, index) =>
              turn.role === "assistant" ? (
                <AssistantDraft
                  key={`${turn.role}-${index}`}
                  turn={turn}
                  footer={sourceLabel(turn)}
                  onCopyDraft={(text) => void copyText(text, "Draft copied. It was not sent.")}
                  onCopyNote={(text) => void copyText(text, "Internal note copied. It was not sent.")}
                />
              ) : (
                <article key={`${turn.role}-${index}`} className="bubble user">
                  {visibleUserText(turn.content)}
                </article>
              ),
            )}
            {pending ? <p className="muted">Drafting… this can take a minute.</p> : null}
          </div>
          <label className="field">
            <span>Customer message</span>
            <textarea
              value={customerMessage}
              onChange={(event) => setCustomerMessage(event.target.value)}
              placeholder="Paste the customer's message. Leave this blank if you are only checking a fact."
            />
          </label>
          <div className="row">
            <button className="btn" type="button" onClick={() => void send(draftRequest())} disabled={pending}>
              Draft with Grok
            </button>
          </div>
          <div className="chips">
            {PROMPTS.map((prompt) => (
              <button key={prompt.label} type="button" onClick={() => send(prompt.text)} disabled={pending}>
                {prompt.label}
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
              <span>Note to the desk</span>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send(input);
                  }
                }}
                placeholder="Ask Grok something about this conversation."
              />
            </label>
            <div className="row">
              <button className="btn" type="submit" disabled={pending || !input.trim()}>
                Send
              </button>
              <button className="btn ghost" type="button" onClick={() => void copyText(lastCopyText, "Draft copied. It was not sent.")} disabled={!canCopy}>
                Copy draft
              </button>
              <button className="btn ghost" type="button" onClick={() => void saveDraft()} disabled={!leadId || !canCopy}>
                Save draft to lead
              </button>
            </div>
          </form>
          {error ? <p className="error">{error}</p> : null}
          {notice ? <p className="muted">{notice}</p> : null}
        </section>
        <aside className="panel stack">
          <p className="muted">Optional. Leave these blank until the customer tells you.</p>
          <label className="field">
            <span>Lead</span>
            <select
              value={leadId}
              onChange={(event) => {
                const next = event.target.value;
                applied.current = "";
                setLeadId(next);
                if (!next) {
                  setCountryCode("");
                  setRep("");
                  setCurrency("");
                  setProgram("");
                  setPlanId("");
                  setCustomerName("");
                  setNotes("");
                  setCustomerMessage("");
                  setTurns([]);
                }
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
            <span>Name</span>
            <input
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="Optional"
            />
          </label>
          <label className="field">
            <span>Country</span>
            <select value={countryCode} onChange={(event) => setCountryCode(event.target.value)}>
              <option value="">Not set</option>
              {countries.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name} ({country.code})
                </option>
              ))}
            </select>
          </label>
          {countryCode ? (
            <TrialBadge countryCode={countryCode} />
          ) : (
            <p className="muted">Country not set. Trial is not decided.</p>
          )}
          <label className="field">
            <span>Programme</span>
            <select value={program} onChange={(event) => setProgram(event.target.value as ProgramId | "")}>
              <option value="">Not set</option>
              {PROGRAMS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Notes</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional. Only facts you have actually learned."
            />
          </label>
          <div className="row">
            <label className="field grow">
              <span>Rep</span>
              <select value={rep} onChange={(event) => setRep(event.target.value as RepName | "")}>
                <option value="">Not set</option>
                {REPS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field grow">
              <span>Currency</span>
              <select value={currency} onChange={(event) => setCurrency(event.target.value as Currency | "")}>
                <option value="">Not set</option>
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span>Package</span>
            <select value={planId} onChange={(event) => setPlanId(event.target.value as PlanId | "")}>
              <option value="">Not set</option>
              {CATALOG.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
          </label>
          <p>
            {selected && currency ? (
              <>
                <strong>{amount == null ? `${currency} unavailable` : formatMoney(amount, currency)}</strong>
                <span className="muted"> · {selected.name}</span>
              </>
            ) : (
              <span className="muted">No package selected.</span>
            )}
          </p>
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
