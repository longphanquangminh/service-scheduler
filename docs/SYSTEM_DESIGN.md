# System Design — Unified Service Scheduler

## 1. Context

Scenario A asks for a dealership **appointment scheduler** that:

1. Accepts a booking request (vehicle, service, dealership, time)
2. Checks **service bay** and **qualified technician** availability for the full duration
3. Persists a confirmed **Appointment** record

This submission implements the **frontend** fully and **mocks the backend** with MSW (REST + WebSocket), per the assessment brief.

Extras beyond the minimum MVP (documented assumptions): interactive FullCalendar UX, multi-advisor **pending presence**, OpenTelemetry → Jaeger/console, and **dev disk persistence** via Vite middleware (`.runtime-data/`).

## 2. Architecture diagram

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                           Browser (React SPA)                                 │
│                                                                              │
│  ┌────────────────┐  ┌─────────────────┐  ┌──────────────────────────────┐  │
│  │ FullCalendar   │  │ Booking Panel   │  │ Zustand store                 │  │
│  │ week/day       │◄─┤ form + banner   │◄─┤ appointments, draft, mode     │  │
│  │ pending/edit   │  │ availability    │  │ remotePendings, liveStatus    │  │
│  └───────┬────────┘  └────────┬────────┘  └──────────────▲───────────────┘  │
│          │                    │                           │                  │
│          │             api/client.ts                      │                  │
│          │         (+ OTEL business spans)                │                  │
│          └────────────────────┼───────────────────────────┘                  │
│                               │                                              │
│   useLiveUpdates ◄── WS msgs  │  usePendingPresence ──► publish/clear        │
│   useCrossTabAppointmentSync  │         │                                    │
│                               ▼         ▼                                    │
│                    MSW Service Worker (mock network)                          │
│         ┌─────────────────────┴─────────────────────┐                        │
│         │ REST /api/*          │  WS /ws/appointments │                        │
│         │ create/update/check  │  appointment.*       │                        │
│         │                      │  pending.* relay     │                        │
│         └──────────┬───────────┴──────────┬───────────┘                        │
│                    ▼                      ▼                                   │
│              MockDb (memory)      presence publish                             │
│                    │              (sessionId, mode, appointmentId?)            │
│                    │                      │                                   │
│                    │    ┌─────────────────┴─────────────────┐                 │
│                    │    │ BroadcastChannel (same-origin     │                 │
│                    │    │ multi-tab; reliable with MSW)     │                 │
│                    │    └─────────────────┬─────────────────┘                 │
│                    │                      │                                   │
│                    └── domain/availability.ts + domain/time.ts (pure rules)   │
│                                                                              │
│  observability/otel.ts ──► OTLP (/otlp proxy) ──► Jaeger  OR  Console exporter │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   │
                     GET/PUT /__runtime/*.json
                     (Vite middleware — npm run dev only)
                                   │
                                   ▼
                     .runtime-data/ (gitignored)
                       ├── appointments.json
                       └── pending.json
```

### How layers talk (short)

| Path | Purpose |
| --- | --- |
| React → `api/client` → MSW REST | Create / update / availability / demo simulate |
| MSW MockDb → WS broadcast | Other tabs get `appointment.created|updated|deleted` |
| Draft → `usePendingPresence` → WS + BroadcastChannel + `pending.json` | Live **pending/editing** presence |
| Calendar | Create = dashed pending ghost; Edit = highlight booked event; Remote edit = highlight same `appointmentId` |
| MockDb persist | Successful writes → `.runtime-data/appointments.json` via `/__runtime` |

## 3. Component roles

| Component | Role |
| --- | --- |
| `SchedulerCalendar` | Week/day grid; drag-select create; click edit; drag/resize; local/remote pending & editing styles |
| `BookingPanel` | Vehicle/service/resources/time; availability banner; confirm / cancel |
| `AppHeader` | Dealership context, New appointment, simulate concurrency, LIVE · WS pill |
| `api/client` | Fetch wrapper; HTTP errors + conflict details; OTEL spans + request/response payload attrs |
| `mocks/db` | Appointment source of truth; enrich views; emit live events; reload/persist runtime JSON |
| `mocks/runtimeApi` | Client for Vite `/__runtime/*.json` middleware |
| `domain/availability` | Pure bay + tech + skills + hours rules (unit-tested) |
| `domain/time` | Min duration, same-day, range validation |
| `domain/presence` | Session id / colors; read/write pending map on disk |
| `useLiveUpdates` | WS client + reconnect; appointments + remote pending into store |
| `usePendingPresence` | Publish/clear local draft presence when create/edit panel is open |
| `useCrossTabAppointmentSync` | Refresh calendar when another tab writes `appointments.json` |
| `lib/liveSocket` | Bind WS socket; BroadcastChannel pending events |
| `observability/*` | OTEL provider, tracing helpers, span payload sanitization |

## 4. Data flow

### Create booking

1. User **drag-selects** an empty slot (or New appointment) → `mode: create` + draft range  
2. Calendar shows a **pending selection** event (dashed); presence published to other tabs  
3. Debounced `POST /api/availability/check` → panel OK / conflicts + recommended bay/tech  
4. Confirm → `POST /api/appointments` (server re-checks; 409 on conflict)  
5. MockDb persists to memory + `.runtime-data/appointments.json` + broadcasts `appointment.created`  
6. Creator updates via HTTP; other clients via WebSocket; pending presence cleared  

### Edit booked appointment

1. Click a booked event → `mode: edit` + draft bound to `appointmentId`  
2. Calendar **highlights that event** (no second pending ghost); remote tabs highlight the same id  
3. Drag/resize while editing updates the draft only; Save → `PATCH` with availability re-check  
4. On close/save, pending presence for that session is cleared  

### Reschedule without opening the panel

1. Drag/resize a confirmed event while panel is closed  
2. `PATCH /api/appointments/:id` with `excludeAppointmentId` so it does not conflict with itself  
3. On failure, UI reverts and shows a toast  

### Live concurrency & pending presence

1. **Simulate other advisor** → demo REST → MockDb create → WS `appointment.created`  
2. Second tab creating → remote **pending** box on calendar  
3. Second tab editing → remote **editing** style on the shared booked event (`appointmentId` in presence payload)  
4. Cross-tab: BroadcastChannel + runtime JSON back the MSW WS mock for same-origin reliability; new tabs hydrate remote pending from `pending.json` on mount (atomic PATCH merge so refresh cannot clobber another session)  

## 5. Technology choices

| Choice | Why |
| --- | --- |
| Vite + React + TS | Fast FE DX; strong typing for domain rules |
| FullCalendar | Mature timegrid + drag/resize without reinventing geometry |
| MSW | Realistic network boundary; same app code can later point at a real API |
| MSW WebSocket | Multi-advisor live occupancy + pending relay without a real WS server |
| BroadcastChannel | Reliable same-origin multi-tab presence when MSW WS cross-tab broadcast is flaky |
| Vite `/__runtime` middleware | Dev-only disk persistence (`.runtime-data/`) for appointments + pending |
| Zustand | Small UI store for draft / availability / remotePendings / toasts |
| OpenTelemetry Web SDK | Challenge observability strategy with Jaeger UI or console fallback |
| Vitest on pure domain | Fast, deterministic tests of core business rules |

## 6. Scalability, reliability, maintainability

- **Scalability (design direction):** real backend would shard by `dealershipId`, index appointments by `(bayId, start/end)` and `(technicianId, start/end)`, and use optimistic concurrency / row locks on write. Presence would be Redis/pub-sub instead of BroadcastChannel + JSON files.
- **Reliability:** availability checked twice (UI preview + write path). WS reconnect with backoff; REST + runtime file remain sources of truth on refresh. Pending presence is best-effort UX, not a lock server.
- **Maintainability:** domain rules isolated from React/MSW so BE can reuse the same algorithm later.
- **Performance:** calendar week is a bounded query; debounce availability checks; MSW artificial latency (~180–220ms) to exercise loading UX.

## 7. Observability strategy **and implementation**

The challenge asks for an observability *strategy*. This FE demo uses the **official OpenTelemetry Web SDK** ([sdk-trace-web](https://www.npmjs.com/package/@opentelemetry/sdk-trace-web)).

### Strategy

| Signal | Approach |
| --- | --- |
| Tracing | `@opentelemetry/sdk-trace-web` |
| Default export | OTLP HTTP → Vite `/otlp` proxy → Jaeger (`npm run jaeger:up`) |
| Fallback | `VITE_OTEL_EXPORTER=console` → DevTools (no Docker / no `:4318`) |
| Business spans | Manual: `availability.check`, `booking.*`, `calendar.reschedule`, `ws.*` |
| Payload attrs | Sanitized request/response body + headers on API spans (`spanPayload.ts`) |
| Fetch auto-instrumentation | **Disabled** — patches `fetch` and breaks MSW |

### What is implemented

| Piece | Location |
| --- | --- |
| Tracer provider | `src/observability/otel.ts` |
| Span helpers | `src/observability/tracing.ts` |
| Payload helpers | `src/observability/spanPayload.ts` |
| API spans | `src/api/client.ts` |
| Optional Jaeger | `docker-compose.yml` + Vite `/otlp` proxy |

### Run with Jaeger (default OTLP)

```bash
npm run jaeger:up
npm run dev
# http://localhost:16686 → service unified-service-scheduler
```

### Run without Docker

```bash
VITE_OTEL_EXPORTER=console npm run dev
# interact → DevTools Console shows exported spans
```

## 8. Security notes (future)

- AuthN/AuthZ per dealership (advisors cannot book across tenants)
- Audit trail on create/update/cancel
- Rate-limit availability checks
- Validate duration server-side (never trust client-only end times blindly)
- Presence is advisory only — do not treat pending highlight as a hard lock without a real reservation API

## 9. GenAI in the design phase

See `AI_COLLABORATION.md`. GenAI accelerated scaffolding and boilerplate; architecture, domain rules, conflict semantics, Scenario A differentiation (calendar + WS), and verification were directed and reviewed by the author.
