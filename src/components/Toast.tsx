import { useEffect } from 'react'
import { useSchedulerStore } from '../store/schedulerStore'

export function Toast() {
  const toast = useSchedulerStore((s) => s.toast)
  const setToast = useSchedulerStore((s) => s.setToast)

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(t)
  }, [toast, setToast])

  if (!toast) return null
  return (
    <div className="toast" role="status">
      {toast}
    </div>
  )
}
