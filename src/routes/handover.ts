import { Hono } from 'hono'
import type { AppEnv } from '../types/env'
import { requireAuth } from '../middleware/auth'
import { requireOrgMember } from '../middleware/org-membership'
import { requireOrgRole } from '../middleware/role-guard'
import { newId } from '../lib/id'
import { writeAuditLog } from '../lib/audit'
import { currentSchoolYear } from '../lib/school-year'

const handover = new Hono<AppEnv>()

handover.use('*', requireAuth, requireOrgMember)

/** 引き継ぎ一覧（Roleに紐づく。担当者が変わっても残る） */
handover.get('/', async (c) => {
  const orgId = c.req.param('orgId')!
  const roleCtx = c.get('roleContext')
  const schoolYear = c.req.query('school_year') ?? currentSchoolYear()
  const roleId = c.req.query('role_id')

  let query = `
    SELECT h.id, h.title, h.content, h.file_r2_key, h.school_year, h.created_at,
           r.name AS role_name, r.id AS role_id
    FROM handover_items h
    JOIN roles r ON r.id = h.role_id
    WHERE h.organization_id = ? AND h.school_year = ?`
  const binds: string[] = [orgId, schoolYear]

  if (roleId) {
    query += ` AND h.role_id = ?`
    binds.push(roleId)
  } else if (!roleCtx?.permissions.can_manage_org) {
    // 一般役員は自分のRole分のみ
    if (!roleCtx) return c.json({ items: [] })
    query += ` AND h.role_id = ?`
    binds.push(roleCtx.roleId)
  }

  query += ` ORDER BY h.created_at DESC`

  const { results } = await c.env.DB.prepare(query).bind(...binds).all()

  return c.json({ items: results ?? [], school_year: schoolYear })
})

/** 引き継ぎ作成 */
handover.post('/', requireOrgRole('orgId', (p) => p.can_publish === true), async (c) => {
  const orgId = c.req.param('orgId')!
  const roleCtx = c.get('roleContext')!
  const body = await c.req.json<{
    title: string
    content?: string
    role_id?: string
    school_year?: string
    file_r2_key?: string
  }>()

  if (!body.title?.trim()) {
    return c.json({ error: 'title is required' }, 400)
  }

  const targetRoleId = body.role_id ?? roleCtx.roleId
  const role = await c.env.DB.prepare(
    `SELECT id FROM roles WHERE id = ? AND organization_id = ?`,
  )
    .bind(targetRoleId, orgId)
    .first()

  if (!role) return c.json({ error: 'role_not_found' }, 404)

  const id = newId()
  const schoolYear = body.school_year ?? currentSchoolYear()

  await c.env.DB.prepare(
    `INSERT INTO handover_items (id, organization_id, role_id, title, content, file_r2_key, school_year)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      orgId,
      targetRoleId,
      body.title.trim(),
      body.content ?? null,
      body.file_r2_key ?? null,
      schoolYear,
    )
    .run()

  await writeAuditLog(c.env.DB, {
    organizationId: orgId,
    actorRoleId: roleCtx.roleId,
    action: 'handover.created',
    targetType: 'handover_item',
    targetId: id,
  })

  return c.json({ ok: true, id }, 201)
})

/** 引き継ぎ詳細 */
handover.get('/:id', async (c) => {
  const orgId = c.req.param('orgId')!
  const id = c.req.param('id')!
  const roleCtx = c.get('roleContext')

  const row = await c.env.DB.prepare(
    `SELECT h.*, r.name AS role_name
     FROM handover_items h
     JOIN roles r ON r.id = h.role_id
     WHERE h.id = ? AND h.organization_id = ?`,
  )
    .bind(id, orgId)
    .first<{ role_id: string; [key: string]: unknown }>()

  if (!row) return c.json({ error: 'not_found' }, 404)

  const canManage = roleCtx?.permissions.can_manage_org === true
  if (!canManage && roleCtx?.roleId !== row.role_id) {
    return c.json({ error: 'forbidden' }, 403)
  }

  return c.json({ item: row })
})

/** 引き継ぎ更新 */
handover.patch('/:id', requireOrgRole('orgId', (p) => p.can_publish === true), async (c) => {
  const orgId = c.req.param('orgId')!
  const id = c.req.param('id')!
  const roleCtx = c.get('roleContext')!
  const body = await c.req.json<{ title?: string; content?: string; file_r2_key?: string }>()

  const existing = await c.env.DB.prepare(
    `SELECT role_id FROM handover_items WHERE id = ? AND organization_id = ?`,
  )
    .bind(id, orgId)
    .first<{ role_id: string }>()

  if (!existing) return c.json({ error: 'not_found' }, 404)

  const canManage = roleCtx.permissions.can_manage_org === true
  if (!canManage && existing.role_id !== roleCtx.roleId) {
    return c.json({ error: 'forbidden' }, 403)
  }

  await c.env.DB.prepare(
    `UPDATE handover_items SET
       title = COALESCE(?, title),
       content = COALESCE(?, content),
       file_r2_key = COALESCE(?, file_r2_key)
     WHERE id = ?`,
  )
    .bind(body.title ?? null, body.content ?? null, body.file_r2_key ?? null, id)
    .run()

  return c.json({ ok: true })
})

export default handover
