import { newId } from './id'

export async function writeAuditLog(
  db: D1Database,
  params: {
    organizationId: string
    actorRoleId: string | null
    action: string
    targetType?: string
    targetId?: string
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_logs (id, organization_id, actor_role_id, action, target_type, target_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      newId(),
      params.organizationId,
      params.actorRoleId,
      params.action,
      params.targetType ?? null,
      params.targetId ?? null,
    )
    .run()
}
