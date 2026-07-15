import { addMinutes, areIntervalsOverlapping, isBefore, parseISO } from 'date-fns'
import type {
  Appointment,
  AvailabilityRequest,
  AvailabilityResponse,
  Dealership,
  ResourceConflict,
  ServiceBay,
  ServiceType,
  Technician,
} from './types'
import { durationMinutesBetween, MIN_DURATION_MINUTES } from './time'

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return areIntervalsOverlapping(
    { start: aStart, end: aEnd },
    { start: bStart, end: bEnd },
    { inclusive: false },
  )
}

/** Minutes from midnight in the dealership timezone. */
export function getZonedMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(date)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
  const normalizedHour = hour === 24 ? 0 : hour
  return normalizedHour * 60 + minute
}

export function getZonedDateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function withinBusinessHours(dealership: Dealership, start: Date, end: Date): boolean {
  if (getZonedDateKey(start, dealership.timezone) !== getZonedDateKey(end, dealership.timezone)) {
    return false
  }
  const startMinutes = getZonedMinutes(start, dealership.timezone)
  const endMinutes = getZonedMinutes(end, dealership.timezone)
  const open = dealership.openHour * 60
  const close = dealership.closeHour * 60
  return startMinutes >= open && endMinutes <= close && startMinutes < endMinutes
}

export function resolveAppointmentWindow(
  serviceType: ServiceType,
  startIso: string,
  endIso?: string,
): { start: Date; end: Date } {
  const start = parseISO(startIso)
  // Prefer explicit end (Google Calendar–style). Service type duration is only a fallback.
  const end = endIso ? parseISO(endIso) : addMinutes(start, serviceType.durationMinutes)
  return { start, end }
}

export function checkAvailability(params: {
  request: AvailabilityRequest
  dealership: Dealership
  serviceType: ServiceType
  bays: ServiceBay[]
  technicians: Technician[]
  appointments: Appointment[]
}): AvailabilityResponse {
  const { request, dealership, serviceType, bays, technicians, appointments } = params
  const { start, end } = resolveAppointmentWindow(serviceType, request.start, request.end)
  const conflicts: ResourceConflict[] = []

  if (!isBefore(start, end)) {
    return {
      ok: false,
      start: start.toISOString(),
      end: end.toISOString(),
      availableBayIds: [],
      availableTechnicianIds: [],
      conflicts: [
        {
          resourceType: 'duration',
          message: 'End time must be after start time.',
        },
      ],
    }
  }

  const durationMins = durationMinutesBetween(start.toISOString(), end.toISOString())
  if (durationMins < MIN_DURATION_MINUTES) {
    conflicts.push({
      resourceType: 'duration',
      message: `Minimum booking duration is ${MIN_DURATION_MINUTES} minutes (selected ${durationMins} min).`,
    })
  }

  if (!withinBusinessHours(dealership, start, end)) {
    conflicts.push({
      resourceType: 'hours',
      message: `Outside business hours (${String(dealership.openHour).padStart(2, '0')}:00–${String(dealership.closeHour).padStart(2, '0')}:00 ${dealership.timezone}).`,
    })
  }

  const active = appointments.filter(
    (a) =>
      a.status === 'confirmed' &&
      a.dealershipId === request.dealershipId &&
      a.id !== request.excludeAppointmentId,
  )

  const dealerBays = bays.filter((b) => b.dealershipId === request.dealershipId)
  const dealerTechs = technicians.filter((t) => t.dealershipId === request.dealershipId)

  const availableBayIds = dealerBays
    .filter((bay) => {
      const busy = active.some(
        (a) => a.bayId === bay.id && overlaps(start, end, parseISO(a.start), parseISO(a.end)),
      )
      return !busy
    })
    .map((b) => b.id)

  const skillOk = (tech: Technician) =>
    serviceType.requiredSkills.every((skill) => tech.skills.includes(skill))

  const availableTechnicianIds = dealerTechs
    .filter((tech) => {
      if (!skillOk(tech)) return false
      const busy = active.some(
        (a) =>
          a.technicianId === tech.id &&
          overlaps(start, end, parseISO(a.start), parseISO(a.end)),
      )
      return !busy
    })
    .map((t) => t.id)

  if (availableBayIds.length === 0) {
    conflicts.push({
      resourceType: 'bay',
      message: 'No service bay is free for the full service duration.',
    })
  }

  if (dealerTechs.filter(skillOk).length === 0) {
    conflicts.push({
      resourceType: 'skill',
      message: `No technician has the required skills: ${serviceType.requiredSkills.join(', ')}.`,
    })
  } else if (availableTechnicianIds.length === 0) {
    conflicts.push({
      resourceType: 'technician',
      message: 'No qualified technician is free for the full service duration.',
    })
  }

  if (request.preferredBayId && !availableBayIds.includes(request.preferredBayId)) {
    conflicts.push({
      resourceType: 'bay',
      resourceId: request.preferredBayId,
      message: 'Preferred bay is unavailable for this slot.',
    })
  }

  if (
    request.preferredTechnicianId &&
    !availableTechnicianIds.includes(request.preferredTechnicianId)
  ) {
    conflicts.push({
      resourceType: 'technician',
      resourceId: request.preferredTechnicianId,
      message: 'Preferred technician is unavailable or not qualified for this slot.',
    })
  }

  const recommendedBayId =
    (request.preferredBayId && availableBayIds.includes(request.preferredBayId)
      ? request.preferredBayId
      : availableBayIds[0]) ?? undefined

  const recommendedTechnicianId =
    (request.preferredTechnicianId &&
    availableTechnicianIds.includes(request.preferredTechnicianId)
      ? request.preferredTechnicianId
      : availableTechnicianIds[0]) ?? undefined

  const preferenceBlocked =
    (request.preferredBayId != null && !availableBayIds.includes(request.preferredBayId)) ||
    (request.preferredTechnicianId != null &&
      !availableTechnicianIds.includes(request.preferredTechnicianId))

  const ok =
    conflicts.every((c) => c.resourceType !== 'hours' && c.resourceType !== 'duration') &&
    availableBayIds.length > 0 &&
    availableTechnicianIds.length > 0 &&
    !preferenceBlocked

  return {
    ok,
    start: start.toISOString(),
    end: end.toISOString(),
    availableBayIds,
    availableTechnicianIds,
    recommendedBayId,
    recommendedTechnicianId,
    conflicts,
  }
}
