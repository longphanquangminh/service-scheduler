# AI Collaboration Narrative

This document describes how generative AI was used on the **Unified Service Scheduler** (Keyloop Scenario A, frontend): strategy, process, verification, and quality ownership.

> Optional easier reading in the browser: [`../../AI_COLLABORATION.html`](../../AI_COLLABORATION.html) (same content, HTML layout). The Markdown here is the source of truth for the repo / submission docs folder.

---

## High-level strategy

I treated AI as a **collaborator under human direction**, not as the owner of product decisions.

1. **Understand the brief and my constraints first** — read the Keyloop coding challenge PDF, my resume, and the SWE JD; map which Scenario fit a frontend-strong profile and what “implement one service layer” actually means (choose FE *or* BE, mock the other). **I chose Scenario A** because it supports a competitive calendar + WebSocket realtime demo (inspired by Google Calendar / meeting-room booking at work → mapped to service bays), instead of plain table CRUD like many other candidates.
2. **Reduce ambiguity before writing production code** — ask clarifying questions (FE vs BE, WebSocket necessity, calendar competitiveness), build lightweight HTML demos to visualize keywords/UX for all four scenarios, then lock Scenario A + stack choices.
3. **Generate against acceptance criteria** — scaffold and fill boilerplate only after rules, stack, and MVP scope were confirmed.
4. **Keep core logic human-owned and testable** — pure domain modules + Vitest; UI/scaffolding may be AI-assisted, conflict semantics must not be.
5. **Refine in tight loops** — when output was wrong or incomplete (observability, OTEL vs MSW, pending UX, multi-tab sync), re-specify expected behavior and verify again.

---

## Process (how this project was guided)

### 1. Orientation & scoping — why Scenario A

I compared Scenarios A–D against time and a frontend-strong profile. I chose **A (Unified Service Scheduler)** deliberately, not by default:

- **Differentiator:** it lets me demonstrate **calendar interaction** (Google Calendar–style week grid, drag-select, drag/resize) and a **justifiable WebSocket realtime demo** (other advisors’ bookings / pending presence appear live) in a way that still fits the challenge.
- **Inspiration:** at my company we use Google Calendar–like UX to book meeting rooms. Scenario A maps cleanly: room → **service bay**, meeting → **vehicle service appointment**, conflict → bay/tech unavailable for the full duration.
- **Competitive edge vs other candidates:** Scenarios B/C lean toward filterable tables + CRUD without a natural realtime/calendar story; D’s interesting part is often backend aggregation. A is where I can show **resource-constrained scheduling UX + live sync**, not just another CRUD admin screen.

Also clarified early:

- “Real-time availability” in the brief = **check-before-confirm over mock HTTP**, not a mandatory multi-user live product.
- WebSocket remains **optional but justifiable** for concurrent advisor calendar sync — documented as an assumption and implemented as an extra that strengthens the demo.

### 2. Keyword / UX demos before full implementation

- Built standalone HTML demos (`demos/`) for all four scenarios so I could literally *see* inventory vs leads vs scheduler vs documents.
- Later consolidated a Vietnamese explanation hub (`demo-2/index.html`) covering challenge structure, FE checklist, and coverage gaps — so assessment structure stayed visible while iterating.

### 3. Explicit stack confirmation (avoid rebuilds)

Before scaffolding the real app, I confirmed:

| Decision | Choice | Why |
| --- | --- | --- |
| App stack | Vite + React + TypeScript | Fast FE delivery, MSW-friendly |
| Calendar | FullCalendar timegrid + interaction | Week view, drag-select, drag/resize without reinventing a grid |
| Mock backend | MSW (REST + WS) | Browser-native mock that matches “FE layer + mocked BE” |
| State | Zustand | Small UI store without Redux ceremony |
| Tests | Vitest on pure domain | Challenge-grade business rules, independent of React |

Custom `@dnd-kit` calendar was considered; FullCalendar was chosen to ship a credible Google Calendar–style demo inside assessment time.

### 4. Implementation waves

- **Wave 1:** scaffold, seed data, availability engine + tests, MSW REST/WS, calendar + booking panel, English docs.
- **Wave 2:** UX polish (min duration, pending selection, same-day constraints, cross-tab concerns).
- **Wave 3:** observability — first a custom panel, then replaced with **real OpenTelemetry** + Jaeger after researching how FE tracing is actually shown.
- **Wave 4:** fix OTEL / `FetchInstrumentation` vs MSW breakage; add payload attributes on spans; console exporter when Docker is offline.
- **Wave 5:** multi-advisor **pending presence**; fix edit UX (highlight selected booking instead of a duplicate pending box, including remote tabs); persist successful writes to **`.runtime-data/*.json`** via Vite middleware (gitignored).

---

## How I verified and refined AI output

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

---

## How final quality was ensured

- **Acceptance criteria over novelty** — calendar and WS only where they strengthen Scenario A; assumptions written in README + system design.
- **Separation of concerns** — pure domain vs React vs MSW vs observability.
- **Human ownership of conflict semantics** — bay + technician for full duration, skills, hours, double-check on write.
- **Demo reliability** — fixed port for WS, seed data, Jaeger optional, console exporter documented.
- **Disclosure** — AI accelerated scaffolding, handlers, wiring, and first-pass docs; I owned requirements interpretation, tech choices, verification, and the final call on what ships.

---

## Prompt patterns that worked

- “Confirm stack/scope with me before coding so we do not rebuild.”
- “Implement against these acceptance criteria; do not invent X.”
- “Keep availability pure and unit-testable.”
- “Mock backend with MSW including conflict payloads and WebSocket events.”
- “Fix this UX bug: edit must highlight the booked slot, not spawn a pending ghost.”
- “Document assumptions and AI collaboration in English for reviewers.”
