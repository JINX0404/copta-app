import { Hono } from 'hono'
import type { AppEnv } from '../types/env'
import { esc, layout } from '../lib/html'
import { POC_CSS } from '../lib/poc-css'
import { resolveSessionUser, POC_ORG_ID } from '../lib/session'
import { resolveActiveRole } from '../middleware/role-guard'
import { parseSegment, segmentMatchesUser } from '../lib/segment'
import { currentSchoolYear } from '../lib/school-year'
import { clearSessionCookie } from '../middleware/auth'

const ui = new Hono<AppEnv>()

ui.get('/assets/poc.css', (c) => {
  c.header('Cache-Control', 'public, max-age=86400')
  return c.body(POC_CSS, 200, { 'Content-Type': 'text/css; charset=utf-8' })
})

function nav(active: string, isOfficer: boolean): string {
  const items = [
    { href: '/app', key: 'home', icon: '🏠', label: 'ホーム' },
    { href: '/app/announcements', key: 'ann', icon: '📢', label: 'お知らせ' },
    { href: '/app/surveys', key: 'sur', icon: '📋', label: 'アンケート' },
  ]
  if (isOfficer) {
    items.push({ href: '/app/officer', key: 'off', icon: '⚙️', label: '役員' })
  }
  return `<nav class="bottom-nav">${items
    .map(
      (i) =>
        `<a href="${i.href}" class="${active === i.key ? 'active' : ''}"><span>${i.icon}</span>${i.label}</a>`,
    )
    .join('')}</nav>`
}

function header(name: string, sub: string): string {
  return `<header class="app-header"><h1>${esc(name)}</h1><p>${esc(sub)}</p></header>`
}

ui.get('/', (c) => c.redirect('/app'))

/** ログイン画面 */
ui.get('/app', async (c) => {
  const user = await resolveSessionUser(c.env.DB, c.req.header('Cookie'))
  if (user) return c.redirect('/app/home')

  const poc = c.env.POC_MODE === 'true'
  const body = `
    <div class="login-hero">
      <h1>COPTA</h1>
      <p>PTA運営OS — デモ体験</p>
    </div>
    <main>
      <div class="alert">⚠️ これはPOCデモです。データはすべてダミーです。</div>
      ${
        poc
          ? `<div class="card">
        <h2>デモアカウントでログイン</h2>
        <p class="meta">ワンクリックで各ロールを体験できます</p>
        <div class="demo-grid">
          <a class="btn btn-primary" href="/auth/demo-login/parent">👩‍👧 保護者（田中 花子）</a>
          <a class="btn btn-accent" href="/auth/demo-login/koho">📣 広報委員（佐藤）</a>
          <a class="btn btn-secondary" href="/auth/demo-login/president">👔 会長（鈴木）</a>
        </div>
      </div>`
          : `<div class="card"><p>ログインはマジックリンクをご利用ください。</p></div>`
      }
      <div class="card">
        <h2>子どもIDで新規登録</h2>
        <p class="meta">未登録の保護者向け — コード例: SAKURA-2-1-002</p>
        <p class="meta">先にデモアカウントでログイン後、API POST /auth/register/child をご利用ください</p>
      </div>
    </main>`
  return c.html(layout('ログイン', body))
})

/** ホーム */
ui.get('/app/home', async (c) => {
  const user = await resolveSessionUser(c.env.DB, c.req.header('Cookie'))
  if (!user) return c.redirect('/app')

  const roleCtx = await resolveActiveRole(c.env.DB, user.userId, POC_ORG_ID)
  const isOfficer = roleCtx?.permissions.can_publish === true

  const { results: children } = await c.env.DB.prepare(
    `SELECT c.grade_label, c.class_name FROM user_children uc
     JOIN children c ON c.id = uc.child_id WHERE uc.user_id = ?`,
  )
    .bind(user.userId)
    .all<{ grade_label: string | null; class_name: string | null }>()

  const childTags = (children ?? [])
    .map((ch) => `${ch.grade_label ?? ''}${ch.class_name ?? ''}`)
    .join(' / ')

  let officerBlock = ''
  if (isOfficer) {
    const dash = await c.env.DB.prepare(
      `SELECT COUNT(DISTINCT om.user_id) AS unread
       FROM organization_memberships om
       WHERE om.organization_id = ? AND om.status = 'active'
         AND om.user_id NOT IN (
           SELECT ar.user_id FROM announcement_reads ar
           JOIN announcements a ON a.id = ar.announcement_id
           WHERE a.organization_id = ? AND a.approval_status = 'published'
         )`,
    )
      .bind(POC_ORG_ID, POC_ORG_ID)
      .first<{ unread: number }>()

    officerBlock = `
      <div class="stats-grid">
        <div class="stat"><div class="num">${dash?.unread ?? 0}</div><div class="label">未読保護者</div></div>
        <div class="stat"><div class="num">—</div><div class="label">未払い（Phase1）</div></div>
      </div>
      <p style="margin-top:12px"><a class="btn btn-sm btn-primary" href="/app/officer">役員ダッシュボード →</a></p>`
  }

  const body = `
    ${header(user.display_name, `さくら小学校PTA${roleCtx ? ` · ${roleCtx.roleName}` : ''}`)}
    <main>
      ${childTags ? `<div class="card"><p>お子さま: <strong>${esc(childTags)}</strong></p></div>` : ''}
      ${officerBlock}
      <div class="card">
        <h2>クイックリンク</h2>
        <a class="btn btn-secondary" href="/app/announcements">お知らせを見る</a>
        <a class="btn btn-secondary" href="/app/surveys">出欠・アンケート</a>
      </div>
      <a class="btn btn-secondary" href="/app/logout">ログアウト</a>
    </main>
    ${nav('home', !!isOfficer)}`

  return c.html(layout('ホーム', body))
})

