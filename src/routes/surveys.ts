import { Hono } from 'hono'
import type { AppEnv } from '../types/env'
import { requireAuth } from '../middleware/auth'
import { requireOrgMember } from '../middleware/org-membership'
import { requireOrgRole } from '../middleware/role-guard'
import { newId } from '../lib/id'
import { writeAuditLog } from '../lib/audit'

export type SurveyQuestion = {
  id: string
  type: 'single_choice' | 'multi_choice' | 'text' | 'attendance'
  label: string
  options?: string[]
}

const surveys = new Hono<AppEnv>()

surveys.use('*', requireAuth, requireOrgMember)

/** アンケート一覧 */
surveys.get('/', async (c) => {
  const orgId = c.req.param('orgId')!
  const userId = c.get('userId')

  const { results } = await c.env.DB.prepare(
    `SELECT s.id, s.title, s.questions, s.closes_at,
            CASE WHEN sr.id IS NOT NULL THEN 1 ELSE 0 END AS has_submitted
     FROM surveys s
     LEFT JOIN survey_responses sr ON sr.survey_id = s.id AND sr.user_id = ?
     WHERE s.organization_id = ?
     ORDER BY s.closes_at IS NULL DESC, s.closes_at DESC`,
  )
    .bind(userId, orgId)
    .all()

  return c.json({ surveys: results ?? [] })
})

/** アンケート作成 */
surveys.post('/', requireOrgRole('orgId', (p) => p.can_publish === true), async (c) => {
  const orgId = c.req.param('orgId')!
  const roleCtx = c.get('roleContext')!
  const body = await c.req.json<{
    title: string
    questions: SurveyQuestion[]
    closes_at?: string
  }>()

  if (!body.title?.trim() || !body.questions?.length) {
    return c.json({ error: 'title and questions are required' }, 400)
  }

  const id = newId()
  await c.env.DB.prepare(
    `INSERT INTO surveys (id, organization_id, created_by_role_id, title, questions, closes_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, orgId, roleCtx.roleId, body.title.trim(), JSON.stringify(body.questions), body.closes_at ?? null)
    .run()

  await writeAuditLog(c.env.DB, {
    organizationId: orgId,
    actorRoleId: roleCtx.roleId,
    action: 'survey.created',
    targetType: 'survey',
    targetId: id,
  })

  return c.json({ ok: true, id }, 201)
})

/** アンケート詳細 */
surveys.get('/:id', async (c) => {
  const orgId = c.req.param('orgId')!
  const id = c.req.param('id')!

  const row = await c.env.DB.prepare(
    `SELECT id, title, questions, closes_at FROM surveys WHERE id = ? AND organization_id = ?`,
  )
    .bind(id, orgId)
    .first()

  if (!row) return c.json({ error: 'not_found' }, 404)
  return c.json({ survey: row })
})

/** 回答送信 */
surveys.post('/:id/responses', async (c) => {
  const orgId = c.req.param('orgId')!
  const id = c.req.param('id')!
  const userId = c.get('userId')
  const body = await c.req.json<{ answers: Record<string, unknown> }>()

  if (!body.answers) {
    return c.json({ error: 'answers is required' }, 400)
  }

  const survey = await c.env.DB.prepare(
    `SELECT closes_at FROM surveys WHERE id = ? AND organization_id = ?`,
  )
    .bind(id, orgId)
    .first<{ closes_at: string | null }>()

  if (!survey) return c.json({ error: 'not_found' }, 404)
  if (survey.closes_at && new Date(survey.closes_at) < new Date()) {
    return c.json({ error: 'survey_closed' }, 400)
  }

  const existing = await c.env.DB.prepare(
    `SELECT id FROM survey_responses WHERE survey_id = ? AND user_id = ?`,
  )
    .bind(id, userId)
    .first()

  if (existing) {
    return c.json({ error: 'already_submitted' }, 409)
  }

  const responseId = newId()
  await c.env.DB.prepare(
    `INSERT INTO survey_responses (id, survey_id, user_id, answers) VALUES (?, ?, ?, ?)`,
  )
    .bind(responseId, id, userId, JSON.stringify(body.answers))
    .run()

  return c.json({ ok: true, response_id: responseId }, 201)
})

/** 集計（役員向け） */
surveys.get('/:id/summary', requireOrgRole('orgId', (p) => p.can_publish === true), async (c) => {
  const orgId = c.req.param('orgId')!
  const id = c.req.param('id')!

  const survey = await c.env.DB.prepare(
    `SELECT title, questions FROM surveys WHERE id = ? AND organization_id = ?`,
  )
    .bind(id, orgId)
    .first<{ title: string; questions: string }>()

  if (!survey) return c.json({ error: 'not_found' }, 404)

  const questions = JSON.parse(survey.questions) as SurveyQuestion[]
  const { results: responses } = await c.env.DB.prepare(
    `SELECT answers FROM survey_responses WHERE survey_id = ?`,
  )
    .bind(id)
    .all<{ answers: string }>()

  const totalResponses = responses?.length ?? 0
  const summary = questions.map((q) => {
    const counts: Record<string, number> = {}
    let textAnswers: string[] = []

    for (const r of responses ?? []) {
      const answers = JSON.parse(r.answers) as Record<string, unknown>
      const val = answers[q.id]
      if (q.type === 'text') {
        if (typeof val === 'string' && val) textAnswers.push(val)
      } else if (q.type === 'attendance' || q.type === 'single_choice') {
        const key = String(val ?? '未回答')
        counts[key] = (counts[key] ?? 0) + 1
      } else if (q.type === 'multi_choice' && Array.isArray(val)) {
        for (const v of val) {
          const key = String(v)
          counts[key] = (counts[key] ?? 0) + 1
        }
      }
    }

    return {
      question_id: q.id,
      label: q.label,
      type: q.type,
      response_count: totalResponses,
      counts: q.type === 'text' ? undefined : counts,
      text_samples: q.type === 'text' ? textAnswers.slice(0, 20) : undefined,
    }
  })

  return c.json({ title: survey.title, total_responses: totalResponses, summary })
})

export default surveys
