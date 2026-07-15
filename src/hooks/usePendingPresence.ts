import { useEffect } from 'react'
import { getSessionId, sessionColor, sessionLabel } from '../domain/presence'
import { isValidBookingRange } from '../domain/time'
import { clearPendingPresence, publishPendingPresence } from '../lib/liveSocket'
import { useSchedulerStore } from '../store/schedulerStore'

/**
 * Publishes local draft range as pending presence so other open tabs
 * see the selection in real time (BroadcastChannel + WS + `.runtime-data/pending.json`).
 */
export function usePendingPresence() {
  const mode = useSchedulerStore((s) => s.mode)
  const draft = useSchedulerStore((s) => s.draft)
  const liveStatus = useSchedulerStore((s) => s.liveStatus)

  useEffect(() => {
    const sessionId = getSessionId()

    if (mode === 'closed' || !draft || !isValidBookingRange(draft.start, draft.end)) {
      clearPendingPresence(sessionId)
      return
    }

    const timer = window.setTimeout(() => {
      publishPendingPresence({
        sessionId,
        label: sessionLabel(sessionId),
        color: sessionColor(sessionId),
        start: draft.start,
        end: draft.end,
        mode: mode === 'edit' ? 'edit' : 'create',
        appointmentId: mode === 'edit' ? draft.appointmentId : undefined,
        updatedAt: new Date().toISOString(),
      })
    }, 40)

    return () => window.clearTimeout(timer)
  }, [draft?.appointmentId, draft?.end, draft?.start, liveStatus, mode])

  useEffect(() => {
    const sessionId = getSessionId()
    const clear = () => clearPendingPresence(sessionId)
    window.addEventListener('beforeunload', clear)
    return () => {
      window.removeEventListener('beforeunload', clear)
      clear()
    }
  }, [])
}
