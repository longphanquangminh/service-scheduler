import type {
  AppointmentView,
  AvailabilityRequest,
  AvailabilityResponse,
  CreateAppointmentRequest,
  Dealership,
  ServiceBay,
  ServiceType,
  Technician,
  UpdateAppointmentRequest,
  Vehicle,
} from '../domain/types'
import { withSpan } from '../observability/tracing'
import { attachRequestPayload, attachResponsePayload } from '../observability/spanPayload'
import { SpanStatusCode } from '@opentelemetry/api'

type ApiRequestInit = Omit<RequestInit, 'headers'> & {
  headers?: HeadersInit
}

async function request<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const route = path.split('?')[0] ?? path
  const search = path.includes('?') ? path.slice(path.indexOf('?') + 1) : undefined

  return withSpan(
    `HTTP ${method} ${route}`,
    {
      'http.method': method,
      'http.url': route,
      'http.route': route,
      ...(search ? { 'http.query': search } : {}),
    },
    async (span) => {
      const headers = new Headers(init.headers)
      if (!headers.has('Content-Type') && init.body != null) {
        headers.set('Content-Type', 'application/json')
      }

      attachRequestPayload(span, {
        headers,
        body: init.body,
      })

      const res = await fetch(path, {
        ...init,
        method,
        headers,
      })

      span.setAttribute('http.status_code', res.status)
      span.setAttribute('http.response_content_length_hint', res.headers.get('content-length') ?? '')

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        attachResponsePayload(span, body)
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (body as { message?: string }).message ?? `HTTP ${res.status}`,
        })
        const err = new Error(
          (body as { message?: string }).message ?? `Request failed: ${res.status}`,
        ) as Error & {
          status: number
          details?: unknown
        }
        err.status = res.status
        err.details = (body as { details?: unknown }).details
        throw err
      }

      if (res.status === 204) {
        attachResponsePayload(span, null)
        return undefined as T
      }

      const json = (await res.json()) as T
      attachResponsePayload(span, json)
      return json
    },
  )
}

export const api = {
  getDealership: () => request<Dealership>('/api/dealership'),
  getVehicles: () => request<Vehicle[]>('/api/vehicles'),
  getServiceTypes: () => request<ServiceType[]>('/api/service-types'),
  getBays: (dealershipId: string) =>
    request<ServiceBay[]>(`/api/bays?dealershipId=${encodeURIComponent(dealershipId)}`),
  getTechnicians: (dealershipId: string) =>
    request<Technician[]>(`/api/technicians?dealershipId=${encodeURIComponent(dealershipId)}`),
  getAppointments: (dealershipId: string, from: string, to: string) =>
    request<AppointmentView[]>(
      `/api/appointments?dealershipId=${encodeURIComponent(dealershipId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
  checkAvailability: (body: AvailabilityRequest) =>
    withSpan(
      'availability.check',
      {
        'app.dealership_id': body.dealershipId,
        'app.service_type_id': body.serviceTypeId,
        'app.request.body': JSON.stringify(body),
      },
      async (span) => {
        const result = await request<AvailabilityResponse>('/api/availability/check', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        span.setAttribute('app.availability_ok', result.ok)
        span.setAttribute('app.conflict_count', result.conflicts.length)
        span.setAttribute('app.response.body', JSON.stringify(result))
        if (!result.ok) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'availability conflict' })
        }
        return result
      },
    ),
  createAppointment: (body: CreateAppointmentRequest) =>
    withSpan(
      'booking.create',
      {
        'app.dealership_id': body.dealershipId,
        'app.service_type_id': body.serviceTypeId,
        'app.vehicle_id': body.vehicleId,
        'app.request.body': JSON.stringify(body),
      },
      async (span) => {
        try {
          const created = await request<AppointmentView>('/api/appointments', {
            method: 'POST',
            body: JSON.stringify(body),
          })
          span.setAttribute('app.appointment_id', created.id)
          span.setAttribute('app.response.body', JSON.stringify(created))
          return created
        } catch (e) {
          const err = e as Error & { status?: number; details?: unknown }
          if (err.status === 409) span.setAttribute('app.booking_conflict', true)
          if (err.details) span.setAttribute('app.error.details', JSON.stringify(err.details))
          throw e
        }
      },
    ),
  updateAppointment: (id: string, body: UpdateAppointmentRequest) =>
    withSpan(
      'booking.update',
      {
        'app.appointment_id': id,
        'app.request.body': JSON.stringify(body),
      },
      async (span) => {
        try {
          const updated = await request<AppointmentView>(`/api/appointments/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(body),
          })
          span.setAttribute('app.appointment_id', updated.id)
          span.setAttribute('app.response.body', JSON.stringify(updated))
          return updated
        } catch (e) {
          const err = e as Error & { status?: number; details?: unknown }
          if (err.status === 409) span.setAttribute('app.booking_conflict', true)
          if (err.details) span.setAttribute('app.error.details', JSON.stringify(err.details))
          throw e
        }
      },
    ),
  deleteAppointment: (id: string) =>
    withSpan('booking.delete', { 'app.appointment_id': id }, () =>
      request<void>(`/api/appointments/${id}`, { method: 'DELETE' }),
    ),
  simulateOtherUser: () =>
    withSpan('demo.simulate_other_user', {}, () =>
      request<{ message: string; appointment?: AppointmentView }>(
        '/api/demo/simulate-other-user',
        { method: 'POST' },
      ),
    ),
}
