import { newId } from './id'
import { sessionExpiresAt, setSessionCookie, SESSION_COOKIE } from '../middleware/auth'

export async function createSessionForUser(
  db: D1Database,
  userId: string,
): Promise<string> {
  const sessionId = newId()
  await db.prepare(`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`)
    .bind(sessionId, userId, sessionExpiresAt())
    .run()
  return sessionId
}

export async function resolveSessionUser(
  db: D1Database,
  cookieHeader: string | undefined,
): Promise<{ userId: string; sessionId: string; display_name: string } | null> {
  if (!cookieHeader) return null
  const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))
  const sessionId = match?.[1]
  if (!sessionId) return null

  const row = await db
    .prepare(
      `SELECT s.id AS session_id, s.user_id, u.display_name
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > datetime('now')`,
    )
    .bind(sessionId)
    .first<{ session_id: string; user_id: string; display_name: string }>()

  if (!row) return null
  return { userId: row.user_id, sessionId: row.session_id, display_name: row.display_name }
}

export { setSessionCookie }

export const DEMO_USER_IDS: Record<string, string> = {
  parent: 'user-demo-parent',
  koho: 'user-demo-koho',
  president: 'user-demo-president',
}

export const POC_ORG_ID = 'org-demo-001'
