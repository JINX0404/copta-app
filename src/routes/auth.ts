import { Hono } from 'hono'
import type { AppEnv } from '../types/env'
import { newId } from '../lib/id'
import { hashContact, newToken } from '../lib/crypto'
import { currentSchoolYear } from '../lib/school-year'
import {
  requireAuth,
  setSessionCookie,
  clearSessionCookie,
  sessionExpiresAt,
  magicLinkExpiresAt,
} from '../middleware/auth'
import {
  DEFAULT_PARENT_PERMISSION,
  PARENT_ROLE_NAME,
  type ContactMethod,
} from '../db/schema'
import { createSessionForUser, DEMO_USER_IDS } from '../lib/session'

const auth = new Hono<AppEnv>()

/** マジックリンク送信リクエスト（本番ではメール/SMS送信。開発時はURLを返す） */
auth.post('/magic-link', async (c) => {
  const body = await c.req.json<{
    contact_method: ContactMethod
    contact_value: string
    display_name?: string
  }>()

  if (!body.contact_method || !body.contact_value) {
    return c.json({ error: 'contact_method and contact_value are required' }, 400)
  }
  if (body.contact_method !== 'email' && body.contact_method !== 'phone') {
    return c.json({ error: 'invalid contact_method' }, 400)
  }

  const contactHash = await hashContact(body.contact_value)
  const token = newToken()
  const tokenId = newId()

  await c.env.DB.prepare(
    `INSERT INTO magic_link_tokens (id, contact_method, contact_value_hash, display_name, token, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      tokenId,
      body.contact_method,
      contactHash,
      body.display_name ?? null,
      token,
      magicLinkExpiresAt(),
    )
    .run()

  const verifyUrl = new URL(`/auth/verify/${token}`, c.req.url).toString()

  // 本番: メール/SMS送信（国内リージョン要確認 — docs/ARCHITECTURE.md）
  const response: Record<string, unknown> = { ok: true, message: 'magic_link_sent' }
  if (c.env.DEV_EXPOSE_MAGIC_LINK === 'true') {
    response.dev_verify_url = verifyUrl
  }

  return c.json(response)
})

/** マジックリンク検証 → セッション発行 */
auth.get('/verify/:token', async (c) => {
  const { token } = c.req.param()

  const link = await c.env.DB.prepare(
    `SELECT id, contact_method, contact_value_hash, display_name, expires_at, used_at
     FROM magic_link_tokens WHERE token = ?`,
  )
    .bind(token)
    .first<{
      id: string
      contact_method: ContactMethod
      contact_value_hash: string
      display_name: string | null
      expires_at: string
      used_at: string | null
    }>()

  if (!link) {
    return c.json({ error: 'invalid_token' }, 400)
  }
  if (link.used_at) {
    return c.json({ error: 'token_already_used' }, 400)
  }
  if (new Date(link.expires_at) < new Date()) {
    return c.json({ error: 'token_expired' }, 400)
  }

  let user = await c.env.DB.prepare(
    `SELECT id, display_name FROM users WHERE contact_value_hash = ?`,
  )
    .bind(link.contact_value_hash)
    .first<{ id: string; display_name: string }>()

  if (!user) {
    const userId = newId()
    const displayName = link.display_name ?? '保護者'
    await c.env.DB.prepare(
      `INSERT INTO users (id, display_name, contact_method, contact_value_hash)
       VALUES (?, ?, ?, ?)`,
    )
      .bind(userId, displayName, link.contact_method, link.contact_value_hash)
      .run()
    user = { id: userId, display_name: displayName }
  }

  await c.env.DB.prepare(
    `UPDATE magic_link_tokens SET used_at = datetime('now') WHERE id = ?`,
  )
    .bind(link.id)
    .run()

  const sessionId = newId()
  await c.env.DB.prepare(
    `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
  )
    .bind(sessionId, user.id, sessionExpiresAt())
    .run()

  setSessionCookie(c, sessionId)

  const wantsHtml = c.req.header('Accept')?.includes('text/html')
  if (wantsHtml) {
    return c.redirect('/app/home')
  }

  return c.json({
    ok: true,
    user: { id: user.id, display_name: user.display_name },
  })
})

/** 現在のログインユーザー情報 */
auth.get('/me', requireAuth, async (c) => {
  const userId = c.get('userId')

  const user = await c.env.DB.prepare(
    `SELECT id, display_name, contact_method, created_at FROM users WHERE id = ?`,
  )
    .bind(userId)
    .first<{ id: string; display_name: string; contact_method: string; created_at: string }>()

  if (!user) {
    return c.json({ error: 'user_not_found' }, 404)
  }

  const { results: memberships } = await c.env.DB.prepare(
    `SELECT om.id, om.organization_id, om.status, o.name AS organization_name
     FROM organization_memberships om
     JOIN organizations o ON o.id = om.organization_id
     WHERE om.user_id = ?`,
  )
    .bind(userId)
    .all()

  const { results: children } = await c.env.DB.prepare(
    `SELECT c.id, c.organization_id, c.class_name, c.grade_label, c.status
     FROM user_children uc
     JOIN children c ON c.id = uc.child_id
     WHERE uc.user_id = ?`,
  )
    .bind(userId)
    .all()

  return c.json({ user, memberships: memberships ?? [], children: children ?? [] })
})

