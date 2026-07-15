import { addHours } from 'date-fns'
import { api } from '../api/client'
import { MIN_DURATION_MINUTES } from '../domain/time'
import { useSchedulerStore } from '../store/schedulerStore'

export function AppHeader() {
  const dealership = useSchedulerStore((s) => s.dealership)
  const liveStatus = useSchedulerStore((s) => s.liveStatus)
  const openCreate = useSchedulerStore((s) => s.openCreate)
  const setToast = useSchedulerStore((s) => s.setToast)
  const serviceTypes = useSchedulerStore((s) => s.serviceTypes)
  const vehicles = useSchedulerStore((s) => s.vehicles)

  const onNew = () => {
    const start = new Date()
    start.setMinutes(0, 0, 0)
    if (start.getHours() < 8) start.setHours(9)
    if (start.getHours() >= 17) {
      start.setDate(start.getDate() + 1)
      start.setHours(9)
    }
    const end = addHours(start, 1)
    // Prefer at least minimum duration; 1h default for header CTA is fine
    if (end.getTime() - start.getTime() < MIN_DURATION_MINUTES * 60_000) {
      end.setMinutes(start.getMinutes() + MIN_DURATION_MINUTES)
    }
    openCreate({
      start: start.toISOString(),
      end: end.toISOString(),
      vehicleId: vehicles[0]?.id,
      serviceTypeId: serviceTypes[0]?.id,
    })
  }

  const onSimulate = async () => {
    try {
      const res = await api.simulateOtherUser()
      setToast(res.message)
    } catch (e) {
      setToast((e as Error).message)
    }
  }

  return (
    <header className="app-header">
      <div className="brand">
        <p className="eyebrow">Keyloop · Scenario A</p>
        <h1>Unified Service Scheduler</h1>
        <p className="muted">{dealership?.name ?? 'Loading dealership…'}</p>
      </div>
      <div className="header-actions">
        <span className={`live-pill live-pill--${liveStatus}`} title="Mock WebSocket · appointments + shared pending">
          {liveStatus === 'live' ? 'LIVE · WS' : liveStatus === 'connecting' ? 'CONNECTING' : 'OFFLINE'}
        </span>
        <button type="button" className="btn ghost" onClick={() => void onSimulate()}>
          Simulate other advisor
        </button>
        <button type="button" className="btn primary" onClick={onNew}>
          New appointment
        </button>
      </div>
    </header>
  )
}
