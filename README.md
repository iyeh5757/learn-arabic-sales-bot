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

### Trial lesson

A live trial lesson is offered when residence is **not** in Africa or Asia.

Gulf countries stay eligible even though they are in Asia:

`AE` United Arab Emirates, `SA` Saudi Arabia, `KW` Kuwait, `QA` Qatar, `BH` Bahrain, `OM` Oman.

The free 10-minute level quiz on [learnarabic08.com](https://www.learnarabic08.com/) is separate and is not blocked by residence. Continents follow UN M49 (Russia in Europe; Turkey, Cyprus, the Caucasus, and Kazakhstan in Asia).

Trial stages (`trial offered`, `trial booked`) are rejected when the residence is not eligible.

### Pricing

| Plan | USD | GBP | EUR | AED |
| --- | ---: | ---: | ---: | ---: |
| Private 30-minute session | 22 | 17 | 20 | 80.80 |
| Private 60-minute session | 48 | 36 | 44 | 176.28 |
| Group class | 15 | 12 | 14 | 55.09 |
| Starter month (4 × 30 min) | 88 | 68 | 80 | 323.18 |
| Standard month (8 × 30 min) | 176 | 136 | 160 | 646.36 |
| Intensive month (12 × 30 min) | 264 | 204 | 240 | 969.54 |

USD amounts follow the public floors on the signup site (private 30 minutes from $22, private 60 minutes from $48, group from $15). Monthly plans are the 30-minute list price times 4, 8, or 12. GBP and EUR are fixed list prices. AED is USD × 3.6725.

**EGP = USD × the daily Frankfurter rate.** Frankfurter v1 (ECB) does not list EGP. The desk calls Frankfurter v2 (`/v2/rates?base=USD&quotes=EGP`) and does not invent a rate if that call fails. Recorded courses and books are not in this price book.

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
