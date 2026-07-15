import { differenceInMinutes, parseISO } from 'date-fns'
import {
  bays,
  dealership,
  seedAppointments,
  serviceTypes,
  technicians,
  vehicles,
} from '../data/seed'
import { checkAvailability } from '../domain/availability'
import type {
  Appointment,
  AppointmentView,
  AvailabilityRequest,
  CreateAppointmentRequest,
  LiveEvent,
  UpdateAppointmentRequest,
} from '../domain/types'
import {
  notifyRuntimeSync,
  readRuntimeJson,
  RUNTIME_APPOINTMENTS_FILE,
  writeRuntimeJson,
} from './runtimeApi'

type Listener = (event: LiveEvent) => void

function enrich(appointment: Appointment): AppointmentView {
  const vehicle = vehicles.find((v) => v.id === appointment.vehicleId)!
  const service = serviceTypes.find((s) => s.id === appointment.serviceTypeId)!
  const bay = bays.find((b) => b.id === appointment.bayId)!
  const tech = technicians.find((t) => t.id === appointment.technicianId)!
  return {
    ...appointment,
    vehicleLabel: `${vehicle.plate} · ${vehicle.make} ${vehicle.model}`,
    serviceLabel: service.name,
    bayLabel: bay.label,
    technicianName: tech.name,
    customerName: vehicle.customerName,
    durationMinutes: Math.max(
      0,
      differenceInMinutes(parseISO(appointment.end), parseISO(appointment.start)),
    ),
  }
}

class MockDb {
  appointments: Appointment[] = structuredClone(seedAppointments)
  listeners = new Set<Listener>()
  private ready: Promise<void>

  constructor() {
    this.ready = this.hydrate()
  }

  /** Wait until `.runtime-data/appointments.json` has been loaded (or seeded). */
  whenReady() {
    return this.ready
  }

  private async hydrate() {
    if (typeof window === 'undefined' || import.meta.env.MODE === 'test') return
    try {
      const stored = await readRuntimeJson<Appointment[]>(RUNTIME_APPOINTMENTS_FILE)
      if (Array.isArray(stored)) {
        this.appointments = stored
        return
      }
      // First run: seed disk so other tabs share the same baseline
      await this.persistAsync()
    } catch {
      // Dev server middleware may be cold; keep in-memory seed
    }
  }

  /** Pull latest appointments from disk (other tab may have written). */
  async reloadFromRuntime() {
    if (typeof window === 'undefined' || import.meta.env.MODE === 'test') return
    try {
      const stored = await readRuntimeJson<Appointment[]>(RUNTIME_APPOINTMENTS_FILE)
      if (Array.isArray(stored)) {
        this.appointments = stored
      }
    } catch {
      // keep current memory
    }
  }

  async persistAsync() {
    if (typeof window === 'undefined' || import.meta.env.MODE === 'test') return
    await writeRuntimeJson(RUNTIME_APPOINTMENTS_FILE, this.appointments)
    notifyRuntimeSync('appointments')
  }

  async reset() {
    this.appointments = structuredClone(seedAppointments)
    await this.persistAsync()
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(event: LiveEvent) {
    this.listeners.forEach((l) => l(event))
  }

  async listAppointments(dealershipId: string, from?: string, to?: string): Promise<AppointmentView[]> {
    await this.reloadFromRuntime()
    return this.appointments
      .filter((a) => {
        if (a.dealershipId !== dealershipId || a.status !== 'confirmed') return false
        if (from && a.end < from) return false
        if (to && a.start > to) return false
        return true
      })
      .map(enrich)
      .sort((a, b) => a.start.localeCompare(b.start))
  }

  async getAppointment(id: string): Promise<AppointmentView | undefined> {
    await this.reloadFromRuntime()
    const found = this.appointments.find((a) => a.id === id)
    return found ? enrich(found) : undefined
  }

  async check(request: AvailabilityRequest) {
    await this.reloadFromRuntime()
    const serviceType = serviceTypes.find((s) => s.id === request.serviceTypeId)
    if (!serviceType) throw new Error('Unknown service type')
    if (request.dealershipId !== dealership.id) throw new Error('Unknown dealership')
    return checkAvailability({
      request,
      dealership,
      serviceType,
      bays,
      technicians,
      appointments: this.appointments,
    })
  }

  async create(input: CreateAppointmentRequest): Promise<AppointmentView> {
    await this.reloadFromRuntime()
    const serviceType = serviceTypes.find((s) => s.id === input.serviceTypeId)
    if (!serviceType) throw new Error('Unknown service type')

    const availability = await this.check({
      dealershipId: input.dealershipId,
      serviceTypeId: input.serviceTypeId,
      start: input.start,
      end: input.end,
      preferredBayId: input.bayId,
      preferredTechnicianId: input.technicianId,
    })

    if (!availability.ok) {
      const error = new Error('Availability check failed') as Error & {
        status: number
        details: typeof availability
      }
      error.status = 409
      error.details = availability
      throw error
    }

    const now = new Date().toISOString()
    const appointment: Appointment = {
      id: `appt-${crypto.randomUUID().slice(0, 8)}`,
      dealershipId: input.dealershipId,
      vehicleId: input.vehicleId,
      serviceTypeId: input.serviceTypeId,
      bayId: input.bayId,
      technicianId: input.technicianId,
      start: availability.start,
      end: availability.end,
      status: 'confirmed',
      createdAt: now,
      updatedAt: now,
      createdBy: input.createdBy ?? 'advisor',
    }

    this.appointments.push(appointment)
    await this.persistAsync()
    const view = enrich(appointment)
    this.emit({ type: 'appointment.created', appointment: view })
    return view
  }

  async update(id: string, patch: UpdateAppointmentRequest): Promise<AppointmentView> {
    await this.reloadFromRuntime()
    const index = this.appointments.findIndex((a) => a.id === id)
    if (index < 0) {
      const error = new Error('Not found') as Error & { status: number }
      error.status = 404
      throw error
    }

    const current = this.appointments[index]
    const nextStart = patch.start ?? current.start
    const nextEnd = patch.end ?? current.end
    const nextBay = patch.bayId ?? current.bayId
    const nextTech = patch.technicianId ?? current.technicianId

    const availability = await this.check({
      dealershipId: current.dealershipId,
      serviceTypeId: current.serviceTypeId,
      start: nextStart,
      end: nextEnd,
      preferredBayId: nextBay,
      preferredTechnicianId: nextTech,
      excludeAppointmentId: id,
    })

    if (!availability.ok) {
      const error = new Error('Availability check failed') as Error & {
        status: number
        details: typeof availability
      }
      error.status = 409
      error.details = availability
      throw error
    }

    const updated: Appointment = {
      ...current,
      start: availability.start,
      end: availability.end,
      bayId: nextBay,
      technicianId: nextTech,
      updatedAt: new Date().toISOString(),
    }
    this.appointments[index] = updated
    await this.persistAsync()
    const view = enrich(updated)
    this.emit({ type: 'appointment.updated', appointment: view })
    return view
  }

  async remove(id: string) {
    await this.reloadFromRuntime()
    const index = this.appointments.findIndex((a) => a.id === id)
    if (index < 0) {
      const error = new Error('Not found') as Error & { status: number }
      error.status = 404
      throw error
    }
    this.appointments.splice(index, 1)
    await this.persistAsync()
    this.emit({ type: 'appointment.deleted', appointmentId: id })
  }
}

export const db = new MockDb()

export const catalog = {
  dealership,
  bays,
  technicians,
  serviceTypes,
  vehicles,
}
