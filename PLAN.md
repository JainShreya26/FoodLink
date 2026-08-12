# FoodLink — Simplified Food Bank Network App

A clean rebuild. Two features, nothing else:

1. **AI Inventory** — throw any unstructured data at it (email text, photo of a delivery note, CSV, voice-note transcript, pasted list), an AI agent structures it into inventory records, and a chatbot answers any question about the inventory.
2. **Surplus / Shortage Board** — a food bank flags "we have too much X" or "we're short on Y". Other food banks see the flag, click **Request**, and the two sides chat right there in the app to arrange the transfer.

That's the whole app.

---

## 1. Core idea (one paragraph)

Food banks drown in messy data (donation emails, handwritten pallets lists, spreadsheets in ten formats) and have no easy way to rebalance stock between each other. FoodLink fixes both with one loop: **messy input → AI structures it → live inventory → surplus/shortage flags → other banks request → chat → transfer → inventory updates.**

---

## 2. Users & roles

| Role | What they do |
|---|---|
| Food Bank Staff | Belongs to one food bank. Adds inventory (any format), asks the chatbot questions, posts flags, requests other banks' flags, chats. |

No admin role, no beneficiary role, no auth complexity. For the demo: a simple "pick your food bank" login (dropdown + name). Seed 3 food banks (e.g., Alameda, Oakland, Berkeley).

---

## 3. The two modules, step by step

### Module A — AI Inventory

**A1. Ingest (the magic moment)**
1. Staff opens **Add Inventory** and pastes text / uploads a file (txt, csv, image) or just types free-form: *"got 40 cases of canned corn from Safeway, expires Dec, and about 200 lbs rice"*.
2. Backend sends the raw content to Claude with a structuring prompt + JSON schema.
3. Claude returns structured items: `[{name, category, quantity, unit, expiry_date?, source?}]`.
4. App shows a **review table** ("Here's what I understood — edit anything") → staff clicks **Confirm**.
5. Rows are saved to the `inventory_items` table, tagged with the food bank.

Key detail: **always show the review step.** It makes the AI trustworthy in a demo and covers extraction mistakes.

**A2. Chatbot (ask anything about inventory)**
1. Staff opens **Chat with Inventory** and asks e.g. *"What expires this week?"*, *"How much protein do we have?"*, *"What did we get from Safeway?"*.
2. Backend runs a Claude agent with one tool: `query_inventory(sql)` (read-only SQL over the inventory table) — Claude writes the query, gets rows back, answers in plain English.
3. Answers render in a chat UI with the data it used (small table under the answer).

This tool-use design means zero hand-built query logic — any question works.

### Module B — Surplus / Shortage Board

**B1. Post a flag**
1. Staff clicks **Post Flag** and fills a simple form:
   - **Food item** — free-typed (e.g., "canned corn", "baby formula")
   - **Type** — `SURPLUS` (we have too much) or `SHORTAGE` (we need this)
   - **Quantity + unit** — how much is available / required
   - **Contact info** — contact name, phone/email so the other bank can reach them
   - **Note** (optional) — "must move by Friday, no refrigeration"
2. Flag appears on the shared **Network Board** visible to all food banks, showing the item, quantity, posting bank, and contact info.

**B2. Browse & request**
1. Any other food bank sees the board: cards showing *"Alameda: SURPLUS — 300 lbs rice"* / *"Berkeley: SHORTAGE — baby formula"*.
2. They click **Request** on a surplus (meaning "we'll take it") or **Offer** on a shortage (meaning "we can supply it") — both create a `request` linking the two banks.