/** お知らせ一覧 */
ui.get('/app/announcements', async (c) => {
  const user = await resolveSessionUser(c.env.DB, c.req.header('Cookie'))
  if (!user) return c.redirect('/app')

  const roleCtx = await resolveActiveRole(c.env.DB, user.userId, POC_ORG_ID)
  const isOfficer = roleCtx?.permissions.can_publish === true

  const { results: userChildren } = await c.env.DB.prepare(
    `SELECT c.grade_label, c.class_name FROM user_children uc
     JOIN children c ON c.id = uc.child_id
     WHERE uc.user_id = ? AND c.organization_id = ?`,
  )
    .bind(user.userId, POC_ORG_ID)
    .all<{ grade_label: string | null; class_name: string | null }>()

  const { results: all } = await c.env.DB.prepare(
    `SELECT a.id, a.title, a.body, a.segment, a.requires_response, a.approval_status,
            a.published_at, CASE WHEN ar.user_id IS NOT NULL THEN 1 ELSE 0 END AS is_read
     FROM announcements a
     LEFT JOIN announcement_reads ar ON ar.announcement_id = a.id AND ar.user_id = ?
     WHERE a.organization_id = ?
     ORDER BY COALESCE(a.published_at, '1970-01-01') DESC`,
  )
    .bind(user.userId, POC_ORG_ID)
    .all<{
      id: string
      title: string
      body: string
      segment: string
      requires_response: number
      approval_status: string
      published_at: string | null
      is_read: number
    }>()

  const filtered = (all ?? []).filter((a) => {
    if (isOfficer) return true
    if (a.approval_status !== 'published') return false
    return segmentMatchesUser(parseSegment(a.segment), userChildren ?? [])
  })

  const cards =
    filtered.length === 0
      ? `<div class="empty">お知らせはありません</div>`
      : filtered
          .map(
            (a) => `
      <div class="card">
        <div>${a.is_read ? '' : '<span class="badge unread">未読</span> '}
        ${a.approval_status !== 'published' ? `<span class="badge officer">${esc(a.approval_status)}</span> ` : ''}
        ${a.requires_response ? '<span class="badge">要返信</span>' : ''}</div>
        <h2>${esc(a.title)}</h2>
        <p>${esc(a.body.slice(0, 120))}${a.body.length > 120 ? '…' : ''}</p>
        <p class="meta">${esc(a.published_at ?? '未公開')}</p>
        <a class="btn btn-sm btn-primary" href="/app/announcements/${a.id}">詳細</a>
      </div>`,
          )
          .join('')

  const body = `
    ${header('お知らせ', 'さくら小学校PTA')}
    <main>${cards}</main>
    ${nav('ann', !!isOfficer)}`

  return c.html(layout('お知らせ', body))
})

ui.get('/app/announcements/:id', async (c) => {
  const user = await resolveSessionUser(c.env.DB, c.req.header('Cookie'))
  if (!user) return c.redirect('/app')
  const id = c.req.param('id')!

  const row = await c.env.DB.prepare(
    `SELECT title, body, requires_response, approval_status FROM announcements WHERE id = ?`,
  )
    .bind(id)
    .first<{ title: string; body: string; requires_response: number; approval_status: string }>()

  if (!row) return c.text('Not found', 404)

  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO announcement_reads (announcement_id, user_id) VALUES (?, ?)`,
  )
    .bind(id, user.userId)
    .run()

  const roleCtx = await resolveActiveRole(c.env.DB, user.userId, POC_ORG_ID)

  const body = `
    ${header(row.title, row.approval_status)}
    <main>
      <div class="card"><p>${esc(row.body).replace(/\n/g, '<br>')}</p></div>
      ${
        row.requires_response
          ? `<form method="post" action="/app/announcements/${id}/respond">
        <button class="btn btn-primary" type="submit">確認しました（返信）</button>
      </form>`
          : ''
      }
      <a class="btn btn-secondary" href="/app/announcements">← 一覧</a>
    </main>
    ${nav('ann', roleCtx?.permissions.can_publish === true)}`

  return c.html(layout(row.title, body))
})

ui.post('/app/announcements/:id/respond', async (c) => {
  const user = await resolveSessionUser(c.env.DB, c.req.header('Cookie'))
  if (!user) return c.redirect('/app')
  const id = c.req.param('id')!
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO announcement_responses (announcement_id, user_id) VALUES (?, ?)`,
  )
    .bind(id, user.userId)
    .run()
  return c.redirect(`/app/announcements/${id}`)
})

