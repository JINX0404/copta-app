import { createMiddleware } from 'hono/factory'
import type { AppEnv, RoleContext } from '../types/env'
import { parsePermissionSet, type PermissionSet } from '../db/schema'
import { currentSchoolYear } from '../lib/school-year'

export type { RoleContext }

export const requireOrgRole = (
  organizationIdParam: string,
  check: (permissions: PermissionSet) => boolean,
) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const userId = c.get('userId')
    const organizationId = c.req.param(organizationIdParam)
    if (!organizationId) {
      return c.json({ error: 'organization_id_required' }, 400)
    }

    const ctx = await resolveActiveRole(c.env.DB, userId, organizationId)
    if (!ctx) {
      return c.json({ error: 'forbidden' }, 403)
    }

    if (!check(ctx.permissions)) {
      return c.json({ error: 'insufficient_permissions' }, 403)
    }

    c.set('roleContext', ctx)
    await next()
  })

export async function resolveActiveRole(
  db: D1Database,
  userId: string,
  organizationId: string,
): Promise<RoleContext | null> {
  const schoolYear = currentSchoolYear()

  const row = await db
    .prepare(
      `SELECT r.id AS role_id, r.name AS role_name, r.organization_id, r.permission_set
       FROM role_assignments ra
       JOIN roles r ON r.id = ra.role_id
       WHERE ra.user_id = ?
         AND ra.active = 1
         AND ra.school_year = ?
         AND r.organization_id = ?
       ORDER BY
         COALESCE(json_extract(r.permission_set, '$.can_manage_org'), 0) DESC,
         COALESCE(json_extract(r.permission_set, '$.can_publish'), 0) DESC,
         COALESCE(json_extract(r.permission_set, '$.can_view_roster_detail'), 0) DESC
       LIMIT 1`,
    )
    .bind(userId, schoolYear, organizationId)
    .first<{
      role_id: string
      role_name: string
      organization_id: string
      permission_set: string
    }>()

  if (!row) return null

  return {
    roleId: row.role_id,
    roleName: row.role_name,
    organizationId: row.organization_id,
    permissions: parsePermissionSet(row.permission_set),
    schoolYear,
  }
}

export async function getUserOrganizations(
  db: D1Database,
  userId: string,
): Promise<Array<{ organization_id: string; status: string }>> {
  const { results } = await db
    .prepare(
      `SELECT organization_id, status
       FROM organization_memberships
       WHERE user_id = ? AND status = 'active'`,
    )
    .bind(userId)
    .all<{ organization_id: string; status: string }>()

  return results ?? []
}
