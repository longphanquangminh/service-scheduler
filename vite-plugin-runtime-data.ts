import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Connect, Plugin } from 'vite'

const RUNTIME_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.runtime-data')
const RUNTIME_PREFIX = '/__runtime/'

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

type PendingPatchOp = {
  upsert?: Record<string, unknown> & { sessionId: string }
  remove?: string
}

/** Serialize pending.json mutations so multi-tab upsert/remove cannot clobber each other. */
let pendingWriteChain: Promise<void> = Promise.resolve()

function enqueuePendingWrite<T>(work: () => T): Promise<T> {
  const run = pendingWriteChain.then(work, work)
  pendingWriteChain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

function readJsonArray(filePath: string): Record<string, unknown>[] {
  if (!fs.existsSync(filePath)) return []
  const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  if (Array.isArray(parsed)) {
    return parsed.filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === 'object' && typeof item.sessionId === 'string',
    )
  }
  // Legacy object map keyed by sessionId
  if (parsed && typeof parsed === 'object') {
    return Object.values(parsed as Record<string, Record<string, unknown>>).filter(
      (item) => typeof item?.sessionId === 'string',
    )
  }
  return []
}

function upsertPendingInList(
  list: Record<string, unknown>[],
  upsert: Record<string, unknown> & { sessionId: string },
): Record<string, unknown>[] {
  const index = list.findIndex((item) => item.sessionId === upsert.sessionId)
  if (index === -1) return [...list, upsert]
  const next = [...list]
  next[index] = upsert
  return next
}

/**
 * Dev-only disk persistence for the mock API.
 * GET/PUT /__runtime/<name>.json → .runtime-data/<name>.json
 * PATCH /__runtime/pending.json → atomic upsert/remove by sessionId
 */
export function runtimeDataPlugin(): Plugin {
  return {
    name: 'keyloop-runtime-data',
    configureServer(server) {
      fs.mkdirSync(RUNTIME_DIR, { recursive: true })

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith(RUNTIME_PREFIX)) {
          next()
          return
        }

        const fileName = req.url.slice(RUNTIME_PREFIX.length).replace(/\?.*$/, '')
        if (!/^[a-z0-9_-]+\.json$/i.test(fileName)) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ message: 'Invalid runtime file name' }))
          return
        }

        const filePath = path.join(RUNTIME_DIR, fileName)

        try {
          if (req.method === 'GET') {
            res.setHeader('Content-Type', 'application/json')
            if (!fs.existsSync(filePath)) {
              res.end('null')
              return
            }
            res.end(fs.readFileSync(filePath, 'utf8'))
            return
          }

          if (req.method === 'PUT') {
            const raw = await readBody(req)
            JSON.parse(raw)
            fs.mkdirSync(RUNTIME_DIR, { recursive: true })
            fs.writeFileSync(filePath, raw, 'utf8')
            res.statusCode = 204
            res.end()
            return
          }

          // Atomic merge for shared pending presence (avoids multi-tab RMW clobber).
          if (req.method === 'PATCH' && fileName === 'pending.json') {
            const op = JSON.parse(await readBody(req)) as PendingPatchOp
            const next = await enqueuePendingWrite(() => {
              let list = readJsonArray(filePath)
              if (typeof op.remove === 'string' && op.remove) {
                list = list.filter((item) => item.sessionId !== op.remove)
              }
              if (op.upsert?.sessionId) {
                list = upsertPendingInList(list, op.upsert)
              }
              fs.mkdirSync(RUNTIME_DIR, { recursive: true })
              fs.writeFileSync(filePath, JSON.stringify(list, null, 2), 'utf8')
              return list
            })
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(next))
            return
          }

          if (req.method === 'DELETE') {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
            res.statusCode = 204
            res.end()
            return
          }

          res.statusCode = 405
          res.end('Method Not Allowed')
        } catch (error) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ message: (error as Error).message }))
        }
      })
    },
  }
}
