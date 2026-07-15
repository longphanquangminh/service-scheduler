import { useMemo, useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type {
  DateSelectArg,
  EventClickArg,
  EventDropArg,
  EventInput,
} from '@fullcalendar/core'
import type { EventResizeDoneArg } from '@fullcalendar/interaction'
import { format } from 'date-fns'
import { api } from '../api/client'
import {
  isRemotePendingEventId,
  remotePendingEventId,
} from '../domain/presence'
import { durationLabel, isValidBookingRange, PENDING_EVENT_ID, meetsMinDuration, sameCalendarDay } from '../domain/time'
import { recordEvent, withSpan } from '../observability/tracing'
import { useSchedulerStore } from '../store/schedulerStore'

const BAY_COLORS: Record<string, string> = {
  'bay-1': '#3d9cf0',
  'bay-2': '#2dd4a8',
  'bay-3': '#f0b429',
}

export function SchedulerCalendar() {
  const calendarRef = useRef<FullCalendar | null>(null)
  const appointments = useSchedulerStore((s) => s.appointments)
  const dealership = useSchedulerStore((s) => s.dealership)
  const mode = useSchedulerStore((s) => s.mode)
  const draft = useSchedulerStore((s) => s.draft)
  const availability = useSchedulerStore((s) => s.availability)
  const remotePendings = useSchedulerStore((s) => s.remotePendings)
  const openCreate = useSchedulerStore((s) => s.openCreate)
  const openEdit = useSchedulerStore((s) => s.openEdit)
  const patchDraft = useSchedulerStore((s) => s.patchDraft)
  const upsertAppointment = useSchedulerStore((s) => s.upsertAppointment)
  const setToast = useSchedulerStore((s) => s.setToast)
  const setError = useSchedulerStore((s) => s.setError)

  const events: EventInput[] = useMemo(() => {
    const editingId = mode === 'edit' ? draft?.appointmentId : undefined
    const conflict = availability != null && !availability.ok

    const remoteEditsByAppt = new Map<string, (typeof remotePendings)[string]>()
    const remoteCreates: Array<(typeof remotePendings)[string]> = []
    for (const remote of Object.values(remotePendings)) {
      if (remote.mode === 'edit' && remote.appointmentId) {
        remoteEditsByAppt.set(remote.appointmentId, remote)
      } else {
        remoteCreates.push(remote)
      }
    }

    const confirmed: EventInput[] = appointments.map((a) => {
      const isLocalEditing = editingId != null && a.id === editingId
      const remoteEdit = !isLocalEditing ? remoteEditsByAppt.get(a.id) : undefined

      if (isLocalEditing && draft) {
        const bayColor = BAY_COLORS[draft.bayId || a.bayId] ?? '#6b7c93'
        return {
          id: a.id,
          title: conflict
            ? `Editing · conflict\n${a.vehicleLabel}`
            : `Editing · selected\n${a.vehicleLabel}`,
          start: draft.start,
          end: draft.end,
          backgroundColor: conflict ? 'rgba(240, 113, 120, 0.9)' : bayColor,
          borderColor: conflict ? '#f07178' : '#fff6e8',
          textColor: '#041018',
          classNames: conflict
            ? ['editing-selection', 'editing-selection--conflict']
            : ['editing-selection'],
          editable: true,
          extendedProps: { appointment: a, kind: 'editing' },
        }
      }

      if (remoteEdit) {
        return {
          id: a.id,
          title: `${remoteEdit.label} · editing\n${a.vehicleLabel}`,
          start: remoteEdit.start,
          end: remoteEdit.end,
          backgroundColor: `${remoteEdit.color}dd`,
          borderColor: remoteEdit.color,
          textColor: '#0a0a0a',
          classNames: ['remote-editing'],
          editable: false,
          startEditable: false,
          durationEditable: false,
          extendedProps: { appointment: a, kind: 'remote-editing', remote: remoteEdit },
        }
      }

      return {
        id: a.id,
        title: `${a.vehicleLabel}\n${a.serviceLabel} · ${a.bayLabel}`,
        start: a.start,
        end: a.end,
        backgroundColor: BAY_COLORS[a.bayId] ?? '#6b7c93',
        borderColor: BAY_COLORS[a.bayId] ?? '#6b7c93',
        editable: true,
        extendedProps: { appointment: a, kind: 'confirmed' },
      }
    })

    // Create/select ghosts only — remote edit highlights the booked event above
    for (const remote of remoteCreates) {
      confirmed.push({
        id: remotePendingEventId(remote.sessionId),
        title: `${remote.label} · selecting\n${durationLabel(remote.start, remote.end)}`,
        start: remote.start,
        end: remote.end,
        display: 'block',
        backgroundColor: `${remote.color}cc`,
        borderColor: remote.color,
        textColor: '#0a0a0a',
        classNames: ['remote-pending'],
        editable: false,
        startEditable: false,
        durationEditable: false,
        overlap: true,
        extendedProps: { kind: 'remote-pending', remote },
      })
    }

    // Create-only ghost: edit uses highlight on the booked event itself
    if (mode === 'create' && draft && isValidBookingRange(draft.start, draft.end)) {
      confirmed.push({
        id: PENDING_EVENT_ID,
        title: conflict
          ? `Pending · conflict (${durationLabel(draft.start, draft.end)})`
          : `Pending selection (${durationLabel(draft.start, draft.end)})`,
        start: draft.start,
        end: draft.end,
        display: 'block',
        backgroundColor: conflict ? 'rgba(240, 113, 120, 0.82)' : 'rgba(61, 156, 240, 0.82)',
        borderColor: conflict ? '#f07178' : '#7ec4ff',
        textColor: '#041018',
        classNames: conflict
          ? ['pending-selection', 'pending-selection--conflict']
          : ['pending-selection'],
        editable: true,
        overlap: true,
        extendedProps: { kind: 'pending', conflict },
      })
    }

    return confirmed
  }, [appointments, availability, draft, mode, remotePendings])

  const onSelect = (info: DateSelectArg) => {
    if (!sameCalendarDay(info.start, info.end)) {
      info.view.calendar.unselect()
      setToast('Bookings must stay on a single day')
      return
    }
    if (!meetsMinDuration(info.start, info.end)) {
      info.view.calendar.unselect()
      setToast('Minimum booking duration is 30 minutes')
      return
    }
    openCreate({
      start: info.start.toISOString(),
      end: info.end.toISOString(),
    })
    info.view.calendar.unselect()
  }

  const onEventClick = (info: EventClickArg) => {
    if (info.event.id === PENDING_EVENT_ID || isRemotePendingEventId(info.event.id)) return
    // Another advisor is editing this booking — don't steal the draft
    if (info.event.extendedProps.kind === 'remote-editing') {
      setToast(`${info.event.extendedProps.remote.label} is editing this booking`)
      return
    }
    openEdit(info.event.extendedProps.appointment)
  }

  const persistMove = async (
    id: string,
    start: Date,
    end: Date,
    revert: () => void,
  ) => {
    if (!sameCalendarDay(start, end)) {
      revert()
      setToast('Cannot span multiple days')
      return
    }
    if (!meetsMinDuration(start, end)) {
      revert()
      setToast('Minimum booking duration is 30 minutes')
      return
    }
    try {
      await withSpan(
        'calendar.reschedule',
        { 'app.appointment_id': id, 'app.reverted': false },
        async (span) => {
          const updated = await api.updateAppointment(id, {
            start: start.toISOString(),
            end: end.toISOString(),
          })
          upsertAppointment(updated)
          span.setAttribute('app.appointment_id', updated.id)
          setToast(`Rescheduled to ${format(start, 'EEE HH:mm')}–${format(end, 'HH:mm')}`)
          setError(null)
        },
      )
    } catch (e) {
      revert()
      recordEvent('calendar.reschedule_reverted', { 'app.appointment_id': id })
      const err = e as Error & { details?: { conflicts?: { message: string }[] } }
      const detail = err.details?.conflicts?.[0]?.message
      setToast(detail ? `Move blocked: ${detail}` : err.message)
    }
  }

  const onEventDrop = (info: EventDropArg) => {
    if (isRemotePendingEventId(info.event.id) || info.event.extendedProps.kind === 'remote-editing') {
      info.revert()
      return
    }
    if (!info.event.start || !info.event.end) {
      info.revert()
      return
    }
    // Block moving to another calendar day
    if (info.oldEvent.start && !sameCalendarDay(info.oldEvent.start, info.event.start)) {
      info.revert()
      setToast('Cannot move appointments to another day')
      return
    }
    if (!sameCalendarDay(info.event.start, info.event.end)) {
      info.revert()
      setToast('Cannot span multiple days')
      return
    }
    if (!meetsMinDuration(info.event.start, info.event.end)) {
      info.revert()
      setToast('Minimum booking duration is 30 minutes')
      return
    }
    if (info.event.id === PENDING_EVENT_ID) {
      patchDraft({
        start: info.event.start.toISOString(),
        end: info.event.end.toISOString(),
      })
      return
    }
    // While edit panel is open, drag/resize the selected booking updates the draft only
    if (mode === 'edit' && draft?.appointmentId === info.event.id) {
      patchDraft({
        start: info.event.start.toISOString(),
        end: info.event.end.toISOString(),
      })
      return
    }
    void persistMove(info.event.id, info.event.start, info.event.end, info.revert)
  }

  const onEventResize = (info: EventResizeDoneArg) => {
    if (isRemotePendingEventId(info.event.id) || info.event.extendedProps.kind === 'remote-editing') {
      info.revert()
      return
    }
    if (!info.event.start || !info.event.end) {
      info.revert()
      return
    }
    if (!sameCalendarDay(info.event.start, info.event.end)) {
      info.revert()
      setToast('Cannot resize across days')
      return
    }
    if (!meetsMinDuration(info.event.start, info.event.end)) {
      info.revert()
      setToast('Minimum booking duration is 30 minutes')
      return
    }
    if (info.event.id === PENDING_EVENT_ID) {
      patchDraft({
        start: info.event.start.toISOString(),
        end: info.event.end.toISOString(),
      })
      return
    }
    if (mode === 'edit' && draft?.appointmentId === info.event.id) {
      patchDraft({
        start: info.event.start.toISOString(),
        end: info.event.end.toISOString(),
      })
      return
    }
    void persistMove(info.event.id, info.event.start, info.event.end, info.revert)
  }

  return (
    <div className="calendar-shell">
      <div className="calendar-toolbar">
        <div>
          <h2>Service bay timeline</h2>
          <p>
            Week view · Drag-select pending (min 30 min) · Open a 2nd tab to see shared pending via
            WebSocket · No cross-day drag
          </p>
        </div>
        <div className="calendar-legend">
          <span>
            <i style={{ background: BAY_COLORS['bay-1'] }} /> Bay 1
          </span>
          <span>
            <i style={{ background: BAY_COLORS['bay-2'] }} /> Bay 2
          </span>
          <span>
            <i style={{ background: BAY_COLORS['bay-3'] }} /> Bay 3
          </span>
          <span>
            <i className="pending-dot" /> Your pending
          </span>
          <span>
            <i className="remote-pending-dot" /> Others’ pending
          </span>
        </div>
      </div>
      <div className="calendar-scroller">
        <FullCalendar
          ref={calendarRef}
          plugins={[timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          initialDate={new Date()}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'timeGridWeek,timeGridDay',
          }}
          height="auto"
          expandRows
          allDaySlot={false}
          slotMinTime={`${String(dealership?.openHour ?? 8).padStart(2, '0')}:00:00`}
          slotMaxTime={`${String(dealership?.closeHour ?? 17).padStart(2, '0')}:00:00`}
          slotDuration="00:30:00"
          snapDuration="00:30:00"
          weekends={false}
          nowIndicator
          selectable
          selectMirror
          selectOverlap
          slotEventOverlap
          selectAllow={(span) =>
            sameCalendarDay(span.start, span.end) && meetsMinDuration(span.start, span.end)
          }
          editable
          eventStartEditable
          eventDurationEditable
          eventOverlap
          eventAllow={(span) =>
            sameCalendarDay(span.start, span.end) && meetsMinDuration(span.start, span.end)
          }
          events={events}
          select={onSelect}
          eventClick={onEventClick}
          eventDrop={onEventDrop}
          eventResize={onEventResize}
          eventDidMount={(info) => {
            if (
              info.event.id === PENDING_EVENT_ID ||
              info.el.classList.contains('fc-event-mirror') ||
              info.el.classList.contains('editing-selection') ||
              info.el.classList.contains('remote-editing') ||
              isRemotePendingEventId(info.event.id)
            ) {
              info.el.style.zIndex = '8'
            }
          }}
          eventClassNames={(arg) =>
            arg.isMirror ? ['pending-selection', 'pending-selection--mirror'] : []
          }
          slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          dayHeaderFormat={{ weekday: 'short', day: 'numeric', month: 'short' }}
        />
      </div>
    </div>
  )
}
