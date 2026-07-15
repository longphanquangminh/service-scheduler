import {
  readPendingStore,
  removePendingStore,
  upsertPendingStore,
} from '../domain/presence'
import type { LiveEvent, PendingClientMessage, RemotePending } from '../domain/types'
import { RUNTIME_SYNC_CHANNEL } from '../mocks/runtimeApi'

const PRESENCE_CHANNEL = 'keyloop.scheduler.pending-presence'

let socket: WebSocket | null = null
/** Keep one channel open — closing right after postMessage can drop events. */
let publishChannel: BroadcastChannel | null = null

export function bindLiveSocket(next: WebSocket | null) {
  socket = next
}

function sendWs(message: PendingClientMessage) {
  if (socket?.readyState !== WebSocket.OPEN) return
  socket.send(JSON.stringify(message))
}

function getPublishChannel(): BroadcastChannel | null {
  if (publishChannel) return publishChannel
  try {
    publishChannel = new BroadcastChannel(PRESENCE_CHANNEL)
    return publishChannel
  } catch {
    return null
  }
}

function postPresence(event: LiveEvent) {
  getPublishChannel()?.postMessage(event)
}

/**
 * Publish local pending to other same-origin tabs.
 * Disk: `.runtime-data/pending.json` · Live: BroadcastChannel · Protocol: mock WS.
 */
export function publishPendingPresence(pending: RemotePending) {
  void upsertPendingStore(pending)
  const event: LiveEvent = { type: 'pending.updated', pending }
  postPresence(event)
  sendWs({ type: 'pending.publish', pending })
}

export function clearPendingPresence(sessionId: string) {
  void removePendingStore(sessionId)
  const event: LiveEvent = { type: 'pending.cleared', sessionId }
  postPresence(event)
  sendWs({ type: 'pending.clear', sessionId })
}

/** Subscribe to cross-tab pending presence (BroadcastChannel + runtime file sync). */
export function subscribePendingPresence(onEvent: (event: LiveEvent) => void): () => void {
  let channel: BroadcastChannel | null = null
  try {
    channel = new BroadcastChannel(PRESENCE_CHANNEL)
    channel.addEventListener('message', (message) => {
      onEvent(message.data as LiveEvent)
    })
  } catch {
    channel = null
  }

  let syncChannel: BroadcastChannel | null = null
  try {
    syncChannel = new BroadcastChannel(RUNTIME_SYNC_CHANNEL)
    syncChannel.addEventListener('message', (message) => {
      const data = message.data as { type?: string } | undefined
      if (data?.type !== 'pending.changed') return
      void readPendingStore().then((map) => {
        onEvent({
          type: 'pending.snapshot',
          pendings: Object.values(map),
        })
      })
    })
  } catch {
    syncChannel = null
  }

  return () => {
    channel?.close()
    syncChannel?.close()
  }
}
