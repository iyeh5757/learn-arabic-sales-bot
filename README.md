# Learn Arabic Academy sales desk

Standalone Next.js sales desk (Mode A) for Learn Arabic Academy reps. It is not embedded in the marketing site.

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

Without a Grok key, Assist still answers from the local rule desk and labels the reply as a local draft.

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
- `POST /api/chat` Grok or local draft
- `GET /api/pricing` price book plus the Frankfurter EGP rate
- `GET /api/trial?country=AE` trial decision
- `GET/POST /api/leads`, `PATCH/DELETE /api/leads/:id`
- `GET/POST /api/shifts`, `DELETE /api/shifts/:id`
- `POST /api/integrations/:provider` stub (`evolution`, `meta`, `google`, `payments`)

Lead storage is `data/desk.json`, created on the first write. Seed leads load when that file is missing. On a read-only serverless disk the desk keeps the file in memory for the life of the instance.

This desk has no login. Put it behind your own access control before exposing it.
