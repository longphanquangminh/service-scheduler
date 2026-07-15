import { create } from 'zustand'
import { addMinutes } from 'date-fns'
import type {
  AppointmentView,
  AvailabilityResponse,
  Dealership,
  RemotePending,
  ServiceBay,
  ServiceType,
  Technician,
  Vehicle,
} from '../domain/types'
import { defaultEndFromStart, MIN_DURATION_MINUTES } from '../domain/time'

export type BookingMode = 'closed' | 'create' | 'edit'

export interface BookingDraft {
  appointmentId?: string
  vehicleId: string
  serviceTypeId: string
  bayId: string
  technicianId: string
  start: string
  end: string
}

interface SchedulerState {
  dealership: Dealership | null
  vehicles: Vehicle[]
  serviceTypes: ServiceType[]
  bays: ServiceBay[]
  technicians: Technician[]
  appointments: AppointmentView[]
  loading: boolean
  saving: boolean
  error: string | null
  toast: string | null
  liveStatus: 'connecting' | 'live' | 'offline'
  mode: BookingMode
  draft: BookingDraft | null
  availability: AvailabilityResponse | null
  checkingAvailability: boolean
  /** Other advisors' live pending selections (WebSocket presence). */
  remotePendings: Record<string, RemotePending>
  setCatalog: (payload: {
    dealership: Dealership
    vehicles: Vehicle[]
    serviceTypes: ServiceType[]
    bays: ServiceBay[]
    technicians: Technician[]
  }) => void
  setAppointments: (appointments: AppointmentView[]) => void
  upsertAppointment: (appointment: AppointmentView) => void
  removeAppointment: (id: string) => void
  upsertRemotePending: (pending: RemotePending) => void
  removeRemotePending: (sessionId: string) => void
  setRemotePendings: (pendings: RemotePending[]) => void
  setLoading: (loading: boolean) => void
  setSaving: (saving: boolean) => void
  setError: (error: string | null) => void
  setToast: (toast: string | null) => void
  setLiveStatus: (status: SchedulerState['liveStatus']) => void
  openCreate: (partial?: Partial<BookingDraft>) => void
  openEdit: (appointment: AppointmentView) => void
  closeBooking: () => void
  patchDraft: (patch: Partial<BookingDraft>) => void
  setAvailability: (availability: AvailabilityResponse | null) => void
  setCheckingAvailability: (checking: boolean) => void
}

const defaultDraft = (): BookingDraft => {
  const start = new Date()
  start.setMinutes(0, 0, 0)
  const end = addMinutes(start, MIN_DURATION_MINUTES)
  return {
    vehicleId: '',
    serviceTypeId: '',
    bayId: '',
    technicianId: '',
    start: start.toISOString(),
    end: end.toISOString(),
  }
}

export const useSchedulerStore = create<SchedulerState>((set, get) => ({
  dealership: null,
  vehicles: [],
  serviceTypes: [],
  bays: [],
  technicians: [],
  appointments: [],
  loading: true,
  saving: false,
  error: null,
  toast: null,
  liveStatus: 'connecting',
  mode: 'closed',
  draft: null,
  availability: null,
  checkingAvailability: false,
  remotePendings: {},

  setCatalog: (payload) => set({ ...payload }),
  setAppointments: (appointments) => set({ appointments }),
  upsertAppointment: (appointment) =>
    set((state) => {
      const idx = state.appointments.findIndex((a) => a.id === appointment.id)
      if (idx === -1) return { appointments: [...state.appointments, appointment] }
      const next = [...state.appointments]
      next[idx] = appointment
      return { appointments: next }
    }),
  removeAppointment: (id) =>
    set((state) => ({ appointments: state.appointments.filter((a) => a.id !== id) })),
  upsertRemotePending: (pending) =>
    set((state) => ({
      remotePendings: { ...state.remotePendings, [pending.sessionId]: pending },
    })),
  removeRemotePending: (sessionId) =>
    set((state) => {
      if (!(sessionId in state.remotePendings)) return state
      const next = { ...state.remotePendings }
      delete next[sessionId]
      return { remotePendings: next }
    }),
  setRemotePendings: (pendings) =>
    set({
      remotePendings: Object.fromEntries(pendings.map((p) => [p.sessionId, p])),
    }),
  setLoading: (loading) => set({ loading }),
  setSaving: (saving) => set({ saving }),
  setError: (error) => set({ error }),
  setToast: (toast) => set({ toast }),
  setLiveStatus: (liveStatus) => set({ liveStatus }),

  openCreate: (partial) => {
    const { vehicles, serviceTypes, bays, technicians } = get()
    const base = defaultDraft()
    const start = partial?.start ?? base.start
    const end = partial?.end ?? defaultEndFromStart(start)
    set({
      mode: 'create',
      availability: null,
      draft: {
        ...base,
        vehicleId: vehicles[0]?.id ?? '',
        serviceTypeId: serviceTypes[0]?.id ?? '',
        bayId: bays[0]?.id ?? '',
        technicianId: technicians[0]?.id ?? '',
        ...partial,
        start,
        end,
      },
    })
  },

  openEdit: (appointment) =>
    set({
      mode: 'edit',
      availability: null,
      draft: {
        appointmentId: appointment.id,
        vehicleId: appointment.vehicleId,
        serviceTypeId: appointment.serviceTypeId,
        bayId: appointment.bayId,
        technicianId: appointment.technicianId,
        start: appointment.start,
        end: appointment.end,
      },
    }),

  closeBooking: () => set({ mode: 'closed', draft: null, availability: null }),
  patchDraft: (patch) =>
    set((state) => {
      if (!state.draft) return state
      return { draft: { ...state.draft, ...patch } }
    }),
  setAvailability: (availability) => set({ availability }),
  setCheckingAvailability: (checkingAvailability) => set({ checkingAvailability }),
}))
