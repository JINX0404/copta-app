import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../types/env'
import { resolveActiveRole } from './role-guard'

/** 組織の active メンバーであることを要求。roleContext があればセット */
export const requireOrgMember = createMiddleware<AppEnv>(async (c, next) => {
  const userId = c.get('userId')
  const orgId = c.req.param('orgId')
  if (!orgId) {
    return c.json({ error: 'org_id_required' }, 400)
  }

  const membership = await c.env.DB.prepare(
    `SELECT id FROM organization_memberships
     WHERE user_id = ? AND organization_id = ? AND status = 'active'`,
  )
    .bind(userId, orgId)
    .first()

  if (!membership) {
    return c.json({ error: 'not_a_member' }, 403)
  }

  const roleCtx = await resolveActiveRole(c.env.DB, userId, orgId)
  if (roleCtx) {
    c.set('roleContext', roleCtx)
  }

  await next()
})