/**
 * 子どもID（学校発行コード）で自己登録。
 * 子ども単位のコードで保護者と子ども・団体を紐付ける。
 */
auth.post('/register/child', requireAuth, async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{ child_code: string }>()

  if (!body.child_code?.trim()) {
    return c.json({ error: 'child_code is required' }, 400)
  }

  const child = await c.env.DB.prepare(
    `SELECT id, organization_id, class_name, grade_label, status
     FROM children WHERE child_code = ?`,
  )
    .bind(body.child_code.trim())
    .first<{
      id: string
      organization_id: string
      class_name: string | null
      grade_label: string | null
      status: string
    }>()

  if (!child) {
    return c.json({ error: 'invalid_child_code' }, 404)
  }
  if (child.status !== 'active') {
    return c.json({ error: 'child_not_active', status: child.status }, 400)
  }

  const existingLink = await c.env.DB.prepare(
    `SELECT 1 FROM user_children WHERE user_id = ? AND child_id = ?`,
  )
    .bind(userId, child.id)
    .first()

  if (!existingLink) {
    await c.env.DB.prepare(
      `INSERT INTO user_children (user_id, child_id) VALUES (?, ?)`,
    )
      .bind(userId, child.id)
      .run()
  }

  const membership = await c.env.DB.prepare(
    `SELECT id, status FROM organization_memberships
     WHERE user_id = ? AND organization_id = ?`,
  )
    .bind(userId, child.organization_id)
    .first<{ id: string; status: string }>()

  if (!membership) {
    await c.env.DB.prepare(
      `INSERT INTO organization_memberships (id, user_id, organization_id, status)
       VALUES (?, ?, ?, 'active')`,
    )
      .bind(newId(), userId, child.organization_id)
      .run()
  } else if (membership.status === 'inactive') {
    await c.env.DB.prepare(
      `UPDATE organization_memberships SET status = 'active' WHERE id = ?`,
    )
      .bind(membership.id)
      .run()
  }

  await ensureParentRoleAssignment(c.env.DB, userId, child.organization_id)

  return c.json({
    ok: true,
    child: {
      id: child.id,
      organization_id: child.organization_id,
      class_name: child.class_name,
      grade_label: child.grade_label,
    },
  })
})

auth.post('/logout', requireAuth, async (c) => {
  const sessionId = c.get('sessionId')
  await c.env.DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind(sessionId).run()
  clearSessionCookie(c)
  return c.json({ ok: true })
})

/** POCデモ用ワンクリックログイン（POC_MODE=true のときのみ） */
auth.get('/demo-login/:persona', async (c) => {
  if (c.env.POC_MODE !== 'true') {
    return c.text('Demo login disabled', 403)
  }

  const persona = c.req.param('persona')!
  const userId = DEMO_USER_IDS[persona]
  if (!userId) {
    return c.text('Unknown persona', 400)
  }

  try {
    const user = await c.env.DB.prepare(`SELECT id FROM users WHERE id = ?`).bind(userId).first()
    if (!user) {
      return c.redirect('/app?error=db')
    }

    const sessionId = await createSessionForUser(c.env.DB, userId)
    setSessionCookie(c, sessionId)
    return c.redirect('/app/home')
  } catch {
    return c.redirect('/app?error=db')
  }
})

/** 一般保護者ロールがなければ作成し、当年度のアサインを付与 */
async function ensureParentRoleAssignment(
  db: D1Database,
  userId: string,
  organizationId: string,
): Promise<void> {
  const schoolYear = currentSchoolYear()

  let role = await db
    .prepare(
      `SELECT id FROM roles WHERE organization_id = ? AND name = ?`,
    )
    .bind(organizationId, PARENT_ROLE_NAME)
    .first<{ id: string }>()

  if (!role) {
    const roleId = newId()
    await db
      .prepare(
        `INSERT INTO roles (id, organization_id, name, permission_set) VALUES (?, ?, ?, ?)`,
      )
      .bind(roleId, organizationId, PARENT_ROLE_NAME, JSON.stringify(DEFAULT_PARENT_PERMISSION))
      .run()
    role = { id: roleId }
  }

  const existing = await db
    .prepare(
      `SELECT id FROM role_assignments
       WHERE user_id = ? AND role_id = ? AND school_year = ?`,
    )
    .bind(userId, role.id, schoolYear)
    .first()

  if (!existing) {
    await db
      .prepare(
        `INSERT INTO role_assignments (id, user_id, role_id, school_year, active)
         VALUES (?, ?, ?, ?, 1)`,
      )
      .bind(newId(), userId, role.id, schoolYear)
      .run()
  }
}

export default auth
