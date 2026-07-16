import type { RemotePending } from './types'
import {
  notifyRuntimeSync,
  patchPendingJson,
  readRuntimeJson,
  RUNTIME_PENDING_FILE,
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

/** Normalize legacy object map or array file into a pending list. */
function normalizePendingStore(parsed: unknown): RemotePending[] {
  if (Array.isArray(parsed)) {
    return parsed.filter(
      (item): item is RemotePending =>
        !!item &&
        typeof item === 'object' &&
        typeof (item as RemotePending).sessionId === 'string',
    )
  }
  if (parsed && typeof parsed === 'object') {
    return Object.values(parsed as Record<string, RemotePending>).filter(
      (item) => typeof item?.sessionId === 'string',
    )
  }
  return []
}

export async function readPendingStore(): Promise<RemotePending[]> {
  const parsed = await readRuntimeJson<unknown>(RUNTIME_PENDING_FILE)
  return normalizePendingStore(parsed)
}

export async function upsertPendingStore(pending: RemotePending) {
  const next = (await patchPendingJson({ upsert: pending })) as RemotePending[]
  notifyRuntimeSync('pending')
  return next
}

export async function removePendingStore(sessionId: string) {
  const next = (await patchPendingJson({ remove: sessionId })) as RemotePending[]
  notifyRuntimeSync('pending')
  return next
}
