import { Hono } from 'hono'
import type { AppEnv } from '../types/env'
import { requireAuth } from '../middleware/auth'
import { requireOrgMember } from '../middleware/org-membership'
import { requireOrgRole } from '../middleware/role-guard'
import { newId } from '../lib/id'
import { newToken } from '../lib/crypto'
import { maskDisplayName } from '../lib/segment'
import { writeAuditLog } from '../lib/audit'
import { currentSchoolYear } from '../lib/school-year'
import type { OrganizationType, SchoolType } from '../db/schema'

const org = new Hono<AppEnv>()

/** 団体作成（開発・オンボーディング用） */
org.post('/', requireAuth, async (c) => {
  const body = await c.req.json<{
    name: string
    type: OrganizationType
    school_name?: string
    school_type?: SchoolType
    final_grade_label?: string
  }>()

  if (!body.name || !body.type) {
    return c.json({ error: 'name and type are required' }, 400)
  }

  const orgId = newId()
  await c.env.DB.prepare(
    `INSERT INTO organizations (id, name, type, school_name, school_type, final_grade_label)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      orgId,
      body.name,
      body.type,
      body.school_name ?? null,
      body.school_type ?? null,
      body.final_grade_label ?? null,
    )
    .run()

  return c.json({ ok: true, organization: { id: orgId, name: body.name } }, 201)
})

const scoped = new Hono<AppEnv>()
scoped.use('*', requireAuth, requireOrgMember)

/** 団体情報 */
scoped.get('/', async (c) => {
  const orgId = c.req.param('orgId')!
  const row = await c.env.DB.prepare(
    `SELECT id, name, type, school_name, school_type, final_grade_label, created_at
     FROM organizations WHERE id = ?`,
  )
    .bind(orgId)
    .first()

  if (!row) return c.json({ error: 'not_found' }, 404)
  return c.json({ organization: row })
})

/** ゼロトラスト名簿 */
scoped.get('/roster', async (c) => {
  const orgId = c.req.param('orgId')!
  const roleCtx = c.get('roleContext')
  const canViewDetail = roleCtx?.permissions.can_view_roster_detail === true

  const { results: children } = await c.env.DB.prepare(
    `SELECT c.id, c.class_name, c.grade_label, c.status,
            CASE WHEN uc.user_id IS NOT NULL THEN 1 ELSE 0 END AS is_registered,
            u.display_name AS parent_name
     FROM children c
     LEFT JOIN user_children uc ON uc.child_id = c.id
     LEFT JOIN users u ON u.id = uc.user_id
     WHERE c.organization_id = ? AND c.status = 'active'
     ORDER BY c.grade_label, c.class_name`,
  )
    .bind(orgId)
    .all<{
      id: string
      class_name: string | null
      grade_label: string | null
      status: string
      is_registered: number
      parent_name: string | null
    }>()

  const roster = (children ?? []).map((child) => ({
    id: child.id,
    grade_label: child.grade_label,
    class_name: child.class_name,
    registered: child.is_registered === 1,
    parent_display_name: canViewDetail && child.parent_name
      ? maskDisplayName(child.parent_name)
      : null,
  }))

  return c.json({ roster, detail_visible: canViewDetail })
})

scoped.get('/roster/unregistered', async (c) => {
  const orgId = c.req.param('orgId')!
  const roleCtx = c.get('roleContext')
  if (!roleCtx?.permissions.can_view_roster_detail) {
    return c.json({ error: 'insufficient_permissions' }, 403)
  }

  const { results } = await c.env.DB.prepare(
    `SELECT c.id, c.grade_label, c.class_name, c.child_code
     FROM children c
     LEFT JOIN user_children uc ON uc.child_id = c.id
     WHERE c.organization_id = ? AND c.status = 'active' AND uc.user_id IS NULL
     ORDER BY c.grade_label, c.class_name`,
  )
    .bind(orgId)
    .all()

  return c.json({ unregistered: results ?? [] })
})

scoped.get('/roster/unregistered/print', async (c) => {
  const orgId = c.req.param('orgId')!
  const roleCtx = c.get('roleContext')
  if (!roleCtx?.permissions.can_view_roster_detail) {
    return c.json({ error: 'insufficient_permissions' }, 403)
  }

  const organization = await c.env.DB.prepare(
    `SELECT name, school_name FROM organizations WHERE id = ?`,
  )
    .bind(orgId)
    .first<{ name: string; school_name: string | null }>()

  const { results } = await c.env.DB.prepare(
    `SELECT c.grade_label, c.class_name, c.child_code
     FROM children c
     LEFT JOIN user_children uc ON uc.child_id = c.id
     WHERE c.organization_id = ? AND c.status = 'active' AND uc.user_id IS NULL
     ORDER BY c.grade_label, c.class_name`,
  )
    .bind(orgId)
    .all<{ grade_label: string | null; class_name: string | null; child_code: string }>()

  const byClass = new Map<string, typeof results>()
  for (const row of results ?? []) {
    const key = `${row.grade_label ?? ''}-${row.class_name ?? ''}`
    if (!byClass.has(key)) byClass.set(key, [])
    byClass.get(key)!.push(row)
  }

  return c.json({
    title: `${organization?.school_name ?? organization?.name ?? ''} — 未登録一覧`,
    generated_at: new Date().toISOString(),
    instructions:
      '以下のお子さまの保護者の方は、配布された子どもIDコードでアプリ登録をお願いします。',
    sections: [...byClass.entries()].map(([, rows]) => ({
      grade_label: rows[0]?.grade_label,
      class_name: rows[0]?.class_name,
      count: rows.length,
      items: rows.map((r) => ({
        label: `${r.grade_label ?? ''}${r.class_name ?? ''}`,
        child_code_hint: r.child_code.slice(0, 4) + '****',
      })),
    })),
  })
})

scoped.post('/children', requireOrgRole('orgId', (p) => p.can_manage_org === true), async (c) => {
  const orgId = c.req.param('orgId')!
  const roleCtx = c.get('roleContext')!
  const body = await c.req.json<{
    class_name?: string
    grade_label?: string
    child_code?: string
  }>()

  const childCode = body.child_code?.trim() || `CHILD-${newToken().slice(0, 8).toUpperCase()}`
  const childId = newId()

  await c.env.DB.prepare(
    `INSERT INTO children (id, organization_id, class_name, grade_label, child_code, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
  )
    .bind(childId, orgId, body.class_name ?? null, body.grade_label ?? null, childCode)
    .run()

  await writeAuditLog(c.env.DB, {
    organizationId: orgId,
    actorRoleId: roleCtx.roleId,
    action: 'child.created',
    targetType: 'child',
    targetId: childId,
  })

  return c.json({ ok: true, child: { id: childId, child_code: childCode } }, 201)
})

scoped.get('/dashboard', async (c) => {
  const orgId = c.req.param('orgId')!
  const roleCtx = c.get('roleContext')
  if (!roleCtx?.permissions.can_publish && !roleCtx?.permissions.can_manage_org) {
    return c.json({ error: 'insufficient_permissions' }, 403)
  }

  const unpaidRow = await c.env.DB
    .prepare(
      `SELECT COUNT(DISTINCT user_id) AS cnt FROM payment_requests
       WHERE organization_id = ? AND status = 'pending'`,
    )
    .bind(orgId)
    .first<{ cnt: number }>()

  const unreadRow = await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT om.user_id) AS cnt
     FROM organization_memberships om
     WHERE om.organization_id = ? AND om.status = 'active'
       AND om.user_id NOT IN (
         SELECT ar.user_id FROM announcement_reads ar
         JOIN announcements a ON a.id = ar.announcement_id
         WHERE a.organization_id = ? AND a.approval_status = 'published'
           AND a.published_at >= datetime('now', '-30 days')
       )`,
  )
    .bind(orgId, orgId)
    .first<{ cnt: number }>()

  const eventsRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM volunteer_calls
     WHERE organization_id = ?
       AND event_datetime >= datetime('now', 'weekday 0', '-6 days')
       AND event_datetime < datetime('now', 'weekday 0', '+7 days')`,
  )
    .bind(orgId)
    .first<{ cnt: number }>()

  const surveyRow = await c.env.DB.prepare(
    `SELECT
       COUNT(DISTINCT s.id) AS total_surveys,
       COUNT(DISTINCT sr.user_id) AS total_responses,
       (SELECT COUNT(*) FROM organization_memberships
        WHERE organization_id = ? AND status = 'active') AS member_count
     FROM surveys s
     LEFT JOIN survey_responses sr ON sr.survey_id = s.id
     WHERE s.organization_id = ?
       AND (s.closes_at IS NULL OR s.closes_at > datetime('now'))`,
  )
    .bind(orgId, orgId)
    .first<{ total_surveys: number; total_responses: number; member_count: number }>()

  const memberCount = surveyRow?.member_count ?? 1
  const surveyTotal = surveyRow?.total_surveys ?? 0
  const responseRate =
    surveyTotal === 0
      ? null
      : Math.round(((surveyRow?.total_responses ?? 0) / (surveyTotal * memberCount)) * 100)

  return c.json({
    unpaid_count: unpaidRow?.cnt ?? 0,
    unread_count: unreadRow?.cnt ?? 0,
    events_this_week: eventsRow?.cnt ?? 0,
    survey_response_rate_percent: responseRate,
  })
})