/** アンケート */
ui.get('/app/surveys', async (c) => {
  const user = await resolveSessionUser(c.env.DB, c.req.header('Cookie'))
  if (!user) return c.redirect('/app')

  const roleCtx = await resolveActiveRole(c.env.DB, user.userId, POC_ORG_ID)

  const { results } = await c.env.DB.prepare(
    `SELECT s.id, s.title, s.questions,
            CASE WHEN sr.id IS NOT NULL THEN 1 ELSE 0 END AS submitted
     FROM surveys s
     LEFT JOIN survey_responses sr ON sr.survey_id = s.id AND sr.user_id = ?
     WHERE s.organization_id = ?`,
  )
    .bind(user.userId, POC_ORG_ID)
    .all<{ id: string; title: string; questions: string; submitted: number }>()

  const cards = (results ?? [])
    .map((s) => {
      const qs = JSON.parse(s.questions) as Array<{ id: string; label: string; options?: string[] }>
      const q = qs[0]
      const form =
        s.submitted === 1
          ? `<p class="meta">✅ 回答済み</p>`
          : `<form method="post" action="/app/surveys/${s.id}/respond">
          <p><strong>${esc(q?.label ?? '')}</strong></p>
          ${(q?.options ?? [])
            .map(
              (o) =>
                `<label><input type="radio" name="answer" value="${esc(o)}" required> ${esc(o)}</label><br>`,
            )
            .join('')}
          <button class="btn btn-primary" type="submit" style="margin-top:12px">送信</button>
        </form>`
      return `<div class="card"><h2>${esc(s.title)}</h2>${form}</div>`
    })
    .join('')

  const body = `
    ${header('出欠・アンケート', 'さくら小学校PTA')}
    <main>${cards || '<div class="empty">アンケートはありません</div>'}</main>
    ${nav('sur', roleCtx?.permissions.can_publish === true)}`

  return c.html(layout('アンケート', body))
})

ui.post('/app/surveys/:id/respond', async (c) => {
  const user = await resolveSessionUser(c.env.DB, c.req.header('Cookie'))
  if (!user) return c.redirect('/app')
  const id = c.req.param('id')!
  const form = await c.req.parseBody()
  const answer = String(form.answer ?? '')

  const survey = await c.env.DB.prepare(`SELECT questions FROM surveys WHERE id = ?`)
    .bind(id)
    .first<{ questions: string }>()
  if (!survey) return c.text('Not found', 404)

  const qs = JSON.parse(survey.questions) as Array<{ id: string }>
  const qid = qs[0]?.id ?? 'q1'

  const existing = await c.env.DB.prepare(
    `SELECT 1 FROM survey_responses WHERE survey_id = ? AND user_id = ?`,
  )
    .bind(id, user.userId)
    .first()

  if (!existing) {
    await c.env.DB.prepare(
      `INSERT INTO survey_responses (id, survey_id, user_id, answers) VALUES (?, ?, ?, ?)`,
    )
      .bind(crypto.randomUUID(), id, user.userId, JSON.stringify({ [qid]: answer }))
      .run()
  }

  return c.redirect('/app/surveys')
})

