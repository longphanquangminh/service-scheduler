/** Dev disk store via Vite middleware (see vite-plugin-runtime-data.ts). */
const RUNTIME_BASE = '/__runtime'

export const RUNTIME_APPOINTMENTS_FILE = 'appointments.json'
export const RUNTIME_PENDING_FILE = 'pending.json'
export const RUNTIME_SYNC_CHANNEL = 'keyloop.scheduler.runtime-sync'

export async function readRuntimeJson<T>(fileName: string): Promise<T | null> {
  try {
    const response = await fetch(`${RUNTIME_BASE}/${fileName}`, {
      cache: 'no-store',
    })
    if (!response.ok) return null
    const data: unknown = await response.json()
    return data as T | null
  } catch {
    return null
  }
}

export async function writeRuntimeJson(fileName: string, data: unknown): Promise<void> {
  const response = await fetch(`${RUNTIME_BASE}/${fileName}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data, null, 2),
  })
  if (!response.ok && response.status !== 204) {
    throw new Error(`Failed to write ${fileName}: HTTP ${response.status}`)
  }
}

export function notifyRuntimeSync(kind: 'appointments' | 'pending') {
  try {
    const channel = new BroadcastChannel(RUNTIME_SYNC_CHANNEL)
    channel.postMessage({ type: `${kind}.changed`, at: new Date().toISOString() })
    channel.close()
  } catch {
    // ignore
  }
}
