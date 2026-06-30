import { Hono } from 'hono'
import type { AppEnv } from '../types/env'
import { requireAuth } from '../middleware/auth'
import { requireOrgMember } from '../middleware/org-membership'
import { requireOrgRole } from '../middleware/role-guard'
import { newId } from '../lib/id'
import { writeAuditLog } from '../lib/audit'

const volunteer = new Hono<AppEnv>()

volunteer.use('*', requireAuth, requireOrgMember)

/** ボランティア募集一覧 */
volunteer.get('/', async (c) => {
  const orgId = c.req.param('orgId')!
  const userId = c.get('userId')

  const { results } = await c.env.DB.prepare(
    `SELECT v.id, v.title, v.event_datetime, v.capacity, v.selection_method, v.closes_at,
            (SELECT COUNT(*) FROM volunteer_signups vs
             WHERE vs.volunteer_call_id = v.id AND vs.status = 'confirmed') AS confirmed_count,
            (SELECT vs.status FROM volunteer_signups vs
             WHERE vs.volunteer_call_id = v.id AND vs.user_id = ?) AS my_status
     FROM volunteer_calls v
     WHERE v.organization_id = ?
     ORDER BY v.event_datetime`,
  )
    .bind(userId, orgId)
    .all()

  return c.json({ calls: results ?? [] })
})

/** ボランティア募集作成 */
volunteer.post('/', requireOrgRole('orgId', (p) => p.can_publish === true), async (c) => {
  const orgId = c.req.param('orgId')!
  const roleCtx = c.get('roleContext')!
  const body = await c.req.json<{
    title: string
    event_datetime?: string
    capacity: number
    selection_method?: 'first_come' | 'lottery'
    closes_at?: string
  }>()

  if (!body.title?.trim() || !body.capacity || body.capacity < 1) {
    return c.json({ error: 'title and capacity are required' }, 400)
  }

  const id = newId()
  await c.env.DB.prepare(
    `INSERT INTO volunteer_calls
       (id, organization_id, created_by_role_id, title, event_datetime, capacity, selection_method, closes_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      orgId,
      roleCtx.roleId,
      body.title.trim(),
      body.event_datetime ?? null,
      body.capacity,
      body.selection_method ?? 'first_come',
      body.closes_at ?? null,
    )
    .run()

  await writeAuditLog(c.env.DB, {
    organizationId: orgId,
    actorRoleId: roleCtx.roleId,
    action: 'volunteer.created',
    targetType: 'volunteer_call',
    targetId: id,
  })

  return c.json({ ok: true, id }, 201)
})

/** 申込（先着/キャンセル待ち） */
volunteer.post('/:id/signup', async (c) => {
  const orgId = c.req.param('orgId')!
  const callId = c.req.param('id')!
  const userId = c.get('userId')

  const call = await c.env.DB.prepare(
    `SELECT capacity, selection_method, closes_at FROM volunteer_calls
     WHERE id = ? AND organization_id = ?`,
  )
    .bind(callId, orgId)
    .first<{
      capacity: number
      selection_method: string
      closes_at: string | null
    }>()

  if (!call) return c.json({ error: 'not_found' }, 404)
  if (call.closes_at && new Date(call.closes_at) < new Date()) {
    return c.json({ error: 'closed' }, 400)
  }

  const existing = await c.env.DB.prepare(
    `SELECT id, status FROM volunteer_signups WHERE volunteer_call_id = ? AND user_id = ?`,
  )
    .bind(callId, userId)
    .first<{ id: string; status: string }>()

  if (existing && existing.status !== 'cancelled') {
    return c.json({ error: 'already_signed_up', status: existing.status }, 409)
  }

  const confirmedRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM volunteer_signups
     WHERE volunteer_call_id = ? AND status = 'confirmed'`,
  )
    .bind(callId)
    .first<{ cnt: number }>()

  const confirmedCount = confirmedRow?.cnt ?? 0
  let status: 'confirmed' | 'waitlisted' | 'pending' = 'confirmed'

  if (call.selection_method === 'first_come') {
    status = confirmedCount >= call.capacity ? 'waitlisted' : 'confirmed'
  } else {
    status = 'pending' // 抽選: 後日バッチで確定
  }

  const signupId = newId()
  if (existing) {
    await c.env.DB.prepare(
      `UPDATE volunteer_signups SET status = ?, created_at = datetime('now') WHERE id = ?`,
    )
      .bind(status, existing.id)
      .run()
    return c.json({ ok: true, signup_id: existing.id, status })
  }

  await c.env.DB.prepare(
    `INSERT INTO volunteer_signups (id, volunteer_call_id, user_id, status) VALUES (?, ?, ?, ?)`,
  )
    .bind(signupId, callId, userId, status)
    .run()

  return c.json({ ok: true, signup_id: signupId, status }, 201)
})

/** 申込キャンセル */
volunteer.post('/:id/cancel', async (c) => {
  const callId = c.req.param('id')!
  const userId = c.get('userId')

  const result = await c.env.DB.prepare(
    `UPDATE volunteer_signups SET status = 'cancelled'
     WHERE volunteer_call_id = ? AND user_id = ? AND status != 'cancelled'`,
  )
    .bind(callId, userId)
    .run()

  if (!result.meta.changes) {
    return c.json({ error: 'not_found' }, 404)
  }

  return c.json({ ok: true })
})

export default volunteer