/** 役員向け */
ui.get('/app/officer', async (c) => {
  const user = await resolveSessionUser(c.env.DB, c.req.header('Cookie'))
  if (!user) return c.redirect('/app')

  const roleCtx = await resolveActiveRole(c.env.DB, user.userId, POC_ORG_ID)
  if (!roleCtx?.permissions.can_publish) {
    return c.redirect('/app/home')
  }

  const unreadRow = await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT om.user_id) AS cnt
     FROM organization_memberships om
     WHERE om.organization_id = ? AND om.status = 'active'
       AND om.user_id NOT IN (
         SELECT ar.user_id FROM announcement_reads ar
         JOIN announcements a ON a.id = ar.announcement_id
         WHERE a.organization_id = ? AND a.approval_status = 'published'
       )`,
  )
    .bind(POC_ORG_ID, POC_ORG_ID)
    .first<{ cnt: number }>()

  const eventsRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM volunteer_calls WHERE organization_id = ?`,
  )
    .bind(POC_ORG_ID)
    .first<{ cnt: number }>()

  const dash = {
    unread_count: unreadRow?.cnt ?? 0,
    events_this_week: eventsRow?.cnt ?? 0,
    unpaid_count: 0,
    survey_response_rate_percent: null as number | null,
  }

  const { results: roster } = await c.env.DB.prepare(
    `SELECT c.grade_label, c.class_name,
            CASE WHEN uc.user_id IS NOT NULL THEN 1 ELSE 0 END AS registered
     FROM children c LEFT JOIN user_children uc ON uc.child_id = c.id
     WHERE c.organization_id = ? AND c.status = 'active'
     ORDER BY c.grade_label, c.class_name`,
  )
    .bind(POC_ORG_ID)
    .all<{ grade_label: string | null; class_name: string | null; registered: number }>()

  const { results: handover } = await c.env.DB.prepare(
    `SELECT h.title, h.content, r.name AS role_name FROM handover_items h
     JOIN roles r ON r.id = h.role_id WHERE h.organization_id = ?`,
  )
    .bind(POC_ORG_ID)
    .all<{ title: string; content: string | null; role_name: string }>()

  const { results: messages } = await c.env.DB.prepare(
    `SELECT m.body, r.name AS role_name FROM chat_messages m
     JOIN roles r ON r.id = m.sender_role_id
     JOIN chat_channels ch ON ch.id = m.channel_id
     WHERE ch.organization_id = ? ORDER BY m.created_at`,
  )
    .bind(POC_ORG_ID)
    .all<{ body: string; role_name: string }>()

  const rosterRows = (roster ?? [])
    .map(
      (r) =>
        `<tr><td>${esc(r.grade_label)}${esc(r.class_name)}</td><td>${r.registered ? '✅' : '❌ 未登録'}</td></tr>`,
    )
    .join('')

  const body = `
    ${header('役員ダッシュボード', roleCtx.roleName)}
    <main>
      <div class="stats-grid">
        <div class="stat"><div class="num">${dash.unread_count ?? 0}</div><div class="label">未読</div></div>
        <div class="stat"><div class="num">${dash.events_this_week ?? 0}</div><div class="label">今週イベント</div></div>
        <div class="stat"><div class="num">${dash.unpaid_count ?? 0}</div><div class="label">未払い</div></div>
        <div class="stat"><div class="num">${dash.survey_response_rate_percent ?? '—'}${dash.survey_response_rate_percent != null ? '%' : ''}</div><div class="label">回答率</div></div>
      </div>
      <div class="card">
        <h2>名簿（ゼロトラスト）</h2>
        <table class="roster"><tr><th>学年組</th><th>登録</th></tr>${rosterRows}</table>
      </div>
      <div class="card">
        <h2>引き継ぎボックス</h2>
        ${(handover ?? []).map((h) => `<p><strong>${esc(h.title)}</strong> (${esc(h.role_name)})<br>${esc(h.content ?? '')}</p>`).join('') || '<p class="meta">なし</p>'}
      </div>
      <div class="card">
        <h2>役員チャット</h2>
        ${(messages ?? []).map((m) => `<div class="chat-msg"><div class="who">${esc(m.role_name)}</div>${esc(m.body)}</div>`).join('') || '<p class="meta">なし</p>'}
      </div>
      ${
        roleCtx.permissions.can_manage_org
          ? `<form method="post" action="/app/officer/publish">
        <button class="btn btn-accent" type="submit">下書きお知らせを公開する（デモ）</button>
      </form>`
          : ''
      }
    </main>
    ${nav('off', true)}`

  return c.html(layout('役員', body))
})

ui.post('/app/officer/publish', async (c) => {
  const user = await resolveSessionUser(c.env.DB, c.req.header('Cookie'))
  if (!user) return c.redirect('/app')
  const roleCtx = await resolveActiveRole(c.env.DB, user.userId, POC_ORG_ID)
  if (!roleCtx?.permissions.can_manage_org) return c.redirect('/app/officer')

  await c.env.DB.prepare(
    `UPDATE announcements SET approval_status = 'published', published_at = datetime('now')
     WHERE id = 'ann-demo-draft'`,
  ).run()

  return c.redirect('/app/officer')
})

ui.get('/app/logout', async (c) => {
  const user = await resolveSessionUser(c.env.DB, c.req.header('Cookie'))
  if (user) {
    await c.env.DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind(user.sessionId).run()
  }
  clearSessionCookie(c)
  return c.redirect('/app')
})

export default ui
