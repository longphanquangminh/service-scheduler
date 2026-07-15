# Product & technical flows

## Happy path — book from calendar

```text
Advisor opens week view
        │
        ▼
Clicks / drag-selects empty slot (e.g. Tue 10:00)
        │
        ▼
Booking panel opens with start prefilled
        │
        ├─ Select vehicle (Camry / VF8 / …)
        ├─ Select service type (sets duration)
        └─ Debounced availability check
                │
                ├─ OK → bay + tech suggested / enabled
                └─ Conflict → banner lists reasons; Confirm disabled
        │
        ▼
Confirm booking
        │
        ▼
MSW POST /api/appointments
        │
        ├─ 201 → event on calendar + toast
        └─ 409 → toast with conflict detail
```

## Alternate entry — header button

```text
New appointment
  → default start snapped near “now” within business hours
  → same panel flow as above
```

## Edit / cancel

```text
Click event
  → panel in edit mode (vehicle/service locked)
  → change start / bay / tech
  → Save (PATCH) or Cancel appointment (DELETE)
```

## Drag & resize

```text
Drag event to new time
  → PATCH with new start/end
  → excludeAppointmentId = self
  → success: toast · failure: revert + toast

Resize event end
  → same PATCH path
```

## Availability decision tree

```text
Input: dealership, serviceType, start[, end], optional preferred bay/tech, excludeId

1. Build window = [start, start + duration] (or explicit end)
2. Window inside business hours (dealership TZ)?
   └─ no → conflict:hours
3. Bays with no overlapping confirmed appointment?
   └─ none → conflict:bay
4. Technicians with required skills AND no overlap?
   └─ none → conflict:technician or skill
5. If preferred bay/tech provided, must be in available sets
6. ok = no hard conflicts and preferences satisfied
7. Recommend first available bay/tech when preference missing/invalid
```

## Live update flow (WebSocket)

```text
Client A                      MSW MockDb                     Client B
   │                              │                              │
   │  Simulate other advisor      │                              │
   │─────────────────────────────►│                              │
   │                              │ create + emit                │
   │                              │──────── WS broadcast ───────►│
   │◄──────── HTTP 201 ───────────│                              │
   │ upsert                       │                              │ upsert
```

## Sequence — confirm with race safety

```text
UI                         API/MockDb
│  checkAvailability        │
│──────────────────────────►│
│  ok + recommendations     │
│◄──────────────────────────│
│  POST create (preferred)  │
│──────────────────────────►│  re-check under current state
│                           │  persist OR 409
│◄──────────────────────────│
```

This double-check mimics real systems where the calendar can change between preview and commit (especially with multiple advisors).
