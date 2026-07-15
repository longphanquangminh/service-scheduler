export type ISODateTime = string

export interface Dealership {
  id: string
  name: string
  timezone: string
  openHour: number
  closeHour: number
}

export interface ServiceBay {
  id: string
  dealershipId: string
  name: string
  label: string
}

export interface Technician {
  id: string
  dealershipId: string
  name: string
  skills: string[]
}

export interface Vehicle {
  id: string
  plate: string
  make: string
  model: string
  year: number
  customerId: string
  customerName: string
  customerPhone: string
}

export interface ServiceType {
  id: string
  name: string
  durationMinutes: number
  requiredSkills: string[]
}

export interface Appointment {
  id: string
  dealershipId: string
  vehicleId: string
  serviceTypeId: string
  bayId: string
  technicianId: string
  start: ISODateTime
  end: ISODateTime
  status: 'confirmed' | 'cancelled'
  createdAt: ISODateTime
  updatedAt: ISODateTime
  createdBy?: 'advisor' | 'other_user_sim'
}

export interface AppointmentView extends Appointment {
  vehicleLabel: string
  serviceLabel: string
  bayLabel: string
  technicianName: string
  customerName: string
  durationMinutes: number
}

export interface AvailabilityRequest {
  dealershipId: string
  serviceTypeId: string
  start: ISODateTime
  end?: ISODateTime
  preferredBayId?: string
  preferredTechnicianId?: string
  excludeAppointmentId?: string
}

export interface ResourceConflict {
  resourceType: 'bay' | 'technician' | 'skill' | 'hours' | 'duration'
  resourceId?: string
  message: string
}

export interface AvailabilityResponse {
  ok: boolean
  start: ISODateTime
  end: ISODateTime
  availableBayIds: string[]
  availableTechnicianIds: string[]
  recommendedBayId?: string
  recommendedTechnicianId?: string
  conflicts: ResourceConflict[]
}

export interface CreateAppointmentRequest {
  dealershipId: string
  vehicleId: string
  serviceTypeId: string
  bayId: string
  technicianId: string
  start: ISODateTime
  end: ISODateTime
  createdBy?: Appointment['createdBy']
}

export interface UpdateAppointmentRequest {
  start?: ISODateTime
  end?: ISODateTime
  bayId?: string
  technicianId?: string
}

/** Another advisor’s in-progress calendar selection (create/edit draft). */
export interface RemotePending {
  sessionId: string
  label: string
  color: string
  start: ISODateTime
  end: ISODateTime
  mode: 'create' | 'edit'
  /** Present when mode is edit — other tabs highlight this booking instead of a ghost box. */
  appointmentId?: string
  updatedAt: ISODateTime
}

/** Client → mock WS server (relayed to other tabs). */
export type PendingClientMessage =
  | { type: 'pending.publish'; pending: RemotePending }
  | { type: 'pending.clear'; sessionId: string }

export type LiveEvent =
  | { type: 'appointment.created'; appointment: AppointmentView }
  | { type: 'appointment.updated'; appointment: AppointmentView }
  | { type: 'appointment.deleted'; appointmentId: string }
  | { type: 'connected'; at: ISODateTime }
  | { type: 'pending.updated'; pending: RemotePending }
  | { type: 'pending.cleared'; sessionId: string }
  | { type: 'pending.snapshot'; pendings: RemotePending[] }
