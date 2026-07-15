import { http, HttpResponse, ws } from 'msw'
import { atLocal, vehicles } from '../data/seed'
import {
  readPendingStore,
  removePendingStore,
  upsertPendingStore,
} from '../domain/presence'
import { catalog, db } from './db'
import type {
  AvailabilityRequest,
  CreateAppointmentRequest,
  LiveEvent,
  PendingClientMessage,
  RemotePending,
  UpdateAppointmentRequest,
} from '../domain/types'
import { WS_URL } from './wsUrl'

export const liveWs = ws.link(WS_URL)

function broadcast(event: LiveEvent) {
  liveWs.broadcast(JSON.stringify(event))
}

db.subscribe((event) => broadcast(event))

/** Mock API edge — logs W3C traceparent injected by OpenTelemetry FetchInstrumentation. */
function mockEdgeLog(request: Request, route: string) {
  const traceparent = request.headers.get('traceparent')
  if (traceparent) {
    console.debug('[msw]', route, { traceparent })
  }
}

/** Map MSW WebSocket client id → presence sessionId for disconnect cleanup. */
const clientSessionIds = new Map<string, string>()

function snapshotPendings(): Promise<RemotePending[]> {
  return readPendingStore().then((map) => Object.values(map))
}

export const handlers = [
  http.get('/api/health', () =>
    HttpResponse.json({ ok: true, service: 'unified-service-scheduler' }),
  ),

  http.get('/api/dealership', () => HttpResponse.json(catalog.dealership)),

  http.get('/api/vehicles', () => HttpResponse.json(catalog.vehicles)),

  http.get('/api/service-types', () => HttpResponse.json(catalog.serviceTypes)),

  http.get('/api/bays', ({ request }) => {
    const url = new URL(request.url)
    const dealershipId = url.searchParams.get('dealershipId') ?? catalog.dealership.id
    return HttpResponse.json(catalog.bays.filter((b) => b.dealershipId === dealershipId))
  }),

  http.get('/api/technicians', ({ request }) => {
    const url = new URL(request.url)
    const dealershipId = url.searchParams.get('dealershipId') ?? catalog.dealership.id
    return HttpResponse.json(catalog.technicians.filter((t) => t.dealershipId === dealershipId))
  }),

  http.get('/api/appointments', async ({ request }) => {
    const url = new URL(request.url)
    const dealershipId = url.searchParams.get('dealershipId') ?? catalog.dealership.id
    const from = url.searchParams.get('from') ?? undefined
    const to = url.searchParams.get('to') ?? undefined
    return HttpResponse.json(await db.listAppointments(dealershipId, from, to))
  }),

  http.get('/api/appointments/:id', async ({ params }) => {
    const appt = await db.getAppointment(String(params.id))
    if (!appt) return HttpResponse.json({ message: 'Not found' }, { status: 404 })
    return HttpResponse.json(appt)
  }),

  http.post('/api/availability/check', async ({ request }) => {
    mockEdgeLog(request, 'POST /api/availability/check')
    const body = (await request.json()) as AvailabilityRequest
    try {
      const result = await db.check(body)
      await delay(180)
      return HttpResponse.json(result)
    } catch (e) {
      return HttpResponse.json({ message: (e as Error).message }, { status: 400 })
    }
  }),

  http.post('/api/appointments', async ({ request }) => {
    mockEdgeLog(request, 'POST /api/appointments')
    const body = (await request.json()) as CreateAppointmentRequest
    try {
      await delay(220)
      const created = await db.create(body)
      return HttpResponse.json(created, { status: 201 })
    } catch (e) {
      const err = e as Error & { status?: number; details?: unknown }
      return HttpResponse.json(
        { message: err.message, details: err.details },
        { status: err.status ?? 400 },
      )
    }
  }),

  http.patch('/api/appointments/:id', async ({ params, request }) => {
    mockEdgeLog(request, `PATCH /api/appointments/${String(params.id)}`)
    const body = (await request.json()) as UpdateAppointmentRequest
    try {
      await delay(180)
      const updated = await db.update(String(params.id), body)
      return HttpResponse.json(updated)
    } catch (e) {
      const err = e as Error & { status?: number; details?: unknown }
      return HttpResponse.json(
        { message: err.message, details: err.details },
        { status: err.status ?? 400 },
      )
    }
  }),

  http.delete('/api/appointments/:id', async ({ params, request }) => {
    mockEdgeLog(request, `DELETE /api/appointments/${String(params.id)}`)
    try {
      await db.remove(String(params.id))
      return new HttpResponse(null, { status: 204 })
    } catch (e) {
      const err = e as Error & { status?: number }
      return HttpResponse.json({ message: err.message }, { status: err.status ?? 400 })
    }
  }),

  /** Demo helper: another advisor books a slot → clients receive WS event. */
  http.post('/api/demo/simulate-other-user', async () => {
    const candidates = [
      { vehicleId: 'veh-tucson', serviceTypeId: 'svc-oil', day: 4, hour: 14 },
      { vehicleId: 'veh-camry', serviceTypeId: 'svc-oil', day: 4, hour: 15 },
      { vehicleId: 'veh-vf8', serviceTypeId: 'svc-ev', day: 0, hour: 11 },
      { vehicleId: 'veh-crv', serviceTypeId: 'svc-ac', day: 3, hour: 14 },
    ]

    for (const candidate of candidates) {
      const service = catalog.serviceTypes.find((s) => s.id === candidate.serviceTypeId)!
      const start = atLocal(candidate.day, candidate.hour)
      const endDate = new Date(start)
      endDate.setMinutes(endDate.getMinutes() + service.durationMinutes)
      const end = endDate.toISOString()
      const availability = await db.check({
        dealershipId: catalog.dealership.id,
        serviceTypeId: candidate.serviceTypeId,
        start,
        end,
      })
      if (
        !availability.ok ||
        !availability.recommendedBayId ||
        !availability.recommendedTechnicianId
      ) {
        continue
      }
      const created = await db.create({
        dealershipId: catalog.dealership.id,
        vehicleId: candidate.vehicleId,
        serviceTypeId: candidate.serviceTypeId,
        bayId: availability.recommendedBayId,
        technicianId: availability.recommendedTechnicianId,
        start,
        end,
        createdBy: 'other_user_sim',
      })
      await delay(120)
      return HttpResponse.json({
        message: `Simulated booking by another advisor for ${vehicles.find((v) => v.id === candidate.vehicleId)?.plate}`,
        appointment: created,
      })
    }

    return HttpResponse.json(
      {
        message:
          'No free slot found for simulation — cancel an appointment or refresh to reset seed data.',
      },
      { status: 409 },
    )
  }),

  liveWs.addEventListener('connection', ({ client }) => {
    client.send(
      JSON.stringify({
        type: 'connected',
        at: new Date().toISOString(),
      } satisfies LiveEvent),
    )

    void snapshotPendings().then((pendings) => {
      client.send(
        JSON.stringify({
          type: 'pending.snapshot',
          pendings,
        } satisfies LiveEvent),
      )
    })

    client.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(String(event.data)) as PendingClientMessage
        if (message.type === 'pending.publish') {
          clientSessionIds.set(client.id, message.pending.sessionId)
          void upsertPendingStore(message.pending)
          liveWs.broadcastExcept(
            client,
            JSON.stringify({
              type: 'pending.updated',
              pending: message.pending,
            } satisfies LiveEvent),
          )
          return
        }
        if (message.type === 'pending.clear') {
          clientSessionIds.set(client.id, message.sessionId)
          void removePendingStore(message.sessionId)
          liveWs.broadcastExcept(
            client,
            JSON.stringify({
              type: 'pending.cleared',
              sessionId: message.sessionId,
            } satisfies LiveEvent),
          )
        }
      } catch {
        // ignore malformed client payloads in demo
      }
    })

    client.addEventListener('close', () => {
      const sessionId = clientSessionIds.get(client.id)
      clientSessionIds.delete(client.id)
      if (!sessionId) return
      void removePendingStore(sessionId)
      broadcast({ type: 'pending.cleared', sessionId })
    })
  }),
]

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
