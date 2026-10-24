import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import type { IncomingMessage } from 'http'

// Server-only settings the /api handlers read from process.env. Vite never
// copies .env files into process.env (and never sends non-VITE_ ones to the
// browser), so they're passed through here for the dev server.
const SERVER_ENV = [
  'GMAIL_USER', 'GMAIL_APP_PASSWORD', 'MAIL_FROM_NAME', 'NOTIFY_EMAIL', 'APP_URL',
  'FIREBASE_SERVICE_ACCOUNT', 'GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_PROJECT_ID', 'REDIS_URL',
]
// Local test mode (npm run dev): the emulators only. No Gmail, no keys.
const LOCAL_TEST_ENV = ['NOTIFY_EMAIL', 'FIREBASE_PROJECT_ID', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST', 'VITE_LOCAL_REAL_EMAIL']
// ...plus Gmail, only when VITE_LOCAL_REAL_EMAIL=true: real addresses then get real emails
const LOCAL_REAL_EMAIL_ENV = ['GMAIL_USER', 'GMAIL_APP_PASSWORD', 'MAIL_FROM_NAME']

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

const sendJson = (res: import('http').ServerResponse, status: number, body: unknown) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

/**
 * DEV ONLY (`apply: 'serve'`, never part of a build): serves the Vercel
 * functions in /api from the Vite dev server, so the email routes work without
 * the Vercel CLI. On Vercel the same files deploy as functions.
 * In local test mode it also shows the emails the server "sent": all of them at
 * /__dev/outbox, and the newest one to an address at /__dev/mail?to=…
 */
function devApi(mode: string, env: Record<string, string>): Plugin {
  const localTest = mode === 'emulator'
  return {
    name: 'jpos-dev-api',
    apply: 'serve',
    configureServer(server) {
      const keys = !localTest ? SERVER_ENV
        : env.VITE_LOCAL_REAL_EMAIL === 'true' ? [...LOCAL_TEST_ENV, ...LOCAL_REAL_EMAIL_ENV] : LOCAL_TEST_ENV
      for (const key of keys) {
        if (env[key] && (localTest || !process.env[key])) process.env[key] = env[key]
      }
      process.env.JPOS_DEV_API = '1'
      if (!localTest) {
        server.config.logger.warn('\n  LIVE MODE: this uses the REAL JPOS database and accounts.\n  To test safely with fake data, stop this (Ctrl+C) and run "npm run dev".\n')
      }

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
        if (url.pathname === '/__dev/outbox' || url.pathname === '/__dev/mail') {
          if (!localTest) return next()
          const box = (globalThis as { __jposOutbox?: { to: string[]; html: string }[] }).__jposOutbox ?? []
          if (url.pathname === '/__dev/outbox') return sendJson(res, 200, box)
          // The newest email to this address, shown the way it looks in an inbox
          const to = url.searchParams.get('to') ?? ''
          const mail = [...box].reverse().find(m => m.to.includes(to))
          res.statusCode = mail ? 200 : 404
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(mail?.html ?? '<p style="font-family:sans-serif">No email for this address yet.</p>')
          return
        }
        if (!url.pathname.startsWith('/api/')) return next()

        // Same rules as Vercel: /api/a/b → api/a/b.ts, and "_" folders/files are never routes
        const route = url.pathname.replace(/\/+$/, '')
        const file = path.join(server.config.root, `${route}.ts`)
        if (route.split('/').some(part => part.startsWith('_')) || !fs.existsSync(file)) {
          return sendJson(res, 404, { error: { code: 'not_found', message: 'No such API route.' } })
        }

        try {
          const mod = await server.ssrLoadModule(file)
          const handler = mod[req.method ?? 'GET']
          if (typeof handler !== 'function') {
            res.statusCode = 405
            res.end()
            return
          }
          const headers = new Headers()
          for (const [name, value] of Object.entries(req.headers)) {
            if (typeof value === 'string') headers.set(name, value)
          }
          const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
          const response: Response = await handler(new Request(url, {
            method: req.method,
            headers,
            body: hasBody ? new Uint8Array(await readBody(req)) : undefined,
          }))
          res.statusCode = response.status
          response.headers.forEach((value, name) => res.setHeader(name, value))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (err) {
          next(err)
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), devApi(mode, loadEnv(mode, process.cwd(), ''))],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
}))
