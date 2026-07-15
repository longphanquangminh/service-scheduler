import { describe, expect, it } from 'vitest'
import { checkAvailability } from './availability'
import type { Appointment, Dealership, ServiceBay, ServiceType, Technician } from './types'

/** Build an ISO string for a wall-clock time in Asia/Ho_Chi_Minh (UTC+7). */
function hcm(day: number, hour: number, minute = 0): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `2026-07-${pad(day)}T${pad(hour)}:${pad(minute)}:00.000+07:00`
}

const dealership: Dealership = {
  id: 'dealer-1',
  name: 'District 7 Dealership',
  timezone: 'Asia/Ho_Chi_Minh',
  openHour: 8,
  closeHour: 17,
}

const bays: ServiceBay[] = [
  { id: 'bay-1', dealershipId: 'dealer-1', name: 'Bay 1', label: 'Bay 1' },
  { id: 'bay-2', dealershipId: 'dealer-1', name: 'Bay 2', label: 'Bay 2' },
]

const technicians: Technician[] = [
  {
    id: 'tech-1',
    dealershipId: 'dealer-1',
    name: 'Minh Tran',
    skills: ['engine', 'general'],
  },
  {
    id: 'tech-2',
    dealershipId: 'dealer-1',
    name: 'Lan Pham',
    skills: ['brakes', 'general'],
  },
]

const oilChange: ServiceType = {
  id: 'svc-oil',
  name: 'Oil change',
  durationMinutes: 60,
  requiredSkills: ['general'],
}

const brakeJob: ServiceType = {
  id: 'svc-brake',
  name: 'Brake inspection',
  durationMinutes: 120,
  requiredSkills: ['brakes'],
}

const baseAppt: Appointment = {
  id: 'a1',
  dealershipId: 'dealer-1',
  vehicleId: 'v1',
  serviceTypeId: 'svc-oil',
  bayId: 'bay-1',
  technicianId: 'tech-1',
  start: hcm(14, 9),
  end: hcm(14, 10),
  status: 'confirmed',
  createdAt: hcm(13, 8),
  updatedAt: hcm(13, 8),
}

describe('checkAvailability', () => {
  it('returns ok when bay and qualified tech are free', () => {
    const result = checkAvailability({
      request: {
        dealershipId: 'dealer-1',
        serviceTypeId: oilChange.id,
        start: hcm(14, 11),
      },
      dealership,
      serviceType: oilChange,
      bays,
      technicians,
      appointments: [baseAppt],
    })

    expect(result.ok).toBe(true)
    expect(result.availableBayIds).toContain('bay-1')
    expect(result.availableTechnicianIds).toEqual(expect.arrayContaining(['tech-1', 'tech-2']))
  })

  it('blocks when all bays overlap the requested window', () => {
    const appointments: Appointment[] = [
      baseAppt,
      {
        ...baseAppt,
        id: 'a2',
        bayId: 'bay-2',
        technicianId: 'tech-2',
        start: hcm(14, 9),
        end: hcm(14, 10),
      },
    ]

    const result = checkAvailability({
      request: {
        dealershipId: 'dealer-1',
        serviceTypeId: oilChange.id,
        start: hcm(14, 9, 30),
      },
      dealership,
      serviceType: oilChange,
      bays,
      technicians,
      appointments,
    })

    expect(result.ok).toBe(false)
    expect(result.availableBayIds).toHaveLength(0)
    expect(result.conflicts.some((c) => c.resourceType === 'bay')).toBe(true)
  })

  it('requires technician skill match for the service type', () => {
    const result = checkAvailability({
      request: {
        dealershipId: 'dealer-1',
        serviceTypeId: brakeJob.id,
        start: hcm(14, 13),
        preferredTechnicianId: 'tech-1',
      },
      dealership,
      serviceType: brakeJob,
      bays,
      technicians,
      appointments: [],
    })

    expect(result.availableTechnicianIds).toEqual(['tech-2'])
    expect(result.ok).toBe(false)
    expect(result.conflicts.some((c) => c.resourceType === 'technician')).toBe(true)
  })

  it('rejects slots outside business hours', () => {
    const result = checkAvailability({
      request: {
        dealershipId: 'dealer-1',
        serviceTypeId: oilChange.id,
        start: hcm(14, 16, 30),
      },
      dealership,
      serviceType: oilChange,
      bays,
      technicians,
      appointments: [],
    })

    expect(result.ok).toBe(false)
    expect(result.conflicts.some((c) => c.resourceType === 'hours')).toBe(true)
  })

  it('uses explicit end window instead of service-type duration', () => {
    const result = checkAvailability({
      request: {
        dealershipId: 'dealer-1',
        serviceTypeId: oilChange.id,
        start: hcm(14, 11),
        end: hcm(14, 13), // 2h window, oilChange default is 60m
      },
      dealership,
      serviceType: oilChange,
      bays,
      technicians,
      appointments: [],
    })

    expect(result.ok).toBe(true)
    expect(result.start).toBe(new Date(hcm(14, 11)).toISOString())
    expect(result.end).toBe(new Date(hcm(14, 13)).toISOString())
  })

  it('rejects windows shorter than 30 minutes', () => {
    const result = checkAvailability({
      request: {
        dealershipId: 'dealer-1',
        serviceTypeId: oilChange.id,
        start: hcm(14, 11),
        end: hcm(14, 11, 15),
      },
      dealership,
      serviceType: oilChange,
      bays,
      technicians,
      appointments: [],
    })

    expect(result.ok).toBe(false)
    expect(result.conflicts.some((c) => c.resourceType === 'duration')).toBe(true)
  })

  it('rejects end before start without throwing', () => {
    const result = checkAvailability({
      request: {
        dealershipId: 'dealer-1',
        serviceTypeId: oilChange.id,
        start: hcm(14, 11, 30),
        end: hcm(14, 11),
      },
      dealership,
      serviceType: oilChange,
      bays,
      technicians,
      appointments: [],
    })

    expect(result.ok).toBe(false)
    expect(result.conflicts[0]?.message).toMatch(/after start/i)
  })
})
