import { Hono } from 'hono'
import type { AppEnv } from '../types/env'
import { requireAuth } from '../middleware/auth'
import { requireOrgMember } from '../middleware/org-membership'
import { requireOrgRole } from '../middleware/role-guard'
import { newId } from '../lib/id'
import { writeAuditLog } from '../lib/audit'

const chat = new Hono<AppEnv>()

chat.use('*', requireAuth, requireOrgMember)

/** 参加可能なチャットチャンネル一覧（自分のRole + 管理権限で全チャンネル） */
chat.get('/channels', async (c) => {
  const orgId = c.req.param('orgId')!
  const roleCtx = c.get('roleContext')

  if (!roleCtx?.permissions.can_publish) {
    return c.json({ error: 'officers_only' }, 403)
  }

  let query = `
    SELECT ch.id, ch.name, ch.role_id, r.name AS role_name, ch.created_at
    FROM chat_channels ch
    JOIN roles r ON r.id = ch.role_id
    WHERE ch.organization_id = ?`
  const binds: string[] = [orgId]

  if (roleCtx.permissions.can_manage_org !== true) {
    query += ` AND ch.role_id = ?`
    binds.push(roleCtx.roleId)
  }

  query += ` ORDER BY ch.name`

  const { results } = await c.env.DB.prepare(query).bind(...binds).all()

  return c.json({ channels: results ?? [] })
})

/** チャンネル作成（can_manage_org） */
chat.post(
  '/channels',
  requireOrgRole('orgId', (p) => p.can_manage_org === true),
  async (c) => {
    const orgId = c.req.param('orgId')!
    const roleCtx = c.get('roleContext')!
    const body = await c.req.json<{ name: string; role_id: string }>()

    if (!body.name?.trim() || !body.role_id) {
      return c.json({ error: 'name and role_id are required' }, 400)
    }

    const role = await c.env.DB.prepare(
      `SELECT id FROM roles WHERE id = ? AND organization_id = ?`,
    )
      .bind(body.role_id, orgId)
      .first()

    if (!role) return c.json({ error: 'role_not_found' }, 404)

    const id = newId()
    await c.env.DB.prepare(
      `INSERT INTO chat_channels (id, organization_id, role_id, name) VALUES (?, ?, ?, ?)`,
    )
      .bind(id, orgId, body.role_id, body.name.trim())
      .run()

    await writeAuditLog(c.env.DB, {
      organizationId: orgId,
      actorRoleId: roleCtx.roleId,
      action: 'chat.channel_created',
      targetType: 'chat_channel',
      targetId: id,
    })

    return c.json({ ok: true, id }, 201)
  },
)

/** メッセージ一覧 */
chat.get('/channels/:channelId/messages', async (c) => {
  const orgId = c.req.param('orgId')!
  const channelId = c.req.param('channelId')!
  const roleCtx = c.get('roleContext')

  if (!roleCtx?.permissions.can_publish) {
    return c.json({ error: 'officers_only' }, 403)
  }

  const channel = await c.env.DB.prepare(
    `SELECT role_id FROM chat_channels WHERE id = ? AND organization_id = ?`,
  )
    .bind(channelId, orgId)
    .first<{ role_id: string }>()

  if (!channel) return c.json({ error: 'not_found' }, 404)

  const canAccess =
    roleCtx.permissions.can_manage_org === true || channel.role_id === roleCtx.roleId
  if (!canAccess) return c.json({ error: 'forbidden' }, 403)

  const limit = Math.min(Number(c.req.query('limit') ?? 50), 100)
  const { results } = await c.env.DB.prepare(
    `SELECT m.id, m.body, m.created_at, r.name AS sender_role_name
     FROM chat_messages m
     JOIN roles r ON r.id = m.sender_role_id
     WHERE m.channel_id = ?
     ORDER BY m.created_at DESC
     LIMIT ?`,
  )
    .bind(channelId, limit)
    .all()

  return c.json({ messages: (results ?? []).reverse() })
})

/** メッセージ投稿（Role名義。個人DMではない） */
chat.post('/channels/:channelId/messages', async (c) => {
  const orgId = c.req.param('orgId')!
  const channelId = c.req.param('channelId')!
  const roleCtx = c.get('roleContext')
  const body = await c.req.json<{ body: string }>()

  if (!roleCtx?.permissions.can_publish) {
    return c.json({ error: 'officers_only' }, 403)
  }
  if (!body.body?.trim()) {
    return c.json({ error: 'body is required' }, 400)
  }

  const channel = await c.env.DB.prepare(
    `SELECT role_id FROM chat_channels WHERE id = ? AND organization_id = ?`,
  )
    .bind(channelId, orgId)
    .first<{ role_id: string }>()

  if (!channel) return c.json({ error: 'not_found' }, 404)

  const canPost =
    roleCtx.permissions.can_manage_org === true || channel.role_id === roleCtx.roleId
  if (!canPost) return c.json({ error: 'forbidden' }, 403)

  const id = newId()
  await c.env.DB.prepare(
    `INSERT INTO chat_messages (id, channel_id, sender_role_id, body) VALUES (?, ?, ?, ?)`,
  )
    .bind(id, channelId, roleCtx.roleId, body.body.trim())
    .run()

  return c.json(
    {
      ok: true,
      message: {
        id,
        body: body.body.trim(),
        sender_role_name: roleCtx.roleName,
        created_at: new Date().toISOString(),
      },
    },
    201,
  )
})

export default chat
