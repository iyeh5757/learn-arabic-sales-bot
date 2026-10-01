"use client";

import { useEffect, useState } from "react";
import type { PriceBook } from "@/lib/pricing";
import { CONFIGURATION_REQUIRED, ESCALATION, REPS, TIMEZONES, WEEKDAYS } from "@/lib/reps";
import type { RepName, Shift, Weekday } from "@/lib/types";
import { PriceTable } from "./PriceTable";
import { notifyShiftsChanged } from "./shifts";

type AdminPayload = {
  grok: { configured: boolean; source: string | null; model: string };
  escalation: { name: string; phone: string };
  reps: string[];
  shifts: Shift[];
  shiftsStatus: string;
  integrations: {
    id: string;
    name: string;
    purpose: string;
    env: string[];
    stub: boolean;
    credentialPresent: boolean;
    message: string;
  }[];
};

export function AdminDesk() {
  const [admin, setAdmin] = useState<AdminPayload | null>(null);
  const [book, setBook] = useState<PriceBook | null>(null);
  const [error, setError] = useState("");
  const [stubOutput, setStubOutput] = useState("");
  const [demoNote, setDemoNote] = useState("");
  const [demoBusy, setDemoBusy] = useState(false);
  const [shift, setShift] = useState({
    rep: "Asmaa" as RepName,
    weekday: "Sunday" as Weekday,
    start: "10:00",
    end: "18:00",
    timezone: "Africa/Cairo",
  });

  async function load() {
    const [adminResponse, priceResponse] = await Promise.all([fetch("/api/admin"), fetch("/api/pricing")]);
    const adminData = await adminResponse.json();
    const priceData = await priceResponse.json();
    if (!adminResponse.ok) throw new Error(adminData.error || "Could not load admin.");
    setAdmin(adminData);
    setBook(priceData);
  }

  useEffect(() => {
    load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load admin."));
  }, []);

  async function addShift(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(shift),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Could not add the shift.");
      return;
    }
    notifyShiftsChanged();
    await load();
  }

  async function removeShift(id: string) {
    setError("");
    const response = await fetch(`/api/shifts/${id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Could not remove the shift.");
      return;
    }
    notifyShiftsChanged();
    await load();
  }

  async function loadDemo() {
    if (!window.confirm("Load sample leads? They are not real customers. The desk stays empty until you confirm.")) {
      return;
    }
    setError("");
    setDemoBusy(true);
    try {
      const response = await fetch("/api/admin/demo", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load demo data.");
      setDemoNote(data.notice || "Sample leads loaded. They are not real customers.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load demo data.");
    } finally {
      setDemoBusy(false);
    }
  }

  async function callStub(provider: string) {
    setError("");
    const response = await fetch(`/api/integrations/${provider}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: "+201000000000", text: "Sample desk ping", amount: 22, currency: "USD" }),
    });
    const data = await response.json();
    setStubOutput(JSON.stringify(data, null, 2));
  }

  return (
    <div className="page">
      <header className="page-head">
        <p className="kicker">Admin</p>
        <h1>Desk configuration</h1>
        <p className="lede">
          Reps are Asmaa, Rebeb, Kamal, and Ram. Escalation is {ESCALATION.name} on {ESCALATION.phone}.
          Evolution, Meta, Google, and payments stay stubbed.
        </p>
      </header>
      {error ? <p className="error">{error}</p> : null}
      <section className="panel stack" style={{ marginBottom: 16 }}>
        <h2>Demo data</h2>
        <p>
          Off by default. Leads start empty because sales do not know the customer yet.
          Sample people are not real customers. Load them only when you want to click through the pipeline.
        </p>
        <div>
          <button className="btn ghost" type="button" onClick={() => void loadDemo()} disabled={demoBusy}>
            Load demo data
          </button>
        </div>
        {demoNote ? <p className="muted">{demoNote}</p> : null}
      </section>
      <div className="admin-grid">
        <section className="panel stack">
          <h2>Shifts</h2>
          {admin?.shiftsStatus === CONFIGURATION_REQUIRED ? (
            <div>
              <h3>{CONFIGURATION_REQUIRED}</h3>
              <p className="muted">No rep shifts are on the desk. Add hours before using the roster for handoff.</p>
            </div>
          ) : (
            <ul className="cards">
              {admin?.shifts.map((item) => (
                <li key={item.id} className="card row">
                  <span>
                    <strong>{item.rep}</strong> · {item.weekday} {item.start}–{item.end} · {item.timezone}
                  </span>
                  <button className="btn ghost" type="button" onClick={() => void removeShift(item.id)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form className="stack" onSubmit={addShift}>
            <div className="row">
              <label className="field grow">
                <span>Rep</span>
                <select value={shift.rep} onChange={(event) => setShift({ ...shift, rep: event.target.value as RepName })}>
                  {REPS.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </label>
              <label className="field grow">
                <span>Weekday</span>
                <select value={shift.weekday} onChange={(event) => setShift({ ...shift, weekday: event.target.value as Weekday })}>
                  {WEEKDAYS.map((day) => (
                    <option key={day} value={day}>{day}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="row">
              <label className="field grow">
                <span>Start</span>
                <input value={shift.start} onChange={(event) => setShift({ ...shift, start: event.target.value })} />
              </label>
              <label className="field grow">
                <span>End</span>
                <input value={shift.end} onChange={(event) => setShift({ ...shift, end: event.target.value })} />
              </label>
              <label className="field grow">
                <span>Timezone</span>
                <select value={shift.timezone} onChange={(event) => setShift({ ...shift, timezone: event.target.value })}>
                  {TIMEZONES.map((zone) => (
                    <option key={zone} value={zone}>{zone}</option>
                  ))}
                </select>
              </label>
            </div>
            <button className="btn" type="submit">Add shift</button>
          </form>
        </section>
        <section className="panel stack">
          <h2>Roster</h2>
          <ul>
            {(admin?.reps ?? REPS).map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
          <p>
            Escalation: <strong>{admin?.escalation.name ?? ESCALATION.name}</strong>{" "}
            <a href={`tel:${ESCALATION.phone}`}>{admin?.escalation.phone ?? ESCALATION.phone}</a>
          </p>
          <h2>Grok</h2>
          {admin ? (
            <p>
              {admin.grok.configured
                ? `Configured via ${admin.grok.source}. Model ${admin.grok.model}.`
                : `Not configured. Assist will not write a customer draft until XAI_API_KEY or GROK_API_KEY is set. Default model ${admin.grok.model}.`}
            </p>
          ) : (
            <p className="muted">Loading configuration…</p>
          )}
          <h2>Integrations</h2>
          <div className="cards">
            {admin?.integrations.map((item) => (
              <article key={item.id} className="card">
                <strong>{item.name}</strong>
                <p className="muted">{item.purpose}</p>
                <p>Stub. {item.credentialPresent ? "A credential env var is present and is still not called." : "Credential env vars are empty."}</p>
                <button className="btn ghost" type="button" onClick={() => void callStub(item.id)}>
                  Call stub
                </button>
              </article>
            ))}
          </div>
          {stubOutput ? <pre className="pre">{stubOutput}</pre> : null}
        </section>
      </div>
      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Price book</h2>
        <p className="lede">
          Private 1-to-1 packages only. USD, GBP, EUR, and AED are the owner list prices.
          The 16 × 60-minute package is the most popular. EGP is the USD package price times today’s Frankfurter USD→EGP mid rate, cached for the Cairo day.
        </p>
        {book ? <PriceTable book={book} /> : <p className="muted">Loading prices…</p>}
      </section>
    </div>
  );
}
