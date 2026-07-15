import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

async function bootstrap() {
  if (import.meta.env.MODE !== 'test') {
    // MSW must patch fetch BEFORE the app runs (and before any OTEL fetch wrapping).
    const { worker } = await import('./mocks/browser')
    await worker.start({
      onUnhandledRequest: 'bypass',
      quiet: true,
    })

    // Load `.runtime-data/appointments.json` (or seed it) before UI mounts
    const { db } = await import('./mocks/db')
    await db.whenReady()

    const { initOpenTelemetry } = await import('./observability/otel')
    initOpenTelemetry()
  }

  const root = document.getElementById('root')
  if (!root) throw new Error('Missing #root element')

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
