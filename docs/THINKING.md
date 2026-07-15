# Design thinking & trade-offs

## Why Scenario A (frontend)

The assessment allows either FE or BE. I chose FE because:

- Interactive scheduling is where resource constraints become *visible* (conflicts, duration, live updates)
- My strongest product experience is in complex UI flows
- Calendar + availability banner + WS demo communicates ownership domain clearly in a short video

## Why FullCalendar over a fully custom grid

Custom + dnd-kit would showcase craft, but risk:

- Overlap layout bugs
- Accessibility / keyboard gaps
- Time lost vs testing domain rules

FullCalendar gives Google Calendar–like interactions quickly (select, drag, resize). Effort went into **availability semantics**, conflict UX, and mock realism instead.

## Why MSW instead of json-server

- Keeps one command (`npm run dev`)
- Allows **409 conflict payloads** and artificial latency
- Supports **WebSocket** mocking in the same worker
- Closer to “replaceable API boundary” for a real backend later

## Real-time: WebSocket vs polling

Challenge “real-time availability check” does **not** require WebSockets. I still added WS because:

- Multi-advisor concurrency is a *reasonable domain assumption* for a busy service desk
- It strengthens the “Build for the Future” story (live occupancy)
- Fallback is clear: refetch week on focus / short polling if WS drops

The LIVE pill and **Simulate other advisor** exist specifically so the WS path is demoable in the video.

## Scope deliberately cut

| Cut | Reason |
| --- | --- |
| Multi-dealership switcher | One tenant keeps the demo focused |
| Month view | Not needed for bay scheduling |
| Recurring appointments | Out of acceptance criteria |
| Auth | Mock environment |
| Resource-timeline premium plugin | Avoid paid FullCalendar features; color-code by bay instead |

## Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| FE timezone confusion | Business hours evaluated in `Asia/Ho_Chi_Minh` via `Intl` |
| Drag success but business reject | Revert + toast from PATCH 409 |
| Availability flicker while typing | 280ms debounce |
| Port mismatch breaking WS | Pin Vite to 5173 + shared `wsUrl.ts` |
| Over-building UI, under-testing rules | Vitest on pure `checkAvailability` |

## What I would do in production next

1. Replace MockDb with Postgres + exclusion constraints / GiST range indexes
2. Move availability to a dedicated service used by FE and other channels (OEM apps)
3. Add resource timeline (bay lanes) if licensing allows
4. Add optimistic UI with version tokens for appointments
5. Contract tests (OpenAPI) between this SPA and the real API
