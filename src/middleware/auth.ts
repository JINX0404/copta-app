import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../types/env'

const SESSION_COOKIE = 'copta_session'
const SESSION_TTL_DAYS = 30

export { SESSION_COOKIE, SESSION_TTL_DAYS }

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const sessionId = getSessionId(c)
  if (!sessionId) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  const row = await c.env.DB.prepare(
    `SELECT s.id, s.user_id, s.expires_at
     FROM sessions s
     WHERE s.id = ? AND s.expires_at > datetime('now')`,
  )
    .bind(sessionId)
    .first<{ id: string; user_id: string; expires_at: string }>()

  if (!row) {
    return c.json({ error: 'session_expired' }, 401)
  }

  c.set('userId', row.user_id)
  c.set('sessionId', row.id)
  await next()
})

export const optionalAuth = createMiddleware<AppEnv>(async (c, next) => {
  const sessionId = getSessionId(c)
  if (sessionId) {
    const row = await c.env.DB.prepare(
      `SELECT s.id, s.user_id
       FROM sessions s
       WHERE s.id = ? AND s.expires_at > datetime('now')`,
    )
      .bind(sessionId)
      .first<{ id: string; user_id: string }>()

    if (row) {
      c.set('userId', row.user_id)
      c.set('sessionId', row.id)
    }
  }
  await next()
})

function getSessionId(c: { req: { header: (name: string) => string | undefined } }): string | null {
  const cookie = c.req.header('Cookie')
  if (!cookie) return null
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))
  return match?.[1] ?? null
}

export function setSessionCookie(c: { header: (name: string, value: string) => void }, sessionId: string): void {
  const maxAge = SESSION_TTL_DAYS * 24 * 60 * 60
  c.header(
    'Set-Cookie',
    `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`,
  )
}

export function clearSessionCookie(c: { header: (name: string, value: string) => void }): void {
  c.header('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
}

export function sessionExpiresAt(days = SESSION_TTL_DAYS): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

export function magicLinkExpiresAt(minutes = 15): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() + minutes)
  return d.toISOString()
}
