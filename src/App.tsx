import { AppHeader } from './components/AppHeader'
import { BookingPanel } from './components/BookingPanel'
import { SchedulerCalendar } from './components/SchedulerCalendar'
import { Toast } from './components/Toast'
import { useCrossTabAppointmentSync } from './hooks/useCrossTabAppointmentSync'
import { useBootstrapCatalog } from './hooks/useSchedulerData'
import { useLiveUpdates } from './hooks/useLiveUpdates'
import { usePendingPresence } from './hooks/usePendingPresence'
import { useSchedulerStore } from './store/schedulerStore'

export default function App() {
  useBootstrapCatalog()
  useLiveUpdates()
  usePendingPresence()
  useCrossTabAppointmentSync()

  const loading = useSchedulerStore((s) => s.loading)
  const error = useSchedulerStore((s) => s.error)
  const mode = useSchedulerStore((s) => s.mode)

  if (loading) {
    return <div className="loading-screen">Bootstrapping mock API + calendar…</div>
  }

  return (
    <div className="app">
      <AppHeader />
      {error && <div className="state-banner" style={{ margin: '12px 18px 0' }}>{error}</div>}
      <div className={`layout ${mode === 'closed' ? 'panel-closed' : ''}`}>
        <main className="main-pane">
          <SchedulerCalendar />
        </main>
        <BookingPanel />
      </div>
      <Toast />
    </div>
  )
}