scoped.get('/roles', async (c) => {
  const orgId = c.req.param('orgId')!
  const { results } = await c.env.DB.prepare(
    `SELECT id, name, permission_set FROM roles WHERE organization_id = ?`,
  )
    .bind(orgId)
    .all()

  return c.json({ roles: results ?? [] })
})

scoped.post(
  '/roles/:roleId/assign',
  requireOrgRole('orgId', (p) => p.can_manage_roles === true),
  async (c) => {
    const orgId = c.req.param('orgId')!
    const roleId = c.req.param('roleId')!
    const roleCtx = c.get('roleContext')!
    const body = await c.req.json<{ user_id: string; school_year?: string }>()

    if (!body.user_id) {
      return c.json({ error: 'user_id is required' }, 400)
    }

    const role = await c.env.DB.prepare(
      `SELECT id FROM roles WHERE id = ? AND organization_id = ?`,
    )
      .bind(roleId, orgId)
      .first()

    if (!role) return c.json({ error: 'role_not_found' }, 404)

    const schoolYear = body.school_year ?? currentSchoolYear()
    const assignmentId = newId()

    await c.env.DB.prepare(
      `INSERT INTO role_assignments (id, user_id, role_id, school_year, active)
       VALUES (?, ?, ?, ?, 1)`,
    )
      .bind(assignmentId, body.user_id, roleId, schoolYear)
      .run()

    await writeAuditLog(c.env.DB, {
      organizationId: orgId,
      actorRoleId: roleCtx.roleId,
      action: 'role.assigned',
      targetType: 'role_assignment',
      targetId: assignmentId,
    })

    return c.json({ ok: true, assignment_id: assignmentId }, 201)
  },
)

org.route('/:orgId', scoped)

export default org
