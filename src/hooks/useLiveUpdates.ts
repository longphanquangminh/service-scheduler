import { useEffect } from 'react'
import { getSessionId } from '../domain/presence'
import type { AppointmentView, LiveEvent, RemotePending } from '../domain/types'
import { bindLiveSocket, subscribePendingPresence } from '../lib/liveSocket'
import { WS_URL } from '../mocks/wsUrl'
import { recordEvent } from '../observability/tracing'
import { useSchedulerStore } from '../store/schedulerStore'

type LiveActions = {
  upsertAppointment: (appointment: AppointmentView) => void
  removeAppointment: (id: string) => void
  upsertRemotePending: (pending: RemotePending) => void
  removeRemotePending: (sessionId: string) => void
  setRemotePendings: (pendings: RemotePending[]) => void
  setToast: (toast: string | null) => void
}

function applyLiveEvent(event: LiveEvent, selfId: string, actions: LiveActions) {
  if (event.type === 'appointment.created') {
    actions.upsertAppointment(event.appointment)
    if (event.appointment.createdBy === 'other_user_sim') {
      actions.setToast(`Live update: another advisor booked ${event.appointment.vehicleLabel}`)
    }
    return
  }
  if (event.type === 'appointment.updated') {
    actions.upsertAppointment(event.appointment)
    return
  }
  if (event.type === 'appointment.deleted') {
    actions.removeAppointment(event.appointmentId)
    actions.setToast('Live update: an appointment was cancelled')
    return
  }
  if (event.type === 'pending.updated') {
    if (event.pending.sessionId === selfId) return
    actions.upsertRemotePending(event.pending)
    return
  }
  if (event.type === 'pending.cleared') {
    if (event.sessionId === selfId) return
    actions.removeRemotePending(event.sessionId)
    return
  }
  if (event.type === 'pending.snapshot') {
    actions.setRemotePendings(event.pendings.filter((p) => p.sessionId !== selfId))
  }
}

export function useLiveUpdates() {
  const upsertAppointment = useSchedulerStore((s) => s.upsertAppointment)
  const removeAppointment = useSchedulerStore((s) => s.removeAppointment)
  const upsertRemotePending = useSchedulerStore((s) => s.upsertRemotePending)
  const removeRemotePending = useSchedulerStore((s) => s.removeRemotePending)
  const setRemotePendings = useSchedulerStore((s) => s.setRemotePendings)
  const setLiveStatus = useSchedulerStore((s) => s.setLiveStatus)
  const setToast = useSchedulerStore((s) => s.setToast)

  useEffect(() => {
    let socket: WebSocket | null = null
    let closed = false
    let retry = 0
    let retryTimer: number | undefined
    const selfId = getSessionId()
    const actions: LiveActions = {
      upsertAppointment,
      removeAppointment,
      upsertRemotePending,
      removeRemotePending,
      setRemotePendings,
      setToast,
    }

    const onEvent = (event: LiveEvent) => {
      recordEvent('ws.message', { 'app.event_type': event.type })
      applyLiveEvent(event, selfId, actions)
    }

    // Reliable same-browser multi-tab path (MSW WS cross-tab broadcast is flaky)
    const unsubscribePresence = subscribePendingPresence(onEvent)

    const connect = () => {
      if (closed) return
      setLiveStatus('connecting')
      socket = new WebSocket(WS_URL)
      bindLiveSocket(socket)

      socket.addEventListener('open', () => {
        const wasRetry = retry > 0
        retry = 0
        setLiveStatus('live')
        recordEvent(wasRetry ? 'ws.reconnect' : 'ws.connect', { 'app.channel': 'appointments' })
      })

      socket.addEventListener('message', (message) => {
        try {
          onEvent(JSON.parse(String(message.data)) as LiveEvent)
        } catch {
          // ignore malformed payloads in demo
        }
      })

      socket.addEventListener('close', () => {
        bindLiveSocket(null)
        setLiveStatus('offline')
        if (closed) return
        retry += 1
        const wait = Math.min(8000, 500 * 2 ** retry)
        retryTimer = window.setTimeout(connect, wait)
      })

      socket.addEventListener('error', () => {
        socket?.close()
      })
    }

    connect()

    return () => {
      closed = true
      unsubscribePresence()
      if (retryTimer) window.clearTimeout(retryTimer)
      bindLiveSocket(null)
      socket?.close()
    }
  }, [
    removeAppointment,
    removeRemotePending,
    setLiveStatus,
    setRemotePendings,
    setToast,
    upsertAppointment,
    upsertRemotePending,
  ])
}
