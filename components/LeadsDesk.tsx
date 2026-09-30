"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { countryOptions } from "@/lib/countries";
import { defaultCurrency, formatStamp } from "@/lib/money";
import { CURRENCIES } from "@/lib/money";
import { CATALOG } from "@/lib/pricing";
import { ESCALATION, PROGRAMS, REPS, STAGES } from "@/lib/reps";
import { isTrialStage, trialEligibility } from "@/lib/trial";
import type { Channel, Currency, Lead, PlanId, ProgramId, RepName, Stage } from "@/lib/types";
import { TrialBadge } from "./TrialBadge";

const CHANNELS: Channel[] = ["whatsapp", "email", "site", "other"];

const blank = {
  name: "",
  email: "",
  phone: "",
  countryCode: "GB",
  channel: "whatsapp" as Channel,
  program: "egyptian" as ProgramId,
  planId: "private-30" as PlanId,
  stage: "new" as Stage,
  rep: "" as RepName | "",
  currency: "GBP" as Currency,
  notes: "",
  customerMessage: "",
};

export function LeadsDesk() {
  const countries = countryOptions();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [trialFilter, setTrialFilter] = useState("all");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(blank);
  const [draft, setDraft] = useState<Lead | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const response = await fetch("/api/leads");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load leads.");
    setLeads(data.leads ?? []);
    return data.leads as Lead[];
  }

  useEffect(() => {
    refresh()
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load leads."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const lead = leads.find((item) => item.id === selectedId) ?? null;
    setDraft(lead);
  }, [selectedId, leads]);

  const visible = leads.filter((lead) => {
    const blob = `${lead.name} ${lead.email} ${lead.phone} ${lead.countryCode}`.toLowerCase();
    if (query && !blob.includes(query.toLowerCase())) return false;
    if (stageFilter !== "all" && lead.stage !== stageFilter) return false;
    const decision = trialEligibility(lead.countryCode);
    if (trialFilter === "eligible" && !decision.eligible) return false;
    if (trialFilter === "blocked" && decision.eligible) return false;
    return true;
  });

  async function createLead(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Could not create the lead.");
      return;
    }
    await refresh();
    setSelectedId(data.lead.id);
    setCreating(false);
    setForm(blank);
  }

  async function saveLead(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setError("");
    const response = await fetch(`/api/leads/${draft.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name,
        email: draft.email,
        phone: draft.phone,
        countryCode: draft.countryCode,
        channel: draft.channel,
        program: draft.program,
        planId: draft.planId,
        stage: draft.stage,
        rep: draft.rep,
        currency: draft.currency,
        notes: draft.notes,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Could not save the lead.");
      return;
    }
    await refresh();
  }

  async function escalate() {
    if (!draft) return;
    setError("");
    const response = await fetch(`/api/leads/${draft.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stage: "escalated",
        appendMessage: {
          role: "assistant",
          text: `Escalated to ${ESCALATION.name} ${ESCALATION.phone}.`,
        },
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Could not escalate the lead.");
      return;
    }
    await refresh();
  }

  async function remove() {
    if (!draft) return;
    if (!window.confirm(`Delete ${draft.name}?`)) return;
    const response = await fetch(`/api/leads/${draft.id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json();
      setError(data.error || "Could not delete the lead.");
      return;
    }
    setSelectedId("");
    await refresh();
  }

  const decision = draft ? trialEligibility(draft.countryCode) : null;

  return (
    <div className="page">
      <header className="page-head">
        <p className="kicker">Leads</p>
        <h1>Pipeline</h1>
        <p className="lede">
          Residence decides the trial lesson. Gulf countries AE, SA, KW, QA, BH, and OM stay eligible.
          Africa and the rest of Asia do not.
        </p>
      </header>
      {error ? <p className="error">{error}</p> : null}
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn" type="button" onClick={() => setCreating((value) => !value)}>
          {creating ? "Close form" : "New lead"}
        </button>
        <label className="field grow">
          <span>Search</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, email, phone, country" />
        </label>
        <label className="field">
          <span>Stage</span>
          <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
            <option value="all">All stages</option>
            {STAGES.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Trial</span>
          <select value={trialFilter} onChange={(event) => setTrialFilter(event.target.value)}>
            <option value="all">All residences</option>
            <option value="eligible">Eligible</option>
            <option value="blocked">Not eligible</option>
          </select>
        </label>
      </div>
      {creating ? (
        <form className="panel stack" onSubmit={createLead} style={{ marginBottom: 16 }}>
          <div className="row">
            <Field label="Name" value={form.name} onChange={(name) => setForm({ ...form, name })} />
            <Field label="Email" value={form.email} onChange={(email) => setForm({ ...form, email })} />
            <Field label="Phone" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
          </div>
          <div className="row">
            <CountryField
              value={form.countryCode}
              countries={countries}
              onChange={(countryCode) => setForm({ ...form, countryCode, currency: defaultCurrency(countryCode) })}
            />
            <SelectField label="Channel" value={form.channel} options={CHANNELS.map((item) => ({ id: item, label: item }))} onChange={(channel) => setForm({ ...form, channel: channel as Channel })} />
            <SelectField label="Program" value={form.program} options={PROGRAMS} onChange={(program) => setForm({ ...form, program: program as ProgramId })} />
            <SelectField label="Plan" value={form.planId} options={CATALOG.map((plan) => ({ id: plan.id, label: plan.name }))} onChange={(planId) => setForm({ ...form, planId: planId as PlanId })} />
          </div>
          <div className="row">
            <SelectField label="Stage" value={form.stage} options={STAGES} onChange={(stage) => setForm({ ...form, stage: stage as Stage })} />
            <SelectField label="Rep" value={form.rep} options={[{ id: "", label: "Unassigned" }, ...REPS.map((name) => ({ id: name, label: name }))]} onChange={(rep) => setForm({ ...form, rep: rep as RepName | "" })} />
            <SelectField label="Currency" value={form.currency} options={CURRENCIES.map((code) => ({ id: code, label: code }))} onChange={(currency) => setForm({ ...form, currency: currency as Currency })} />
          </div>
          <label className="field">
            <span>First customer message</span>
            <textarea value={form.customerMessage} onChange={(event) => setForm({ ...form, customerMessage: event.target.value })} />
          </label>
          <button className="btn" type="submit">Save lead</button>
        </form>
      ) : null}
      <div className="split">
        <section className="panel table-wrap">
          {loading ? <p>Loading leads…</p> : null}
          {!loading && visible.length === 0 ? <p className="muted">No leads match these filters.</p> : null}
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Residence</th>
                <th>Trial</th>
                <th>Stage</th>
                <th>Rep</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((lead) => {
                const trial = trialEligibility(lead.countryCode);
                return (
                  <tr key={lead.id} className={lead.id === selectedId ? "selected" : undefined}>
                    <td>
                      <button className="list-btn" type="button" onClick={() => setSelectedId(lead.id)}>
                        <strong>{lead.name}</strong>
                        <div className="muted">{lead.channel}</div>
                      </button>
                    </td>
                    <td>{lead.countryCode}</td>
                    <td>{trial.region === "gulf" ? "Gulf" : trial.eligible ? "Yes" : "No"}</td>
                    <td>{STAGES.find((stage) => stage.id === lead.stage)?.label}</td>
                    <td>{lead.rep || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
        <section className="panel">
          {!draft ? <p className="muted">Select a lead to update residence, stage, or the thread.</p> : null}
          {draft && decision ? (
            <form className="stack" onSubmit={saveLead}>
              <div className="row">
                <h2 style={{ flex: 1 }}>{draft.name}</h2>
                <Link className="btn ghost" href={`/?lead=${draft.id}`}>Open in Assist</Link>
              </div>
              <TrialBadge countryCode={draft.countryCode} />
              <div className="row">
                <Field label="Name" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
                <Field label="Email" value={draft.email} onChange={(email) => setDraft({ ...draft, email })} />
                <Field label="Phone" value={draft.phone} onChange={(phone) => setDraft({ ...draft, phone })} />
              </div>
              <div className="row">
                <CountryField
                  value={draft.countryCode}
                  countries={countries}
                  onChange={(countryCode) => setDraft({ ...draft, countryCode, currency: defaultCurrency(countryCode) })}
                />
                <SelectField label="Program" value={draft.program} options={PROGRAMS} onChange={(program) => setDraft({ ...draft, program: program as ProgramId })} />
                <SelectField label="Plan" value={draft.planId} options={CATALOG.map((plan) => ({ id: plan.id, label: plan.name }))} onChange={(planId) => setDraft({ ...draft, planId: planId as PlanId })} />
              </div>
              <div className="row">
                <label className="field grow">
                  <span>Stage</span>
                  <select
                    value={draft.stage}
                    onChange={(event) => setDraft({ ...draft, stage: event.target.value as Stage })}
                  >
                    {STAGES.map((stage) => (
                      <option key={stage.id} value={stage.id} disabled={!decision.eligible && isTrialStage(stage.id)}>
                        {stage.label}
                      </option>
                    ))}
                  </select>
                </label>
                <SelectField label="Rep" value={draft.rep} options={[{ id: "", label: "Unassigned" }, ...REPS.map((name) => ({ id: name, label: name }))]} onChange={(rep) => setDraft({ ...draft, rep: rep as RepName | "" })} />
                <SelectField label="Currency" value={draft.currency} options={CURRENCIES.map((code) => ({ id: code, label: code }))} onChange={(currency) => setDraft({ ...draft, currency: currency as Currency })} />
              </div>
              <label className="field">
                <span>Notes</span>
                <textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
              </label>
              <div className="thread" aria-label="Messages">
                {draft.messages.map((message) => (
                  <article key={message.id} className="msg">
                    <strong>{message.role}</strong>
                    <div>{message.text}</div>
                    <div className="muted">{formatStamp(message.at)}</div>
                  </article>
                ))}
                {draft.messages.length === 0 ? <p className="muted">No messages yet.</p> : null}
              </div>
              <div className="row">
                <button className="btn" type="submit">Save lead</button>
                <button className="btn ghost" type="button" onClick={() => void escalate()}>
                  Escalate to {ESCALATION.name}
                </button>
                <button className="btn danger" type="button" onClick={() => void remove()}>
                  Delete
                </button>
              </div>
              <p className="muted">Updated {formatStamp(draft.updatedAt)}</p>
            </form>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field grow">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function CountryField({
  value,
  countries,
  onChange,
}: {
  value: string;
  countries: { code: string; name: string }[];
  onChange: (code: string) => void;
}) {
  return (
    <label className="field grow">
      <span>Residence</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {countries.map((country) => (
          <option key={country.code} value={country.code}>
            {country.name} ({country.code})
          </option>
        ))}
      </select>
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="field grow">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.id || "empty"} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
