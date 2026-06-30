import { Hono } from 'hono'
import type { AppEnv } from '../types/env'
import { requireAuth } from '../middleware/auth'
import { requireOrgMember } from '../middleware/org-membership'
import { requireOrgRole } from '../middleware/role-guard'
import { newId } from '../lib/id'
import { parseSegment, segmentMatchesUser } from '../lib/segment'
import { writeAuditLog } from '../lib/audit'
import type { ApprovalStatus } from '../db/schema'

const announcements = new Hono<AppEnv>()

announcements.use('*', requireAuth, requireOrgMember)

/** お知らせ一覧（保護者: 公開済みのみ / 役員: 下書き含む） */
announcements.get('/', async (c) => {
  const orgId = c.req.param('orgId')!
  const userId = c.get('userId')
  const roleCtx = c.get('roleContext')
  const canPublish = roleCtx?.permissions.can_publish === true

  const { results: all } = await c.env.DB.prepare(
    `SELECT a.id, a.title, a.body, a.segment, a.requires_response,
            a.approval_status, a.published_at, a.created_by_role_id,
            r.name AS created_by_role_name,
            CASE WHEN ar.user_id IS NOT NULL THEN 1 ELSE 0 END AS is_read,
            CASE WHEN resp.user_id IS NOT NULL THEN 1 ELSE 0 END AS has_responded
     FROM announcements a
     JOIN roles r ON r.id = a.created_by_role_id
     LEFT JOIN announcement_reads ar ON ar.announcement_id = a.id AND ar.user_id = ?
     LEFT JOIN announcement_responses resp ON resp.announcement_id = a.id AND resp.user_id = ?
     WHERE a.organization_id = ?
     ORDER BY COALESCE(a.published_at, '1970-01-01') DESC`,
  )
    .bind(userId, userId, orgId)
    .all<{
      id: string
      title: string
      body: string
      segment: string
      requires_response: number
      approval_status: ApprovalStatus
      published_at: string | null
      created_by_role_name: string
      is_read: number
      has_responded: number
    }>()

  const { results: userChildren } = await c.env.DB.prepare(
    `SELECT c.grade_label, c.class_name
     FROM user_children uc
     JOIN children c ON c.id = uc.child_id
     WHERE uc.user_id = ? AND c.organization_id = ? AND c.status = 'active'`,
  )
    .bind(userId, orgId)
    .all<{ grade_label: string | null; class_name: string | null }>()

  const children = userChildren ?? []
  const filtered = (all ?? []).filter((a) => {
    if (canPublish) return true
    if (a.approval_status !== 'published') return false
    return segmentMatchesUser(parseSegment(a.segment), children)
  })

  return c.json({
    announcements: filtered.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      requires_response: a.requires_response === 1,
      approval_status: a.approval_status,
      published_at: a.published_at,
      created_by_role_name: a.created_by_role_name,
      is_read: a.is_read === 1,
      has_responded: a.has_responded === 1,
    })),
  })
})

/** お知らせ作成（下書き） */
announcements.post('/', requireOrgRole('orgId', (p) => p.can_publish === true), async (c) => {
  const orgId = c.req.param('orgId')!
  const roleCtx = c.get('roleContext')!
  const body = await c.req.json<{
    title: string
    body: string
    segment?: { all?: boolean; grade_labels?: string[]; class_names?: string[] }
    requires_response?: boolean
  }>()

  if (!body.title?.trim() || !body.body?.trim()) {
    return c.json({ error: 'title and body are required' }, 400)
  }

  const id = newId()
  const segment = JSON.stringify(body.segment ?? { all: true })

  await c.env.DB.prepare(
    `INSERT INTO announcements
       (id, organization_id, created_by_role_id, title, body, segment, requires_response, approval_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')`,
  )
    .bind(
      id,
      orgId,
      roleCtx.roleId,
      body.title.trim(),
      body.body.trim(),
      segment,
      body.requires_response ? 1 : 0,
    )
    .run()

  await writeAuditLog(c.env.DB, {
    organizationId: orgId,
    actorRoleId: roleCtx.roleId,
    action: 'announcement.created',
    targetType: 'announcement',
    targetId: id,
  })

  return c.json({ ok: true, id, approval_status: 'draft' }, 201)
})

/** お知らせ詳細 */
announcements.get('/:id', async (c) => {
  const orgId = c.req.param('orgId')!
  const id = c.req.param('id')!
  const userId = c.get('userId')
  const roleCtx = c.get('roleContext')

  const row = await c.env.DB.prepare(
    `SELECT * FROM announcements WHERE id = ? AND organization_id = ?`,
  )
    .bind(id, orgId)
    .first<{
      id: string
      title: string
      body: string
      segment: string
      requires_response: number
      approval_status: ApprovalStatus
      published_at: string | null
    }>()

  if (!row) return c.json({ error: 'not_found' }, 404)

  const canPublish = roleCtx?.permissions.can_publish === true
  if (!canPublish && row.approval_status !== 'published') {
    return c.json({ error: 'not_found' }, 404)
  }

  if (!canPublish && row.approval_status === 'published') {
    const { results: userChildren } = await c.env.DB.prepare(
      `SELECT c.grade_label, c.class_name FROM user_children uc
       JOIN children c ON c.id = uc.child_id
       WHERE uc.user_id = ? AND c.organization_id = ?`,
    )
      .bind(userId, orgId)
      .all<{ grade_label: string | null; class_name: string | null }>()

    if (!segmentMatchesUser(parseSegment(row.segment), userChildren ?? [])) {
      return c.json({ error: 'not_found' }, 404)
    }
  }

  return c.json({ announcement: row })
})

