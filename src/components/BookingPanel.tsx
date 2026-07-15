import { format, parseISO } from 'date-fns'
import { api } from '../api/client'
import { durationLabel, validateBookingRange } from '../domain/time'
import { useAvailabilityChecker } from '../hooks/useSchedulerData'
import { useSchedulerStore } from '../store/schedulerStore'

/** Parse datetime-local value as local wall time → ISO (no silent rewriting). */
function localInputToIso(value: string): string {
  const [datePart, timePart] = value.split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  const [hh, mm] = timePart.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString()
}

function isoToLocalInputValue(iso: string): string {
  const d = parseISO(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function BookingPanel() {
  useAvailabilityChecker()

  const mode = useSchedulerStore((s) => s.mode)
  const draft = useSchedulerStore((s) => s.draft)
  const vehicles = useSchedulerStore((s) => s.vehicles)
  const serviceTypes = useSchedulerStore((s) => s.serviceTypes)
  const bays = useSchedulerStore((s) => s.bays)
  const technicians = useSchedulerStore((s) => s.technicians)
  const availability = useSchedulerStore((s) => s.availability)
  const checking = useSchedulerStore((s) => s.checkingAvailability)
  const saving = useSchedulerStore((s) => s.saving)
  const dealership = useSchedulerStore((s) => s.dealership)
  const patchDraft = useSchedulerStore((s) => s.patchDraft)
  const closeBooking = useSchedulerStore((s) => s.closeBooking)
  const setSaving = useSchedulerStore((s) => s.setSaving)
  const upsertAppointment = useSchedulerStore((s) => s.upsertAppointment)
  const removeAppointment = useSchedulerStore((s) => s.removeAppointment)
  const setToast = useSchedulerStore((s) => s.setToast)

  if (mode === 'closed' || !draft) return null

  const service = serviceTypes.find((s) => s.id === draft.serviceTypeId)
  const rangeIssues = validateBookingRange(draft.start, draft.end)
  const rangeOk = rangeIssues.length === 0
  const canSubmit = rangeOk && !!availability?.ok && !saving && !checking

  const rangeLabel = rangeOk
    ? `${format(parseISO(draft.start), 'EEE, d MMM · HH:mm')} – ${format(parseISO(draft.end), 'HH:mm')}`
    : `${format(parseISO(draft.start), 'EEE, d MMM · HH:mm')} – ${format(parseISO(draft.end), 'HH:mm')} (invalid)`

  const onConfirm = async () => {
    if (!dealership || !canSubmit) return
    try {
      setSaving(true)
      if (mode === 'create') {
        const created = await api.createAppointment({
          dealershipId: dealership.id,
          vehicleId: draft.vehicleId,
          serviceTypeId: draft.serviceTypeId,
          bayId: draft.bayId,
          technicianId: draft.technicianId,
          start: draft.start,
          end: draft.end,
          createdBy: 'advisor',
        })
        upsertAppointment(created)
        setToast(`Appointment confirmed for ${created.vehicleLabel}`)
      } else if (draft.appointmentId) {
        const updated = await api.updateAppointment(draft.appointmentId, {
          start: draft.start,
          end: draft.end,
          bayId: draft.bayId,
          technicianId: draft.technicianId,
        })
        upsertAppointment(updated)
        setToast('Appointment updated')
      }
      closeBooking()
    } catch (e) {
      const err = e as Error & { details?: { conflicts?: { message: string }[] } }
      setToast(err.details?.conflicts?.[0]?.message ?? err.message)
    } finally {
      setSaving(false)
    }
  }

  const onDelete = async () => {
    if (!draft.appointmentId) return
    if (!window.confirm('Cancel this appointment?')) return
    try {
      setSaving(true)
      await api.deleteAppointment(draft.appointmentId)
      removeAppointment(draft.appointmentId)
      setToast('Appointment cancelled')
      closeBooking()
    } catch (e) {
      setToast((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <aside className="booking-panel" aria-label="Booking panel">
      <div className="booking-panel__head">
        <div>
          <p className="eyebrow">
            {mode === 'create' ? 'Pending booking' : 'Edit appointment'}
          </p>
          <h2>{rangeLabel}</h2>
          <p className="muted">
            Duration {durationLabel(draft.start, draft.end)} (min 30 min)
            {service ? ` · ${service.name}` : ''}
          </p>
        </div>
        <button type="button" className="icon-btn" onClick={closeBooking} aria-label="Close">
          ×
        </button>
      </div>

      <label className="field">
        <span>Vehicle</span>
        <select
          value={draft.vehicleId}
          disabled={mode === 'edit'}
          onChange={(e) => patchDraft({ vehicleId: e.target.value })}
        >
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.plate} · {v.year} {v.make} {v.model}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Service type</span>
        <select
          value={draft.serviceTypeId}
          disabled={mode === 'edit'}
          onChange={(e) => patchDraft({ serviceTypeId: e.target.value })}
        >
          {serviceTypes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <label className={`field ${!rangeOk ? 'field--error' : ''}`}>
        <span>Start time</span>
        <input
          type="datetime-local"
          value={isoToLocalInputValue(draft.start)}
          onChange={(e) => {
            const value = e.target.value
            if (!value) return
            patchDraft({ start: localInputToIso(value) })
          }}
        />
      </label>

      <label className={`field ${!rangeOk ? 'field--error' : ''}`}>
        <span>End time</span>
        <input
          type="datetime-local"
          value={isoToLocalInputValue(draft.end)}
          onChange={(e) => {
            const value = e.target.value
            if (!value) return
            patchDraft({ end: localInputToIso(value) })
          }}
        />
      </label>

      {rangeIssues.length > 0 && (
        <div className="availability bad" role="alert">
          <strong>Invalid time range</strong>
          <ul>
            {rangeIssues.map((issue) => (
              <li key={issue.code}>{issue.message}</li>
            ))}
          </ul>
          <p>Adjust the times — values are not auto-corrected.</p>
        </div>
      )}

      <label className="field">
        <span>Service bay</span>
        <select value={draft.bayId} onChange={(e) => patchDraft({ bayId: e.target.value })}>
          {bays.map((b) => (
            <option
              key={b.id}
              value={b.id}
              disabled={rangeOk && !!availability && !availability.availableBayIds.includes(b.id)}
            >
              {b.label}
              {rangeOk && availability && !availability.availableBayIds.includes(b.id)
                ? ' · busy'
                : ''}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Technician</span>
        <select
          value={draft.technicianId}
          onChange={(e) => patchDraft({ technicianId: e.target.value })}
        >
          {technicians.map((t) => (
            <option
              key={t.id}
              value={t.id}
              disabled={
                rangeOk && !!availability && !availability.availableTechnicianIds.includes(t.id)
              }
            >
              {t.name} ({t.skills.join(', ')})
              {rangeOk && availability && !availability.availableTechnicianIds.includes(t.id)
                ? ' · unavailable'
                : ''}
            </option>
          ))}
        </select>
      </label>

      {rangeOk && (
        <div
          className={`availability ${availability?.ok ? 'ok' : availability ? 'bad' : 'pending'}`}
          role="status"
        >
          {checking || !availability ? (
            <strong>Checking bay + technician for this start–end window…</strong>
          ) : availability.ok ? (
            <>
              <strong>Availability OK</strong>
              <p>
                {format(parseISO(availability.start), 'HH:mm')}–
                {format(parseISO(availability.end), 'HH:mm')} · bay and qualified technician free for
                the selected window.
              </p>
            </>
          ) : (
            <>
              <strong>Pending — cannot confirm yet</strong>
              <p>Form stays open so you can adjust start/end or resources.</p>
              <ul>
                {availability.conflicts.map((c, i) => (
                  <li key={`${c.resourceType}-${i}`}>{c.message}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <div className="booking-actions">
        <button
          type="button"
          className="btn primary"
          disabled={!canSubmit}
          onClick={() => void onConfirm()}
        >
          {saving ? 'Saving…' : mode === 'create' ? 'Confirm booking' : 'Save changes'}
        </button>
        {mode === 'edit' && (
          <button type="button" className="btn danger" disabled={saving} onClick={() => void onDelete()}>
            Cancel appointment
          </button>
        )}
        <button type="button" className="btn ghost" onClick={closeBooking}>
          Close
        </button>
      </div>
    </aside>
  )
}
