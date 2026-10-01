# Learn Arabic Academy sales desk

Standalone Next.js sales desk (Mode A) for Learn Arabic Academy reps. It is not embedded in the marketing site.

Drafts follow `docs/MASTER_AI_SALES_OPERATING_SPEC.md` (the owner operating spec, sections 1–136) plus a Mode A overlay in `lib/prompt.ts`. The overlay outranks any instruction in the spec to send WhatsApp, book a trial, or take payment. Where the spec marks EGP pricing and the exact trial location list as not configured, `get_pricing` (Frankfurter EGP from the USD price) and `check_trial_eligibility` are the configured backends. The model must call those tools and must not invent a rate or a location list.

Reps use **Assist** to draft replies, **Leads** to track the pipeline, and **Admin** to set shifts and inspect the price book. Evolution, Meta, Google, and payments are stubs: the desk acknowledges them and does not call those providers.

## Run

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm test
npm run build
npm start
```

## Environment

| Variable | Purpose |
| --- | --- |
| `XAI_API_KEY` or `GROK_API_KEY` | Grok drafts. `XAI_API_KEY` wins when both are set. |
| `GROK_MODEL` | Default `grok-4.6`. |
| `XAI_BASE_URL` | Default `https://api.x.ai/v1`. |
| `FRANKFURTER_URL` | Daily USD→EGP rate. Default is Frankfurter v2. |
| `EVOLUTION_*`, `META_*`, `GOOGLE_*`, `PAYMENTS_*` | Unused stubs. Leave empty. |

Set `XAI_API_KEY` on Vercel (or `GROK_API_KEY` if that is the name you use) before Assist can write a real draft. Without a key, Assist says Grok is not connected and does not invent a customer reply. If the salesperson asks for a price or a trial decision, it shows only the verified tool facts.

A first customer message is a short WhatsApp welcome and one discovery question. Later turns answer what they just said and ask the one fact still missing: goal, then level, then schedule. Once those three are known, the draft takes one warm next step instead of recapping the profile. A trial can be that next step only when they asked, the rep said discovery is done, or eligibility was checked and the residence is eligible. Prices stay out of that step unless they asked. The draft signs with the selected rep and stays unsigned when no rep is selected. The salesperson note is omitted unless it flags an eligibility gotcha, an escalation, a contradiction, or a blocking gap. If a model draft still leads with a price list, the desk replaces that customer draft before showing it. A slow Grok call has about two and a half minutes before Assist asks the rep to try again.

Leads start empty. Admin has an optional **Load demo data** button. It stays off until someone clicks it. Those samples are not real customers.

## Product rules

### Trial

A free 30-minute live trial is offered when residence is outside Africa and Asia.

Gulf countries stay eligible even though they are in Asia:

`AE` United Arab Emirates, `SA` Saudi Arabia, `KW` Kuwait, `QA` Qatar, `BH` Bahrain, `OM` Oman.

Continents follow UN M49 (Russia in Europe; Turkey, Cyprus, the Caucasus, and Kazakhstan in Asia). Trial stages (`trial offered`, `trial booked`) are rejected when the residence is not eligible.

### Programmes

Egyptian, Levantine, Gulf/Khaliji, MSA, and Quran. Lessons are private 1-to-1. The desk does not quote group classes.

### Pricing

60-minute private packages. 16 sessions is the most popular.

| Sessions | USD | GBP | EUR | AED |
| --- | ---: | ---: | ---: | ---: |
| 4 | 48 | 44 | 44 | 176 |
| 8 | 88 | 80 | 80 | 323 |
| 12 | 120 | 108 | 108 | 441 |
| 16 | 144 | 128 | 128 | 529 |
| 20 | 160 | 140 | 140 | 587 |

30-minute private packages.

| Sessions | USD | GBP | EUR | AED |
| --- | ---: | ---: | ---: | ---: |
| 4 | 28 | 28 | 28 | 103 |
| 8 | 52 | 52 | 52 | 191 |
| 12 | 72 | 72 | 72 | 264 |
| 16 | 88 | 88 | 88 | 323 |
| 20 | 100 | 100 | 100 | 367 |

USD, GBP, EUR, and AED are fixed list prices. AED is not calculated from a peg or a live rate.

**EGP = the USD package price × today’s Frankfurter USD→EGP mid rate.** The rate is cached for the Africa/Cairo calendar day. Frankfurter v1 (ECB) does not list EGP, so the desk calls Frankfurter v2 (`/v2/rates?base=USD&quotes=EGP`). If that call fails, EGP stays blank.

Reps do not invent discounts. Pricing exceptions go to escalation.

### People

- Reps: Asmaa, Rebeb, Kamal, Ram
- Escalation: Islam Yehia, +201093570811

### Shifts and integrations

Shifts start empty. An empty roster is **Configuration required** on the banner and on Admin.

Evolution API, Meta WhatsApp Cloud, Google, and payments expose stub endpoints. A call returns HTTP 501 with `stub: true` and does not send a message or take payment.

## Routes

- `/` Assist chat
- `/leads` pipeline
- `/admin` shifts, roster, stubs, price book
- `POST /api/chat` Grok draft using `get_pricing`, `check_trial_eligibility`, and `get_customer_currency`. Without a key, no customer draft.
- `GET /api/pricing` price book plus the Frankfurter EGP rate
- `GET /api/trial?country=AE` trial decision
- `GET/POST /api/leads`, `PATCH/DELETE /api/leads/:id`
- `GET/POST /api/shifts`, `DELETE /api/shifts/:id`
- `POST /api/integrations/:provider` stub (`evolution`, `meta`, `google`, `payments`)
- `POST /api/admin/demo` optional sample leads, only when an admin clicks Load demo data

Lead storage is `data/desk.json`, created on the first write. A missing file starts with an empty lead list and no shifts. On a read-only serverless disk the desk keeps the file in memory for the life of the instance.

This desk has no login. Put it behind your own access control before exposing it.
