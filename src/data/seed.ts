import { addDays, setHours, setMinutes, startOfWeek } from 'date-fns'
import type {
  Appointment,
  Dealership,
  ServiceBay,
  ServiceType,
  Technician,
  Vehicle,
} from '../domain/types'

/** Anchor week: week containing 2026-07-13 (Mon). */
export const WEEK_ANCHOR = new Date('2026-07-13T00:00:00+07:00')

export function weekStart(date = WEEK_ANCHOR): Date {
  return startOfWeek(date, { weekStartsOn: 1 })
}

export function atLocal(dayOffset: number, hour: number, minute = 0): string {
  const base = addDays(weekStart(), dayOffset)
  const local = setMinutes(setHours(base, hour), minute)
  return local.toISOString()
}

export const dealership: Dealership = {
  id: 'dealer-d7',
  name: 'Keyloop District 7 Dealership',
  timezone: 'Asia/Ho_Chi_Minh',
  openHour: 8,
  closeHour: 17,
}

export const bays: ServiceBay[] = [
  { id: 'bay-1', dealershipId: dealership.id, name: 'Bay 1', label: 'Bay 1 · Express' },
  { id: 'bay-2', dealershipId: dealership.id, name: 'Bay 2', label: 'Bay 2 · General' },
  { id: 'bay-3', dealershipId: dealership.id, name: 'Bay 3', label: 'Bay 3 · EV / Heavy' },
]

export const technicians: Technician[] = [
  {
    id: 'tech-minh',
    dealershipId: dealership.id,
    name: 'Minh Tran',
    skills: ['general', 'engine'],
  },
  {
    id: 'tech-lan',
    dealershipId: dealership.id,
    name: 'Lan Pham',
    skills: ['general', 'brakes'],
  },
  {
    id: 'tech-hung',
    dealershipId: dealership.id,
    name: 'Hung Le',
    skills: ['general', 'ev', 'ac'],
  },
  {
    id: 'tech-mai',
    dealershipId: dealership.id,
    name: 'Mai Vo',
    skills: ['general', 'engine', 'ac'],
  },
]

export const serviceTypes: ServiceType[] = [
  {
    id: 'svc-oil',
    name: 'Oil change',
    durationMinutes: 60,
    requiredSkills: ['general'],
  },
  {
    id: 'svc-brake',
    name: 'Brake inspection',
    durationMinutes: 120,
    requiredSkills: ['brakes'],
  },
  {
    id: 'svc-ac',
    name: 'AC service',
    durationMinutes: 90,
    requiredSkills: ['ac'],
  },
  {
    id: 'svc-ev',
    name: 'EV battery health check',
    durationMinutes: 90,
    requiredSkills: ['ev'],
  },
]

export const vehicles: Vehicle[] = [
  {
    id: 'veh-camry',
    plate: '51A-123.45',
    make: 'Toyota',
    model: 'Camry',
    year: 2022,
    customerId: 'cus-1',
    customerName: 'Nguyen Anh Khoa',
    customerPhone: '0901 234 567',
  },
  {
    id: 'veh-vf8',
    plate: '59C-888.88',
    make: 'VinFast',
    model: 'VF8',
    year: 2024,
    customerId: 'cus-2',
    customerName: 'Tran Mai Huong',
    customerPhone: '0912 888 333',
  },
  {
    id: 'veh-crv',
    plate: '30H-456.78',
    make: 'Honda',
    model: 'CR-V',
    year: 2021,
    customerId: 'cus-3',
    customerName: 'Le Quoc Dat',
    customerPhone: '0987 111 222',
  },
  {
    id: 'veh-tucson',
    plate: '51G-777.11',
    make: 'Hyundai',
    model: 'Tucson',
    year: 2023,
    customerId: 'cus-4',
    customerName: 'Pham Thanh Ha',
    customerPhone: '0933 444 555',
  },
]

export const seedAppointments: Appointment[] = [
  {
    id: 'appt-1',
    dealershipId: dealership.id,
    vehicleId: 'veh-camry',
    serviceTypeId: 'svc-oil',
    bayId: 'bay-2',
    technicianId: 'tech-minh',
    start: atLocal(1, 9),
    end: atLocal(1, 10),
    status: 'confirmed',
    createdAt: atLocal(0, 8),
    updatedAt: atLocal(0, 8),
    createdBy: 'advisor',
  },
  {
    id: 'appt-2',
    dealershipId: dealership.id,
    vehicleId: 'veh-vf8',
    serviceTypeId: 'svc-brake',
    bayId: 'bay-1',
    technicianId: 'tech-lan',
    start: atLocal(1, 10),
    end: atLocal(1, 12),
    status: 'confirmed',
    createdAt: atLocal(0, 9),
    updatedAt: atLocal(0, 9),
    createdBy: 'advisor',
  },
  {
    id: 'appt-3',
    dealershipId: dealership.id,
    vehicleId: 'veh-crv',
    serviceTypeId: 'svc-ac',
    bayId: 'bay-3',
    technicianId: 'tech-hung',
    start: atLocal(2, 13),
    end: atLocal(2, 14, 30),
    status: 'confirmed',
    createdAt: atLocal(0, 10),
    updatedAt: atLocal(0, 10),
    createdBy: 'advisor',
  },
  {
    id: 'appt-4',
    dealershipId: dealership.id,
    vehicleId: 'veh-tucson',
    serviceTypeId: 'svc-oil',
    bayId: 'bay-2',
    technicianId: 'tech-mai',
    start: atLocal(3, 8),
    end: atLocal(3, 9),
    status: 'confirmed',
    createdAt: atLocal(0, 11),
    updatedAt: atLocal(0, 11),
    createdBy: 'advisor',
  },
]