**B3. Chat & close**
1. A request opens a **chat thread** between the two food banks (plain human-to-human messages: "Can you pick up Thursday?" "Yes, sending a van at 2pm").
2. Either side clicks **Mark Complete** with the final quantity transferred.
3. On complete: the app decrements the sender's inventory and increments the receiver's (auto-creating the item if the receiver doesn't have it). Flag closes when its quantity is exhausted.

---

## 4. Tech stack (deliberately boring)

| Layer | Choice | Why |
|---|---|---|
| App | **Next.js 14 (App Router) + TypeScript** | One codebase, UI + API routes together, fastest to demo |
| DB | **SQLite via Prisma** | Zero setup, file-based, schema migrations for free |
| AI | **Claude API** (`claude-opus-4-8`) | Structuring (structured outputs / JSON schema) + inventory chatbot (tool use) |
| Styling | **Tailwind CSS** | Fast, clean |
| Realtime chat | **Polling every 3s** | No websockets — good enough for a demo, zero infra |

One `ANTHROPIC_API_KEY` in `.env`. `npm run dev` and everything works.

---

## 5. Data model (5 tables)

```prisma
model FoodBank {
  id        String   @id @default(cuid())
  name      String
  items     InventoryItem[]
  flags     Flag[]
}

model InventoryItem {
  id          String    @id @default(cuid())
  foodBankId  String
  name        String        // "Canned corn"
  category    String        // Protein | Grain | Vegetable | Fruit | Dairy | Other
  quantity    Float
  unit        String        // lbs | cases | cans | boxes | each
  expiryDate  DateTime?
  source      String?       // "Safeway donation"
  createdAt   DateTime  @default(now())
}

model Flag {
  id          String   @id @default(cuid())
  foodBankId  String
  type        String       // SURPLUS | SHORTAGE
  itemName    String       // free-typed by the user
  quantity    Float
  unit        String
  contactName String       // who to reach about this flag
  contactInfo String       // phone or email
  note        String?
  status      String   @default("OPEN")   // OPEN | CLOSED
  createdAt   DateTime @default(now())
  requests    Request[]
}

model Request {
  id              String   @id @default(cuid())
  flagId          String
  requesterBankId String       // the bank responding to the flag
  status          String   @default("OPEN")  // OPEN | COMPLETED | CANCELLED
  finalQuantity   Float?
  messages        Message[]
  createdAt       DateTime @default(now())
}

model Message {
  id         String   @id @default(cuid())
  requestId  String
  senderBankId String
  text       String
  createdAt  DateTime @default(now())
}
```

---

## 6. API routes

| Route | Method | Does |
|---|---|---|
| `/api/ingest` | POST | raw text/file → Claude structuring → returns proposed items (NOT saved) |
| `/api/inventory` | GET / POST | list items for a bank / save confirmed items |
| `/api/inventory/chat` | POST | chatbot: question + bank → Claude agent w/ `query_inventory` tool → answer |
| `/api/flags` | GET / POST | board listing (all banks) / create flag |
| `/api/requests` | POST | create request on a flag |
| `/api/requests/[id]/messages` | GET / POST | chat thread (GET is the 3s poll) |
| `/api/requests/[id]/complete` | POST | mark complete + inventory transfer |

Two Claude prompts total:

**Prompt 1 — Structurer** (used by `/api/ingest`): "You extract food inventory records from arbitrary text/images. Return items matching this schema… normalize units, infer category, parse dates (today is {date}), skip non-food noise." Use a forced tool call so output is always valid JSON. Images (photos of delivery notes) go in as vision content blocks — same prompt.

**Prompt 2 — Inventory analyst** (used by `/api/inventory/chat`): "You answer questions about a food bank's inventory. Use the `query_inventory` tool (SQLite, read-only, table `InventoryItem`, scoped to this bank). Today is {date}." Agent loop: question → Claude writes SQL → execute → Claude answers.

---

## 7. Screens (5 pages)

1. **`/` — Pick food bank** — dropdown of the 3 seeded banks, stores selection in a cookie. (Fake login.)
2. **`/inventory`** — table of items (name, category, qty, expiry with "expiring soon" highlight) + **Add Inventory** button opening the paste/upload → review → confirm flow.
3. **`/chat`** — chatbot over your inventory. Suggested question chips ("What expires this week?", "Totals by category").
4. **`/board`** — the network board. All open flags as cards (surplus green, shortage amber), filter by type/category, **Post Flag** button, **Request/Offer** button on others' cards.
5. **`/requests`** — your active requests (both directions). Click one → chat thread + **Mark Complete**.

Top nav: Inventory · Chat · Board · Requests · (bank name switcher).

---

## 8. Build order

| Phase | What | Output |
|---|---|---|
| **0. Skeleton** (~30 min) | `create-next-app`, Prisma + SQLite, schema, seed script (3 banks, ~15 items each), nav + bank picker | App boots, inventory table renders seeded data |
| **1. AI ingest** (~2 h) | `/api/ingest` + structuring prompt, Add Inventory UI with review table, save flow. Text first, then image upload | Paste messy text → structured rows in DB |
| **2. Inventory chatbot** (~1.5 h) | `/api/inventory/chat` agent with SQL tool, chat UI | Ask anything, get grounded answers |
| **3. Board** (~1.5 h) | Flags CRUD, board page, post-flag form (with "flag from inventory" shortcut) | All banks see each other's flags |
| **4. Requests + chat** (~1.5 h) | Request creation, message thread w/ polling, complete → inventory transfer | Full loop works end to end |
| **5. Polish** (~1 h) | Expiring-soon highlights, empty states, demo seed data that tells a story | Demo-ready |

Total: about one focused day.

---

## 9. Demo script (3 minutes)

1. **Login as Alameda.** Paste a messy donation email → AI structures 6 items → confirm → they're in inventory. *(wow #1)*
2. **Ask the chatbot** "what expires in the next 2 weeks?" → instant grounded answer. *(wow #2)*
3. Chatbot said you have 300 lbs rice you can't move → **post SURPLUS flag** from inventory.
4. **Switch to Berkeley** (bank switcher). See Alameda's rice on the board → **Request** → chat: "Can we pick up Friday?"
5. Switch back to Alameda, reply, **Mark Complete 300 lbs** → show rice left Alameda's inventory and appeared in Berkeley's. *(wow #3 — the loop closes)*

---

## 10. Explicitly OUT of scope

- Real auth / user accounts
- Nutrition scoring, forecasting, routing, maps
- Notifications, email, websockets
- Beneficiary-facing anything
- Multi-org admin, permissions
- Docker, deployment (localhost demo)

If it's not in sections 3–7, we don't build it.