/** 下書き更新 */
announcements.patch('/:id', requireOrgRole('orgId', (p) => p.can_publish === true), async (c) => {
  const orgId = c.req.param('orgId')!
  const id = c.req.param('id')!
  const body = await c.req.json<{
    title?: string
    body?: string
    segment?: object
    requires_response?: boolean
  }>()

  const existing = await c.env.DB.prepare(
    `SELECT approval_status FROM announcements WHERE id = ? AND organization_id = ?`,
  )
    .bind(id, orgId)
    .first<{ approval_status: ApprovalStatus }>()

  if (!existing) return c.json({ error: 'not_found' }, 404)
  if (existing.approval_status === 'published') {
    return c.json({ error: 'cannot_edit_published' }, 400)
  }

  await c.env.DB.prepare(
    `UPDATE announcements SET
       title = COALESCE(?, title),
       body = COALESCE(?, body),
       segment = COALESCE(?, segment),
       requires_response = COALESCE(?, requires_response)
     WHERE id = ?`,
  )
    .bind(
      body.title ?? null,
      body.body ?? null,
      body.segment ? JSON.stringify(body.segment) : null,
      body.requires_response != null ? (body.requires_response ? 1 : 0) : null,
      id,
    )
    .run()

  return c.json({ ok: true })
})

/** 承認申請 */
announcements.post(
  '/:id/submit-approval',
  requireOrgRole('orgId', (p) => p.can_publish === true),
  async (c) => {
    const orgId = c.req.param('orgId')!
    const id = c.req.param('id')!

    const existing = await c.env.DB.prepare(
      `SELECT approval_status FROM announcements WHERE id = ? AND organization_id = ?`,
    )
      .bind(id, orgId)
      .first<{ approval_status: ApprovalStatus }>()

    if (!existing) return c.json({ error: 'not_found' }, 404)
    if (existing.approval_status !== 'draft') {
      return c.json({ error: 'invalid_status' }, 400)
    }

    await c.env.DB.prepare(
      `UPDATE announcements SET approval_status = 'pending_approval' WHERE id = ?`,
    )
      .bind(id)
      .run()

    return c.json({ ok: true, approval_status: 'pending_approval' })
  },
)

/** 公開（承認） */
announcements.post(
  '/:id/publish',
  requireOrgRole('orgId', (p) => p.can_manage_org === true),
  async (c) => {
    const orgId = c.req.param('orgId')!
    const id = c.req.param('id')!
    const roleCtx = c.get('roleContext')!

    const existing = await c.env.DB.prepare(
      `SELECT approval_status FROM announcements WHERE id = ? AND organization_id = ?`,
    )
      .bind(id, orgId)
      .first<{ approval_status: ApprovalStatus }>()

    if (!existing) return c.json({ error: 'not_found' }, 404)
    if (existing.approval_status === 'published') {
      return c.json({ error: 'already_published' }, 400)
    }

    await c.env.DB.prepare(
      `UPDATE announcements SET approval_status = 'published', published_at = datetime('now')
       WHERE id = ?`,
    )
      .bind(id)
      .run()

    await writeAuditLog(c.env.DB, {
      organizationId: orgId,
      actorRoleId: roleCtx.roleId,
      action: 'announcement.published',
      targetType: 'announcement',
      targetId: id,
    })

    return c.json({ ok: true, approval_status: 'published' })
  },
)

/** 既読マーク */
announcements.post('/:id/read', async (c) => {
  const id = c.req.param('id')!
  const userId = c.get('userId')

  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO announcement_reads (announcement_id, user_id) VALUES (?, ?)`,
  )
    .bind(id, userId)
    .run()

  return c.json({ ok: true })
})

/** 要返信の返信マーク（コメント欄ではなく確認フラグのみ） */
announcements.post('/:id/respond', async (c) => {
  const id = c.req.param('id')!
  const userId = c.get('userId')

  const ann = await c.env.DB.prepare(
    `SELECT requires_response FROM announcements WHERE id = ?`,
  )
    .bind(id)
    .first<{ requires_response: number }>()

  if (!ann) return c.json({ error: 'not_found' }, 404)
  if (ann.requires_response !== 1) {
    return c.json({ error: 'response_not_required' }, 400)
  }

  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO announcement_responses (announcement_id, user_id) VALUES (?, ?)`,
  )
    .bind(id, userId)
    .run()

  return c.json({ ok: true })
})

/** 既読・未読統計（役員向け） */
announcements.get(
  '/:id/read-stats',
  requireOrgRole('orgId', (p) => p.can_publish === true),
  async (c) => {
    const orgId = c.req.param('orgId')!
    const id = c.req.param('id')!

    const totalRow = await c.env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM organization_memberships
       WHERE organization_id = ? AND status = 'active'`,
    )
      .bind(orgId)
      .first<{ cnt: number }>()

    const readRow = await c.env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM announcement_reads WHERE announcement_id = ?`,
    )
      .bind(id)
      .first<{ cnt: number }>()

    const responseRow = await c.env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM announcement_responses WHERE announcement_id = ?`,
    )
      .bind(id)
      .first<{ cnt: number }>()

    const total = totalRow?.cnt ?? 0
    const readCount = readRow?.cnt ?? 0

    return c.json({
      total_members: total,
      read_count: readCount,
      unread_count: total - readCount,
      response_count: responseRow?.cnt ?? 0,
    })
  },
)

export default announcements
