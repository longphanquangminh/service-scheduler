# Unified Service Scheduler

Keyloop Technical Assessment — **Scenario A: The Unified Service Scheduler** (Frontend implementation)

An appointment scheduler for dealership service operations. Advisors book vehicle service appointments against constrained resources (service bays + skilled technicians), with an interactive calendar, mocked REST APIs (MSW), live updates over a mocked WebSocket channel, and OpenTelemetry tracing (Jaeger or console).

---

## Prerequisites

- **Node.js** 20+ (npm comes with it)
- Optional: **Docker Desktop** — only if you want Jaeger UI for OpenTelemetry traces

---

## Install

```bash
cd service-scheduler
npm install
```

---

## Run (development)

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

> Vite and the MSW WebSocket mock are pinned to **port 5173** (`strictPort: true`). If the port is busy, free it or update `src/mocks/wsUrl.ts` and `vite.config.ts` together.

### Optional: Jaeger (OpenTelemetry UI)

```bash
npm run jaeger:up    # Docker: UI :16686, OTLP :4318
npm run dev
```

Then book / drag / check availability → open [http://localhost:16686](http://localhost:16686) → search service `unified-service-scheduler`.

If Docker is off, avoid OTLP proxy spam:

```bash
# bash / Git Bash
VITE_OTEL_EXPORTER=console npm run dev

# PowerShell
$env:VITE_OTEL_EXPORTER="console"; npm run dev
```

Or put `VITE_OTEL_EXPORTER=console` in `.env` and restart `npm run dev`.

Stop Jaeger:

```bash
npm run jaeger:down
```

---

## Test

```bash
npm test              # run once (Vitest)
npm run test:watch    # watch mode
```

Coverage focus: pure domain rules in `src/domain/availability.ts` and `src/domain/time.ts` (bay/tech overlap, skills, business hours, min duration, same-day rules).

---

## Build & preview

```bash
npm run build     # tsc -b && vite build → dist/
npm run preview   # serve the production build locally
npm run lint      # oxlint
```

**Deploy note:** static hosting of `dist/` works for the UI + MSW demo. Disk persistence under `.runtime-data/` requires the Vite dev middleware (`npm run dev`); it is not available on plain static hosts.

---

## Scripts reference

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite + MSW + runtime JSON middleware |
| `npm test` | Unit tests |
| `npm run test:watch` | Vitest watch |
| `npm run build` | Typecheck + production bundle |
| `npm run preview` | Preview production build |
| `npm run lint` | Oxlint |
| `npm run jaeger:up` / `jaeger:down` | Jaeger all-in-one via Docker Compose |

---

## What this delivers (challenge mapping)

| Challenge requirement | How it is covered |
| --- | --- |
| Resource-constrained booking | Book vehicle + service type + dealership + time; bay + technician assigned |
| Real-time availability check | `POST /api/availability/check` before confirm; UI blocks unsafe confirms |
| Confirmed appointment record | `POST /api/appointments` persists (dev: `.runtime-data/appointments.json`) and appears on the calendar |
| Frontend + mocked backend | Full UX in React; REST + WS mocked with **MSW** |
| Tests for core business logic | Vitest on availability + time rules |
| Observability strategy | OpenTelemetry Web SDK → Jaeger (OTLP) or console exporter |
| AI collaboration narrative | **Dedicated section below** (also summarized in `docs/AI_COLLABORATION.md`) |
| System design | `docs/SYSTEM_DESIGN.md` |

---

## Interactive calendar

Built with **FullCalendar** (`timeGridWeek` / `timeGridDay`):

- **Drag-select** empty time → pending selection (min 30 minutes) → booking panel
- **New appointment** → panel with a sensible default window
- **Drag / resize** events → reschedule (availability re-checked; revert on conflict)
- **Click** a booked event → edit mode highlights that event (no duplicate “pending” ghost)
- **Multi-tab presence**: another advisor’s create shows as a remote pending box; their **edit** highlights the same booked slot
- **Simulate other advisor** → live insert over mocked WebSocket
- **Mobile**: horizontal scroll when the week grid is wider than the viewport

---

## Mock backend (MSW)

### REST

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/dealership` | Dealership metadata + hours |
| GET | `/api/vehicles` | Vehicles / customers |
| GET | `/api/service-types` | Services + durations + required skills |
| GET | `/api/bays` | Service bays |
| GET | `/api/technicians` | Technicians + skills |
| GET | `/api/appointments` | Appointments in range |
| POST | `/api/availability/check` | Bay + tech availability for full duration |
| POST | `/api/appointments` | Create (409 if unavailable) |
| PATCH | `/api/appointments/:id` | Reschedule / reassign |
| DELETE | `/api/appointments/:id` | Cancel |
| POST | `/api/demo/simulate-other-user` | Demo concurrent booking |

### WebSocket

- Endpoint: `ws://localhost:5173/ws/appointments`
- Events: `connected`, `appointment.*`, `pending.updated` / `pending.cleared` / `pending.snapshot`
- Same-origin multi-tab pending also uses **BroadcastChannel** (reliable with MSW mocks)

### Dev persistence

Successful writes persist under **`.runtime-data/`** (gitignored):

- `appointments.json`
- `pending.json`

Served via Vite middleware `GET/PUT /__runtime/*.json`.

---

## Assumed domain rules (documented)

1. Single demo dealership (District 7), Mon–Fri, **08:00–17:00** `Asia/Ho_Chi_Minh`
2. A booking needs **one free bay** and **one free technician** for the **entire** service duration
3. Technicians must have all `requiredSkills` for the service type
4. Free-length booking window with a **30-minute minimum**; no cross-day bookings
5. Seed data is stable for demos/screenshots
6. WebSocket justifies concurrent multi-advisor occupancy sync; polling would be the fallback

---

## Project structure

```
service-scheduler/
  src/
    api/              # fetch client + OTEL spans
    components/       # calendar, booking panel, chrome
    data/             # seed catalog + appointments
    domain/           # types, availability, time, presence
    hooks/            # bootstrap, availability, live WS, pending presence
    lib/              # live socket / presence publish
    mocks/            # MSW handlers, MockDb, runtime API helpers
    observability/    # OpenTelemetry init + tracing helpers
    store/            # Zustand UI state
  docs/
    SYSTEM_DESIGN.md
    FLOW.md
    THINKING.md
    AI_COLLABORATION.md
  .runtime-data/      # gitignored — written at runtime in dev
  docker-compose.yml  # Jaeger all-in-one
```

---

## Tech stack

- Vite + React 19 + TypeScript
- FullCalendar (timegrid + interaction)
- MSW (REST + WebSocket)
- Zustand
- date-fns
- Vitest
- OpenTelemetry (`sdk-trace-web` + OTLP HTTP / console)

---

## Observability (OpenTelemetry → Jaeger UI)

Uses [`@opentelemetry/sdk-trace-web`](https://www.npmjs.com/package/@opentelemetry/sdk-trace-web).

- **Default:** OTLP → Vite proxy `/otlp` → Jaeger `:4318`
- **Fallback:** `VITE_OTEL_EXPORTER=console`
- **No** `FetchInstrumentation` (it broke MSW); spans are created manually in `api/client.ts` and related flows

Details: `docs/SYSTEM_DESIGN.md`.

---

## AI Collaboration Narrative

> Dedicated write-up also lives in [`docs/AI_COLLABORATION.md`](./docs/AI_COLLABORATION.md) (full Markdown). Optional HTML for easier browser reading: [`../AI_COLLABORATION.html`](../AI_COLLABORATION.html).

### High-level strategy

I treated AI as a **collaborator under human direction**, not as the owner of product decisions.

1. **Understand the brief and my constraints first** — read the Keyloop coding challenge PDF, my resume, and the SWE JD; map which Scenario fit a frontend-strong profile and what “implement one service layer” actually means (choose FE *or* BE, mock the other). **I chose Scenario A** because it supports a competitive calendar + WebSocket realtime demo (inspired by Google Calendar / meeting-room booking at work → mapped to service bays), instead of plain table CRUD like many other candidates.
2. **Reduce ambiguity before writing production code** — ask clarifying questions (FE vs BE, WebSocket necessity, calendar competitiveness), build lightweight HTML demos to visualize keywords/UX for all four scenarios, then lock Scenario A + stack choices.
3. **Generate against acceptance criteria** — scaffold and fill boilerplate only after rules, stack, and MVP scope were confirmed.
4. **Keep core logic human-owned and testable** — pure domain modules + Vitest; UI/scaffolding may be AI-assisted, conflict semantics must not be.
5. **Refine in tight loops** — when output was wrong or incomplete (observability, OTEL vs MSW, pending UX, multi-tab sync), re-specify expected behavior and verify again.

### Process (how this project was guided)

**1. Orientation & scoping — why Scenario A**

I compared Scenarios A–D against time and a frontend-strong profile. I chose **A (Unified Service Scheduler)** deliberately, not by default:

- **Differentiator:** it lets me demonstrate **calendar interaction** (Google Calendar–style week grid, drag-select, drag/resize) and a **justifiable WebSocket realtime demo** (other advisors’ bookings / pending presence appear live) in a way that still fits the challenge.
- **Inspiration:** at my company we use Google Calendar–like UX to book meeting rooms. Scenario A maps cleanly: room → **service bay**, meeting → **vehicle service appointment**, conflict → bay/tech unavailable for the full duration.
- **Competitive edge vs other candidates:** Scenarios B/C lean toward filterable tables + CRUD without a natural realtime/calendar story; D’s interesting part is often backend aggregation. A is where I can show **resource-constrained scheduling UX + live sync**, not just another CRUD admin screen.

Also clarified early:

- “Real-time availability” in the brief = **check-before-confirm over mock HTTP**, not a mandatory multi-user live product.
- WebSocket remains **optional but justifiable** for concurrent advisor calendar sync — documented as an assumption and implemented as an extra that strengthens the demo.

**2. Keyword / UX demos before full implementation**

- Built standalone HTML demos (`demos/`) for all four scenarios so I could literally *see* inventory vs leads vs scheduler vs documents.
- Later consolidated a Vietnamese explanation hub (`demo-2/index.html`) covering challenge structure, FE checklist, and coverage gaps — so assessment structure stayed visible while iterating.

**3. Explicit stack confirmation (avoid rebuilds)**

Before scaffolding the real app, I confirmed:

| Decision | Choice | Why |
| --- | --- | --- |
| App stack | Vite + React + TypeScript | Fast FE delivery, MSW-friendly |
| Calendar | FullCalendar timegrid + interaction | Week view, drag-select, drag/resize without reinventing a grid |
| Mock backend | MSW (REST + WS) | Browser-native mock that matches “FE layer + mocked BE” |
| State | Zustand | Small UI store without Redux ceremony |
| Tests | Vitest on pure domain | Challenge-grade business rules, independent of React |

Custom `@dnd-kit` calendar was considered; FullCalendar was chosen to ship a credible Google Calendar–style demo inside assessment time.

**4. Implementation waves**

- Wave 1: scaffold, seed data, availability engine + tests, MSW REST/WS, calendar + booking panel, English docs.
- Wave 2: UX polish (min duration, pending selection, same-day constraints, cross-tab concerns).
- Wave 3: observability — first a custom panel, then replaced with **real OpenTelemetry** + Jaeger after researching how FE tracing is actually shown.
- Wave 4: fix OTEL/`FetchInstrumentation` vs MSW breakage; add payload attributes on spans; console exporter when Docker is offline.
- Wave 5: multi-advisor **pending presence**; fix edit UX (highlight selected booking instead of a duplicate pending box, including remote tabs); persist successful writes to **`.runtime-data/*.json`** via Vite middleware (gitignored).

### How I verified and refined AI output

| Layer | What I checked |
| --- | --- |
| Domain | `npm test` after every availability/time change |
| Build | `npm run build` before considering a slice “done” |
| Calendar UX | Manual: create, conflict, drag revert, edit highlight, remote pending/edit |
| Live path | Simulate other advisor + second browser tab for presence |
| Observability | Traces in Jaeger UI, or console when `VITE_OTEL_EXPORTER=console` |
| Regression | When AI broke MSW (HTML/JSON parse errors, proxy `ECONNREFUSED`), I isolated root cause (fetch auto-instrumentation / exporter target) and constrained the solution |

Refinement examples I insisted on after reviewing AI drafts:

- Preference / auto-assign loops in availability UI → simplify check → recommend → re-check.
- Pending ghost beside a booked event in **edit** mode → style the selected event instead.
- Remote edit spawning a second box → publish `appointmentId` and highlight that event on other tabs.
- Cross-tab pending relying only on flaky MSW WS broadcast → BroadcastChannel + runtime file sync as reliable same-origin path.
- “Observability strategy only in docs” → implement OTEL end-to-end, then document exporter trade-offs.

### How final quality was ensured

- **Acceptance criteria over novelty** — calendar and WS only where they strengthen Scenario A; assumptions written in README + system design.
- **Separation of concerns** — pure domain vs React vs MSW vs observability.
- **Human ownership of conflict semantics** — bay + technician for full duration, skills, hours, double-check on write.
- **Demo reliability** — fixed port for WS, seed data, Jaeger optional, console exporter documented.
- **Disclosure** — AI accelerated scaffolding, handlers, wiring, and first-pass docs; I owned requirements interpretation, tech choices, verification, and the final call on what ships.

### Prompt patterns that worked

- “Confirm stack/scope with me before coding so we do not rebuild.”
- “Implement against these acceptance criteria; do not invent X.”
- “Keep availability pure and unit-testable.”
- “Mock backend with MSW including conflict payloads and WebSocket events.”
- “Fix this UX bug: edit must highlight the booked slot, not spawn a pending ghost.”
- “Document assumptions and AI collaboration in English for reviewers.”

---

## Documentation index

- [System Design](./docs/SYSTEM_DESIGN.md)
- [User & data flows](./docs/FLOW.md)
- [Design thinking & trade-offs](./docs/THINKING.md)
- [AI collaboration narrative](./docs/AI_COLLABORATION.md)

---

## Video walkthrough tips

1. Drag-select empty slot → availability OK → Confirm booking  
2. Conflicted slot / resources → blocked confirm  
3. Drag an event onto a busy window → toast + revert  
4. Click a booked event → **editing highlight** on that event  
5. Open a second tab → show remote create pending / remote edit highlight  
6. **Simulate other advisor** → LIVE pill + event via WebSocket  
7. (Optional) Jaeger: show spans for availability + booking  
