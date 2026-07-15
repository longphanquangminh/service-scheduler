import { useEffect } from 'react'
import { addDays, endOfWeek, startOfWeek } from 'date-fns'
import { api } from '../api/client'
import { isValidBookingRange, validateBookingRange } from '../domain/time'
import { useSchedulerStore } from '../store/schedulerStore'

export function useBootstrapCatalog() {
  const setCatalog = useSchedulerStore((s) => s.setCatalog)
  const setAppointments = useSchedulerStore((s) => s.setAppointments)
  const setLoading = useSchedulerStore((s) => s.setLoading)
  const setError = useSchedulerStore((s) => s.setError)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const [dealership, vehicles, serviceTypes, bays, technicians] = await Promise.all([
          api.getDealership(),
          api.getVehicles(),
          api.getServiceTypes(),
          api.getBays('dealer-d7'),
          api.getTechnicians('dealer-d7'),
        ])
        if (cancelled) return
        setCatalog({ dealership, vehicles, serviceTypes, bays, technicians })

        const today = new Date()
        const from = startOfWeek(addDays(today, -7), { weekStartsOn: 1 }).toISOString()
        const to = endOfWeek(addDays(today, 7), { weekStartsOn: 1 }).toISOString()
        const appointments = await api.getAppointments(dealership.id, from, to)
        if (cancelled) return
        setAppointments(appointments)
        setError(null)
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [setAppointments, setCatalog, setError, setLoading])
}

export function useAvailabilityChecker() {
  const draft = useSchedulerStore((s) => s.draft)
  const mode = useSchedulerStore((s) => s.mode)
  const dealership = useSchedulerStore((s) => s.dealership)
  const setAvailability = useSchedulerStore((s) => s.setAvailability)
  const setCheckingAvailability = useSchedulerStore((s) => s.setCheckingAvailability)
  const patchDraft = useSchedulerStore((s) => s.patchDraft)

  useEffect(() => {
    if (mode === 'closed' || !draft || !dealership) return

    // Keep typed values; do not rewrite. Surface validation locally.
    if (!isValidBookingRange(draft.start, draft.end)) {
      const issues = validateBookingRange(draft.start, draft.end)
      setCheckingAvailability(false)
      setAvailability({
        ok: false,
        start: draft.start,
        end: draft.end,
        availableBayIds: [],
        availableTechnicianIds: [],
        conflicts: issues.map((i) => ({
          resourceType: 'duration' as const,
          message: i.message,
        })),
      })
      return
    }

    const handle = window.setTimeout(async () => {
      try {
        setCheckingAvailability(true)
        const result = await api.checkAvailability({
          dealershipId: dealership.id,
          serviceTypeId: draft.serviceTypeId,
          start: draft.start,
          end: draft.end,
          excludeAppointmentId: draft.appointmentId,
        })

        const bayOk = draft.bayId && result.availableBayIds.includes(draft.bayId)
        const techOk =
          draft.technicianId && result.availableTechnicianIds.includes(draft.technicianId)

        const nextBay = bayOk ? draft.bayId : (result.recommendedBayId ?? draft.bayId)
        const nextTech = techOk
          ? draft.technicianId
          : (result.recommendedTechnicianId ?? draft.technicianId)

        const withPrefs =
          nextBay !== draft.bayId || nextTech !== draft.technicianId
            ? await api.checkAvailability({
                dealershipId: dealership.id,
                serviceTypeId: draft.serviceTypeId,
                start: draft.start,
                end: draft.end,
                preferredBayId: nextBay || undefined,
                preferredTechnicianId: nextTech || undefined,
                excludeAppointmentId: draft.appointmentId,
              })
            : result

        setAvailability(withPrefs)
        if (nextBay !== draft.bayId || nextTech !== draft.technicianId) {
          patchDraft({ bayId: nextBay, technicianId: nextTech })
        }
      } catch (e) {
        setAvailability({
          ok: false,
          start: draft.start,
          end: draft.end,
          availableBayIds: [],
          availableTechnicianIds: [],
          conflicts: [{ resourceType: 'hours', message: (e as Error).message }],
        })
      } finally {
        setCheckingAvailability(false)
      }
    }, 280)

    return () => window.clearTimeout(handle)
  }, [
    dealership,
    draft?.appointmentId,
    draft?.bayId,
    draft?.end,
    draft?.serviceTypeId,
    draft?.start,
    draft?.technicianId,
    mode,
    patchDraft,
    setAvailability,
    setCheckingAvailability,
  ])
}
