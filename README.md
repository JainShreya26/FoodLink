<div align="center">

# 🥫 FoodLink

**Food banks waste food they can't move and run short on food someone nearby has spare. FoodLink is the missing link between them.**

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white)](https://prisma.io)
[![Claude](https://img.shields.io/badge/Claude-Opus%205-D97757?logo=anthropic&logoColor=white)](https://claude.com)

</div>

---

## The problem

A food bank warehouse runs on three questions, and today all three are answered by someone walking the aisles with a clipboard:

1. **What do we actually have?** Donations arrive as emails, texts, and scribbled delivery notes. Getting them into a spreadsheet is manual, so the spreadsheet is always stale.
2. **What will we have on Thursday?** Stock on the shelf is not the same as stock you can promise. A USDA drop lands Thursday; a mobile pantry takes 200 lbs on Wednesday.
3. **Who nearby has what we need?** Two food banks 12 miles apart routinely throw out surplus while the other turns families away — because neither can see the other.

FoodLink answers all three in one app.

---

## What it does

| | |
|---|---|
| 📥 **Ingest anything** | Paste a donation email, type a rough note, or photograph a delivery slip. Claude structures it into line items you review before saving. |
| 📦 **Inventory with memory** | Every change writes an append-only event. "What happened to those 200 lbs?" is always answerable. Removals are soft, so history never dangles. |
| 📈 **Projection, not just stock** | `on hand + inbound − outbound` over a horizon you choose. Set a par level and "short" starts to mean something. Expired stock is counted separately from expiring — one needs pulling, the other needs moving. |
| 🗺️ **Network board** | Surplus and shortages from nearby food banks, plotted on a map and filtered by radius. Your own postings live on their own page, where the replies are the point. |
| 💬 **Negotiate and commit** | A thread per request. Agree a quantity, book a handover time, then complete — which moves the food on both sides' books and stays reversible. |
| 🚚 **Driver check-ins** | One-tap SMS link a parked driver can answer with a thumb. Consent is recorded per driver, and nothing sends without it. |
| 🎙️ **Talk to your inventory** | Ask out loud and hear the answer back. Hands-free mode keeps the conversation going while your hands are on a pallet. |

---

## Quick start

```bash
git clone https://github.com/JainShreya26/FoodLink.git
cd FoodLink
npm install
cp .env.example .env.local     # add your Anthropic API key
npx prisma migrate dev
npx tsx prisma/seed.ts
npm run dev
```

Open <http://localhost:3000> and sign in with **`admin` / `admin123`**.

> Each sign-in drops you into a *different* food bank from the seeded network, so you can log out and back in to watch the same trade from the other side of the table.

### Environment

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Powers ingestion and the inventory chat |
| `NEXT_PUBLIC_MAP_STYLE` | no | Swap the map tiles for Mapbox or self-hosted Protomaps |
| `FOODLINK_SMS_ENABLED` | no | Set to `1` to actually send driver texts |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | no | SMS provider credentials |

**Messages are logged, not sent, by default.** A real text needs all three of: the flag on, provider credentials present, *and* `driverConsent` recorded against that delivery. FCC rules put automated messages to mobiles under TCPA, so consent is captured per driver and is auditable — see [`lib/notify.ts`](lib/notify.ts).

---

## Architecture

```
app/
  page.tsx                 Inventory — the home screen
  projection/              What we'll have once deliveries land
  board/                   The network's surplus & shortages
  postings/                Your own flags, and who replied
  chat/                    Ask your inventory anything (voice or text)
  requests/[id]/           One negotiation thread
  checkin/[token]/         Driver's one-tap page — no account needed
  api/                     Route handlers; all DB access lives here

lib/
  projection.ts            on hand + inbound − outbound, and what "short" means
  requests.ts              Transfer direction and the derived request stage
  inventory-queries.ts     Typed tools the model calls — never model-written SQL
  notify.ts                Outbound SMS, consent-gated
  use-voice.ts             Browser speech in and out

prisma/
  schema.prisma            9 models; events are append-only
  seed.ts                  A 9-bank network with live trades in flight
```

### Decisions worth knowing

**The model never writes SQL.** It calls typed, parameterised tools with Zod-validated arguments ([`lib/inventory-queries.ts`](lib/inventory-queries.ts)). Every tool is scoped to the signed-in food bank, so a prompt injection cannot reach another bank's stock. The lookups it performed are shown in the UI under each answer.

**Request stage is derived, not stored.** `TALKING → AGREED → SCHEDULED → DONE` is computed from the fields it summarises, so a status badge can never disagree with the quantity and date beside it.

**Voice runs on-device.** Speech recognition and synthesis use the browser's own engines — no audio leaves the building, no per-minute cost, no added latency on a warehouse tablet. In voice mode the model writes its answer twice: once as markdown for the eye, once as two or three plain sentences for the ear, because a table read aloud is unusable.

**Transfers are reversible.** Completing a request writes inventory events on both sides rather than mutating a number, so "reverse this transfer" is a real operation and not a data-loss apology.

---

## Development

```bash
npm run dev          # dev server
npm run build        # production build
npm run lint         # eslint
npx tsc --noEmit     # typecheck
npx tsx prisma/seed.ts   # re-seed (idempotent — safe to re-run)
```

The seed is additive and keyed on natural identifiers, so running it against an existing database enriches it rather than duplicating or wiping it.

---

## Status

Built for the AISCO hackathon. The check-in ladder's second rung — an automated voice call — is deliberately unbuilt; `CheckIn.channel` already carries `VOICE` so it can slot in. The Twilio send path is written but has never run against real credentials, and says so in the code.
