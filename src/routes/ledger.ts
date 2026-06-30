import { Hono } from 'hono'
import type { AppEnv } from '../types/env'
import { requireAuth } from '../middleware/auth'
import { requireOrgMember } from '../middleware/org-membership'
import { requireOrgRole } from '../middleware/role-guard'
import { newId } from '../lib/id'
import { writeAuditLog } from '../lib/audit'

const ledger = new Hono<AppEnv>()

ledger.use('*', requireAuth, requireOrgMember)

/** 自分の請求一覧 / 役員は全件 */
ledger.get('/payments', async (c) => {
  const orgId = c.req.param('orgId')!
  const userId = c.get('userId')
  const roleCtx = c.get('roleContext')
  const canViewAll = roleCtx?.permissions.can_view_finance === true

  let query = `
    SELECT pr.id, pr.title, pr.amount_yen, pr.category, pr.status, pr.due_at, pr.created_at,
           u.display_name AS user_name, c.grade_label, c.class_name
    FROM payment_requests pr
    JOIN users u ON u.id = pr.user_id
    LEFT JOIN children c ON c.id = pr.child_id
    WHERE pr.organization_id = ?`
  const binds: string[] = [orgId]

  if (!canViewAll) {
    query += ` AND pr.user_id = ?`
    binds.push(userId)
  }
  query += ` ORDER BY pr.status ASC, pr.created_at DESC`

  const { results } = await c.env.DB.prepare(query).bind(...binds).all()
  return c.json({ payments: results ?? [] })
})

/** 請求作成（役員・会計権限） */
ledger.post(
  '/payments',
  requireOrgRole('orgId', (p) => p.can_view_finance === true || p.can_manage_org === true),
  async (c) => {
    const orgId = c.req.param('orgId')!
    const roleCtx = c.get('roleContext')!
    const body = await c.req.json<{
      user_id: string
      child_id?: string
      title: string
      amount_yen: number
      category?: string
      due_at?: string
    }>()

    if (!body.user_id || !body.title || !body.amount_yen) {
      return c.json({ error: 'user_id, title, amount_yen required' }, 400)
    }

    const id = newId()
    await c.env.DB.prepare(
      `INSERT INTO payment_requests
         (id, organization_id, user_id, child_id, title, amount_yen, category, due_at, created_by_role_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        orgId,
        body.user_id,
        body.child_id ?? null,
        body.title.trim(),
        body.amount_yen,
        body.category ?? '会費',
        body.due_at ?? null,
        roleCtx.roleId,
      )
      .run()

    await writeAuditLog(c.env.DB, {
      organizationId: orgId,
      actorRoleId: roleCtx.roleId,
      action: 'payment_request.created',
      targetType: 'payment_request',
      targetId: id,
    })

    return c.json({ ok: true, id }, 201)
  },
)

/** 一括請求（全 active 保護者） */
ledger.post(
  '/payments/bulk',
  requireOrgRole('orgId', (p) => p.can_view_finance === true || p.can_manage_org === true),
  async (c) => {
    const orgId = c.req.param('orgId')!
    const roleCtx = c.get('roleContext')!
    const body = await c.req.json<{
      title: string
      amount_yen: number
      category?: string
      due_at?: string
    }>()

    const { results: members } = await c.env.DB.prepare(
      `SELECT DISTINCT om.user_id FROM organization_memberships om
       WHERE om.organization_id = ? AND om.status = 'active'`,
    )
      .bind(orgId)
      .all<{ user_id: string }>()

    const ids: string[] = []
    for (const m of members ?? []) {
      const id = newId()
      await c.env.DB.prepare(
        `INSERT INTO payment_requests
           (id, organization_id, user_id, title, amount_yen, category, due_at, created_by_role_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          id,
          orgId,
          m.user_id,
          body.title,
          body.amount_yen,
          body.category ?? '会費',
          body.due_at ?? null,
          roleCtx.roleId,
        )
        .run()
      ids.push(id)
    }

    return c.json({ ok: true, created: ids.length })
  },
)

/** ダミー決済（POC_MODE のみ。実決済代行は Phase 1） */
ledger.post('/payments/:id/pay-demo', async (c) => {
  if (c.env.POC_MODE !== 'true') {
    return c.json({ error: 'demo_payment_disabled' }, 403)
  }

  const orgId = c.req.param('orgId')!
  const id = c.req.param('id')!
  const userId = c.get('userId')

  const req = await c.env.DB.prepare(
    `SELECT id, user_id, amount_yen, category, title, status, organization_id
     FROM payment_requests WHERE id = ? AND organization_id = ?`,
  )
    .bind(id, orgId)
    .first<{
      id: string
      user_id: string
      amount_yen: number
      category: string
      title: string
      status: string
      organization_id: string
    }>()

  if (!req) return c.json({ error: 'not_found' }, 404)
  if (req.user_id !== userId) {
    const roleCtx = c.get('roleContext')
    if (!roleCtx?.permissions.can_view_finance) {
      return c.json({ error: 'forbidden' }, 403)
    }
  }
  if (req.status === 'paid') return c.json({ error: 'already_paid' }, 400)

  let method = 'credit_card'
  try {
    const body = await c.req.json<{ payment_method?: string }>()
    if (body.payment_method) method = body.payment_method
  } catch {
    /* no body */
  }

  const providerRef = `DEMO-${newId().slice(0, 8)}`

  await c.env.DB.prepare(
    `UPDATE payment_requests SET status = 'paid', payment_provider_ref = ?, payment_method = ?, paid_at = datetime('now') WHERE id = ?`,
  )
    .bind(providerRef, method, id)
    .run()

  await c.env.DB.prepare(
    `INSERT INTO ledger_entries
       (id, organization_id, entry_type, category, amount_yen, related_user_id, payment_provider_ref, payment_method)
     VALUES (?, ?, 'income', ?, ?, ?, ?, ?)`,
  )
    .bind(newId(), orgId, req.category, req.amount_yen, req.user_id, providerRef, method)
    .run()

  return c.json({ ok: true, payment_provider_ref: providerRef, message: 'demo_payment_completed' })
})

/** 入金履歴（役員向け） */
ledger.get(
  '/ledger',
  requireOrgRole('orgId', (p) => p.can_view_finance === true),
  async (c) => {
    const orgId = c.req.param('orgId')!
    const { results } = await c.env.DB.prepare(
      `SELECT le.id, le.category, le.amount_yen, le.payment_provider_ref, le.created_at,
              u.display_name AS payer_name
       FROM ledger_entries le
       LEFT JOIN users u ON u.id = le.related_user_id
       WHERE le.organization_id = ? AND le.entry_type = 'income'
       ORDER BY le.created_at DESC LIMIT 50`,
    )
      .bind(orgId)
      .all()

    return c.json({ entries: results ?? [] })
  },
)

export default ledger
