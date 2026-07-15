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

/**
 * Dev-only disk persistence for the mock API.
 * GET/PUT /__runtime/<name>.json → .runtime-data/<name>.json
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
