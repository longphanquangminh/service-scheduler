import {
  notifyRuntimeSync,
  readRuntimeJson,
  RUNTIME_PENDING_FILE,
  writeRuntimeJson,
} from '../mocks/runtimeApi'

const SESSION_STORAGE_KEY = 'keyloop.scheduler.sessionId'

const PRESENCE_COLORS = [
  '#c084fc',
  '#f472b6',
  '#fb923c',
  '#a3e635',
  '#22d3ee',
  '#e879f9',
]

/** Stable per-tab identity so remote pendings can be keyed + colored. */
export function getSessionId(): string {
  let id = sessionStorage.getItem(SESSION_STORAGE_KEY)
  if (!id) {
    id = crypto.randomUUID().slice(0, 8)
    sessionStorage.setItem(SESSION_STORAGE_KEY, id)
  }
  return id
}

export function sessionLabel(sessionId: string): string {
  return `Advisor ${sessionId.slice(0, 4).toUpperCase()}`
}

export function sessionColor(sessionId: string): string {
  let hash = 0
  for (let i = 0; i < sessionId.length; i += 1) {
    hash = (hash * 31 + sessionId.charCodeAt(i)) >>> 0
  }
  return PRESENCE_COLORS[hash % PRESENCE_COLORS.length]
}

export function remotePendingEventId(sessionId: string): string {
  return `__remote_pending_${sessionId}`
}

export function isRemotePendingEventId(id: string): boolean {
  return id.startsWith('__remote_pending_')
}

export type StoredPendingMap = Record<
  string,
  {
    sessionId: string
    label: string
    color: string
    start: string
    end: string
    mode: 'create' | 'edit'
    appointmentId?: string
    updatedAt: string
  }
>

export async function readPendingStore(): Promise<StoredPendingMap> {
  const parsed = await readRuntimeJson<StoredPendingMap>(RUNTIME_PENDING_FILE)
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
}

export async function writePendingStore(map: StoredPendingMap) {
  await writeRuntimeJson(RUNTIME_PENDING_FILE, map)
  notifyRuntimeSync('pending')
}

export async function upsertPendingStore(pending: StoredPendingMap[string]) {
  const next = await readPendingStore()
  next[pending.sessionId] = pending
  await writePendingStore(next)
  return next
}

export async function removePendingStore(sessionId: string) {
  const next = await readPendingStore()
  delete next[sessionId]
  await writePendingStore(next)
  return next
}
