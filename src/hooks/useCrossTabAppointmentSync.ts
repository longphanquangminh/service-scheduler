import { useEffect } from 'react'
import { addDays, endOfWeek, startOfWeek } from 'date-fns'
import { api } from '../api/client'
import {
  getLocalSaveMode,
  localStorageKeyFor,
  RUNTIME_APPOINTMENTS_FILE,
  RUNTIME_SYNC_CHANNEL,
} from '../mocks/runtimeApi'
import { useSchedulerStore } from '../store/schedulerStore'

/**
 * When another tab persists appointments (runtime JSON or localStorage), refresh this tab’s calendar.
 */
export function useCrossTabAppointmentSync() {
  const dealership = useSchedulerStore((s) => s.dealership)
  const setAppointments = useSchedulerStore((s) => s.setAppointments)

  useEffect(() => {
    if (!dealership) return

    const refresh = async () => {
      const today = new Date()
      const from = startOfWeek(addDays(today, -7), { weekStartsOn: 1 }).toISOString()
      const to = endOfWeek(addDays(today, 7), { weekStartsOn: 1 }).toISOString()
      const appointments = await api.getAppointments(dealership.id, from, to)
      setAppointments(appointments)
    }

    let channel: BroadcastChannel | null = null
    try {
      channel = new BroadcastChannel(RUNTIME_SYNC_CHANNEL)
      channel.addEventListener('message', (message) => {
        const data = message.data as { type?: string } | undefined
        if (data?.type !== 'appointments.changed') return
        void refresh()
      })
    } catch {
      channel = null
    }

    const appointmentsLsKey = localStorageKeyFor(RUNTIME_APPOINTMENTS_FILE)
    const onStorage = (event: StorageEvent) => {
      if (getLocalSaveMode() !== 'localstorage') return
      if (event.key !== appointmentsLsKey) return
      void refresh()
    }
    window.addEventListener('storage', onStorage)

    return () => {
      channel?.close()
      window.removeEventListener('storage', onStorage)
    }
  }, [dealership, setAppointments])
}
