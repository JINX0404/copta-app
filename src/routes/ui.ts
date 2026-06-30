import { Hono } from 'hono'
import type { AppEnv } from '../types/env'
import { POC_CSS } from '../lib/poc-css'
import { requireUiUser, getRole, header, page, esc, POC_ORG_ID } from '../lib/ui-helpers'
import { layout } from '../lib/html'
import { parseSegment, segmentMatchesUser } from '../lib/segment'
import { clearSessionCookie } from '../middleware/auth'
import { newId } from '../lib/id'
import { DEFAULT_PARENT_PERMISSION, PARENT_ROLE_NAME } from '../db/schema'
import { currentSchoolYear } from '../lib/school-year'
import officerUi from './ui-officer'

const ui = new Hono<AppEnv>()

ui.get('/assets/poc.css', (c) => {
  c.header('Cache-Control', 'public, max-age=86400')
  return c.body(POC_CSS, 200, { 'Content-Type': 'text/css; charset=utf-8' })
})

ui.get('/', (c) => c.redirect('/app'))
ui.route('/app/officer', officerUi)

/** ログイン */
ui.get('/app', async (c) => {
  const user = await requireUiUser(c)
  if (!(user instanceof Response)) return c.redirect('/app/home')

  const poc = c.env.POC_MODE === 'true'
  const dbError = c.req.query('error') === 'db'
  const body = `
    <div class="login-hero"><h1>COPTA</h1><p>PTA運営OS — 全機能デモ</p></div>
    <main>
      ${dbError ? `<div class="alert">DB未セットアップ: <code>npm run db:setup:local:full</code></div>` : `<div class="alert">⚠️ POCデモ — 決済はダミーです</div>`}
      ${
        poc
          ? `<div class="card"><h2>デモログイン</h2>
        <div class="demo-grid">
          <a class="btn btn-primary" href="/auth/demo-login/parent">👩‍👧 保護者（田中 花子）</a>
          <a class="btn btn-accent" href="/auth/demo-login/koho">📣 広報委員（佐藤）</a>
          <a class="btn btn-secondary" href="/auth/demo-login/president">👔 会長（鈴木）</a>
        </div></div>`
          : ''
      }
      <div class="card"><h2>子どもIDで登録</h2>
        <p class="meta">未登録向けコード例: SAKURA-2-1-002</p>
        <form method="post" action="/app/register">
          <input name="child_code" placeholder="子どもIDコード" required style="width:100%;padding:10px;margin-bottom:8px">
          <p class="meta">※ログイン後に紐付けされます（下のデモログイン→このフォームでも可）</p>
          <button class="btn btn-primary" type="submit">登録する</button>
        </form>
      </div>
    </main>`
  return c.html(layout('ログイン', body))
})

ui.post('/app/register', async (c) => {
  const form = await c.req.parseBody()
  const code = String(form.child_code ?? '').trim()
  const user = await requireUiUser(c)
  if (user instanceof Response) {
    return c.redirect(`/auth/demo-login/parent?next=register&code=${encodeURIComponent(code)}`)
  }
  const child = await c.env.DB.prepare(`SELECT id, organization_id, status FROM children WHERE child_code = ?`)
    .bind(code)
    .first<{ id: string; organization_id: string; status: string }>()
  if (!child || child.status !== 'active') return c.redirect('/app/home?error=invalid_code')

  await c.env.DB.prepare(`INSERT OR IGNORE INTO user_children (user_id, child_id) VALUES (?, ?)`)
    .bind(user.userId, child.id)
    .run()
  const mem = await c.env.DB.prepare(
    `SELECT id FROM organization_memberships WHERE user_id = ? AND organization_id = ?`,
  )
    .bind(user.userId, child.organization_id)
    .first()
  if (!mem) {
    await c.env.DB.prepare(
      `INSERT INTO organization_memberships (id, user_id, organization_id, status) VALUES (?, ?, ?, 'active')`,
    )
      .bind(newId(), user.userId, child.organization_id)
      .run()
  }
  // ensure parent role
  let role = await c.env.DB.prepare(
    `SELECT id FROM roles WHERE organization_id = ? AND name = ?`,
  )
    .bind(child.organization_id, PARENT_ROLE_NAME)
    .first<{ id: string }>()
  if (!role) {
    const rid = newId()
    await c.env.DB.prepare(`INSERT INTO roles (id, organization_id, name, permission_set) VALUES (?, ?, ?, ?)`)
      .bind(rid, child.organization_id, PARENT_ROLE_NAME, JSON.stringify(DEFAULT_PARENT_PERMISSION))
      .run()
    role = { id: rid }
  }
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO role_assignments (id, user_id, role_id, school_year, active) VALUES (?, ?, ?, ?, 1)`,
  )
    .bind(newId(), user.userId, role.id, currentSchoolYear())
    .run()

  return c.redirect('/app/home?registered=1')
})

/** ホーム */
ui.get('/app/home', async (c) => {
  const user = await requireUiUser(c)
  if (user instanceof Response) return user
  const roleCtx = await getRole(c, user.userId)
  const isOfficer = roleCtx?.permissions.can_publish === true

  const children = await c.env.DB.prepare(
    `SELECT c.grade_label, c.class_name FROM user_children uc JOIN children c ON c.id = uc.child_id WHERE uc.user_id = ?`,
  )
    .bind(user.userId)
    .all<{ grade_label: string; class_name: string }>()

  const unpaid = await c.env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM payment_requests WHERE user_id = ? AND status = 'pending'`,
  )
    .bind(user.userId)
    .first<{ cnt: number }>()

  const registered = c.req.query('registered') === '1'

  const body = `
    ${header(user.display_name, `さくら小学校PTA · ${roleCtx?.roleName ?? '保護者'}`)}
    <main>
      ${registered ? `<div class="alert">✅ 子どもIDの登録が完了しました</div>` : ''}
      ${(children.results ?? []).length ? `<div class="card"><p>お子さま: <strong>${(children.results ?? []).map((ch) => `${ch.grade_label}${ch.class_name}`).join(' / ')}</strong></p></div>` : ''}
      ${(unpaid?.cnt ?? 0) > 0 ? `<div class="card"><span class="badge unread">要対応</span> <a href="/app/payments">未払い ${unpaid?.cnt} 件 →</a></div>` : ''}
      ${isOfficer ? `<a class="btn btn-accent" href="/app/officer">⚙️ 役員ダッシュボード</a>` : ''}
      <div class="card"><h2>メニュー</h2>
        <a class="btn btn-secondary" href="/app/announcements">📢 お知らせ</a>
        <a class="btn btn-secondary" href="/app/surveys">📋 アンケート</a>
        <a class="btn btn-secondary" href="/app/payments">💰 集金</a>
        <a class="btn btn-secondary" href="/app/volunteer">🤝 ボランティア</a>
      </div>
      <a class="btn btn-secondary" href="/app/logout">ログアウト</a>
    </main>`
  return page(c, 'ホーム', body, 'home', !!isOfficer)
})

/** お知らせ */
ui.get('/app/announcements', async (c) => {
  const user = await requireUiUser(c)
  if (user instanceof Response) return user
  const roleCtx = await getRole(c, user.userId)
  const isOfficer = roleCtx?.permissions.can_publish === true

  const userChildren = await c.env.DB.prepare(
    `SELECT c.grade_label, c.class_name FROM user_children uc JOIN children c ON c.id = uc.child_id
     WHERE uc.user_id = ? AND c.organization_id = ?`,
  )
    .bind(user.userId, POC_ORG_ID)
    .all<{ grade_label: string; class_name: string }>()

  const all = await c.env.DB.prepare(
    `SELECT a.id, a.title, a.body, a.segment, a.requires_response, a.approval_status, a.published_at,
            CASE WHEN ar.user_id IS NOT NULL THEN 1 ELSE 0 END AS is_read
     FROM announcements a LEFT JOIN announcement_reads ar ON ar.announcement_id = a.id AND ar.user_id = ?
     WHERE a.organization_id = ? ORDER BY COALESCE(a.published_at, '1970-01-01') DESC`,
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

  const filtered = (all.results ?? []).filter((a) => {
    if (isOfficer) return true
    if (a.approval_status !== 'published') return false
    return segmentMatchesUser(parseSegment(a.segment), userChildren.results ?? [])
  })

  const cards = filtered.length
    ? filtered
        .map(
          (a) => `<div class="card">
        ${a.is_read ? '' : '<span class="badge unread">未読</span> '}
        ${a.approval_status !== 'published' ? `<span class="badge officer">${esc(a.approval_status)}</span> ` : ''}
        ${a.requires_response ? '<span class="badge">要返信</span>' : ''}
        <h2>${esc(a.title)}</h2>
        <p>${esc(a.body.slice(0, 100))}…</p>
        <a class="btn btn-sm btn-primary" href="/app/announcements/${a.id}">詳細</a>
      </div>`,
        )
        .join('')
    : `<div class="empty">お知らせはありません</div>`

  const body = `${header('お知らせ', 'さくら小学校PTA')}<main>${cards}
    ${isOfficer ? `<a class="btn btn-secondary" href="/app/officer/announcements">✏️ お知らせを作成・管理</a>` : ''}
  </main>`
  return page(c, 'お知らせ', body, 'ann', !!isOfficer)
})

ui.get('/app/announcements/:id', async (c) => {
  const user = await requireUiUser(c)
  if (user instanceof Response) return user
  const id = c.req.param('id')!
  const row = await c.env.DB.prepare(`SELECT title, body, requires_response FROM announcements WHERE id = ?`)
    .bind(id)
    .first<{ title: string; body: string; requires_response: number }>()
  if (!row) return c.text('Not found', 404)
  await c.env.DB.prepare(`INSERT OR IGNORE INTO announcement_reads (announcement_id, user_id) VALUES (?, ?)`)
    .bind(id, user.userId)
    .run()
  const roleCtx = await getRole(c, user.userId)
  const body = `${header(row.title, '')}<main>
    <div class="card"><p>${esc(row.body).replace(/\n/g, '<br>')}</p></div>
    ${row.requires_response ? `<form method="post" action="/app/announcements/${id}/respond"><button class="btn btn-primary" type="submit">確認しました</button></form>` : ''}
    <a class="btn btn-secondary" href="/app/announcements">← 一覧</a>
  </main>`
  return page(c, row.title, body, 'ann', roleCtx?.permissions.can_publish === true)
})

ui.post('/app/announcements/:id/respond', async (c) => {
  const user = await requireUiUser(c)
  if (user instanceof Response) return user
  await c.env.DB.prepare(`INSERT OR IGNORE INTO announcement_responses (announcement_id, user_id) VALUES (?, ?)`)
    .bind(c.req.param('id'), user.userId)
    .run()
  return c.redirect(`/app/announcements/${c.req.param('id')}`)
})

/** アンケート */
ui.get('/app/surveys', async (c) => {
  const user = await requireUiUser(c)
  if (user instanceof Response) return user
  const roleCtx = await getRole(c, user.userId)

  const surveys = await c.env.DB.prepare(
    `SELECT s.id, s.title, s.questions, CASE WHEN sr.id IS NOT NULL THEN 1 ELSE 0 END AS submitted
     FROM surveys s LEFT JOIN survey_responses sr ON sr.survey_id = s.id AND sr.user_id = ?
     WHERE s.organization_id = ?`,
  )
    .bind(user.userId, POC_ORG_ID)
    .all<{ id: string; title: string; questions: string; submitted: number }>()

  const cards = (surveys.results ?? [])
    .map((s) => {
      const qs = JSON.parse(s.questions) as Array<{ id: string; label: string; options?: string[] }>
      const q = qs[0]
      const form =
        s.submitted === 1
          ? `<p class="meta">✅ 回答済み</p>`
          : `<form method="post" action="/app/surveys/${s.id}/respond"><p><strong>${esc(q?.label)}</strong></p>
          ${(q?.options ?? []).map((o) => `<label><input type="radio" name="answer" value="${esc(o)}" required> ${esc(o)}</label><br>`).join('')}
          <button class="btn btn-primary" type="submit" style="margin-top:12px">送信</button></form>`
      return `<div class="card"><h2>${esc(s.title)}</h2>${form}</div>`
    })
    .join('')

  const body = `${header('アンケート', '')}<main>${cards || '<div class="empty">なし</div>'}
    ${roleCtx?.permissions.can_publish ? `<a class="btn btn-secondary" href="/app/officer/surveys">📊 管理・集計</a>` : ''}
  </main>`
  return page(c, 'アンケート', body, 'sur', roleCtx?.permissions.can_publish === true)
})

ui.post('/app/surveys/:id/respond', async (c) => {
  const user = await requireUiUser(c)
  if (user instanceof Response) return user
  const form = await c.req.parseBody()
  const id = c.req.param('id')!
  const existing = await c.env.DB.prepare(`SELECT 1 FROM survey_responses WHERE survey_id = ? AND user_id = ?`)
    .bind(id, user.userId)
    .first()
  if (!existing) {
    await c.env.DB.prepare(`INSERT INTO survey_responses (id, survey_id, user_id, answers) VALUES (?, ?, ?, ?)`)
      .bind(newId(), id, user.userId, JSON.stringify({ attendance: String(form.answer) }))
      .run()
  }
  return c.redirect('/app/surveys')
})

/** 集金（ダミー決済） */
ui.get('/app/payments', async (c) => {
  const user = await requireUiUser(c)
  if (user instanceof Response) return user
  const roleCtx = await getRole(c, user.userId)

  const payments = await c.env.DB.prepare(
    `SELECT id, title, amount_yen, status, category, due_at FROM payment_requests
     WHERE user_id = ? AND organization_id = ? ORDER BY status, created_at DESC`,
  )
    .bind(user.userId, POC_ORG_ID)
    .all<{ id: string; title: string; amount_yen: number; status: string; category: string; due_at: string | null }>()

  const cards = (payments.results ?? [])
    .map(
      (p) => `<div class="card">
      <span class="badge ${p.status === 'pending' ? 'unread' : ''}">${esc(p.status === 'paid' ? '支払済' : '未払い')}</span>
      <h2>${esc(p.title)}</h2>
      <p><strong>¥${p.amount_yen.toLocaleString()}</strong>（${esc(p.category)}）</p>
      ${p.status === 'pending' ? `<form method="post" action="/app/payments/${p.id}/pay"><button class="btn btn-primary" type="submit">💳 ダミー決済で支払う</button></form>` : `<p class="meta">デモ決済完了</p>`}
    </div>`,
    )
    .join('')

  const body = `${header('集金', 'デモ決済 — 実際の引き落としはありません')}<main>
    ${cards || '<div class="empty">請求はありません</div>'}
    <p class="meta">※受取人はPTA団体（Organization）固定。個人への送金経路はありません。</p>
    ${roleCtx?.permissions.can_view_finance ? `<a class="btn btn-secondary" href="/app/officer/payments">📋 請求管理（役員）</a>` : ''}
  </main>`
  return page(c, '集金', body, 'pay', roleCtx?.permissions.can_publish === true)
})

ui.post('/app/payments/:id/pay', async (c) => {
  const user = await requireUiUser(c)
  if (user instanceof Response) return user
  const id = c.req.param('id')!
  const req = await c.env.DB.prepare(
    `SELECT amount_yen, category, status FROM payment_requests WHERE id = ? AND user_id = ?`,
  )
    .bind(id, user.userId)
    .first<{ amount_yen: number; category: string; status: string }>()
  if (!req || req.status === 'paid') return c.redirect('/app/payments')

  const ref = `DEMO-${newId().slice(0, 8)}`
  await c.env.DB.prepare(`UPDATE payment_requests SET status = 'paid', payment_provider_ref = ? WHERE id = ?`)
    .bind(ref, id)
    .run()
  await c.env.DB.prepare(
    `INSERT INTO ledger_entries (id, organization_id, entry_type, category, amount_yen, related_user_id, payment_provider_ref)
     VALUES (?, ?, 'income', ?, ?, ?, ?)`,
  )
    .bind(newId(), POC_ORG_ID, req.category, req.amount_yen, user.userId, ref)
    .run()
  return c.redirect('/app/payments?paid=1')
})

/** ボランティア */
ui.get('/app/volunteer', async (c) => {
  const user = await requireUiUser(c)
  if (user instanceof Response) return user
  const roleCtx = await getRole(c, user.userId)

  const calls = await c.env.DB.prepare(
    `SELECT v.id, v.title, v.capacity, v.event_datetime,
            (SELECT COUNT(*) FROM volunteer_signups vs WHERE vs.volunteer_call_id = v.id AND vs.status = 'confirmed') AS confirmed,
            (SELECT vs.status FROM volunteer_signups vs WHERE vs.volunteer_call_id = v.id AND vs.user_id = ?) AS my_status
     FROM volunteer_calls v WHERE v.organization_id = ?`,
  )
    .bind(user.userId, POC_ORG_ID)
    .all<{ id: string; title: string; capacity: number; event_datetime: string; confirmed: number; my_status: string | null }>()

  const cards = (calls.results ?? [])
    .map((v) => {
      let action = ''
      if (v.my_status === 'confirmed') action = `<p class="meta">✅ 確定</p><form method="post" action="/app/volunteer/${v.id}/cancel"><button class="btn btn-sm btn-secondary" type="submit">キャンセル</button></form>`
      else if (v.my_status === 'waitlisted') action = `<p class="meta">キャンセル待ち</p>`
      else if (!v.my_status || v.my_status === 'cancelled')
        action = `<form method="post" action="/app/volunteer/${v.id}/signup"><button class="btn btn-primary" type="submit">申し込む</button></form>`
      return `<div class="card"><h2>${esc(v.title)}</h2><p class="meta">${v.confirmed}/${v.capacity} 名 · ${esc(v.event_datetime ?? '')}</p>${action}</div>`
    })
    .join('')

  const body = `${header('ボランティア', '')}<main>${cards || '<div class="empty">募集なし</div>'}
    ${roleCtx?.permissions.can_publish ? `<a class="btn btn-secondary" href="/app/officer/volunteer">📋 募集管理</a>` : ''}
  </main>`
  return page(c, 'ボランティア', body, 'vol', roleCtx?.permissions.can_publish === true)
})

ui.post('/app/volunteer/:id/signup', async (c) => {
  const user = await requireUiUser(c)
  if (user instanceof Response) return user
  const id = c.req.param('id')!
  const call = await c.env.DB.prepare(`SELECT capacity FROM volunteer_calls WHERE id = ?`).bind(id).first<{ capacity: number }>()
  const confirmed = await c.env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM volunteer_signups WHERE volunteer_call_id = ? AND status = 'confirmed'`,
  )
    .bind(id)
    .first<{ cnt: number }>()
  const status = (confirmed?.cnt ?? 0) >= (call?.capacity ?? 0) ? 'waitlisted' : 'confirmed'
  const existing = await c.env.DB.prepare(`SELECT id FROM volunteer_signups WHERE volunteer_call_id = ? AND user_id = ?`)
    .bind(id, user.userId)
    .first()
  if (existing) {
    await c.env.DB.prepare(`UPDATE volunteer_signups SET status = ? WHERE volunteer_call_id = ? AND user_id = ?`)
      .bind(status, id, user.userId)
      .run()
  } else {
    await c.env.DB.prepare(`INSERT INTO volunteer_signups (id, volunteer_call_id, user_id, status) VALUES (?, ?, ?, ?)`)
      .bind(newId(), id, user.userId, status)
      .run()
  }
  return c.redirect('/app/volunteer')
})

ui.post('/app/volunteer/:id/cancel', async (c) => {
  const user = await requireUiUser(c)
  if (user instanceof Response) return user
  await c.env.DB.prepare(`UPDATE volunteer_signups SET status = 'cancelled' WHERE volunteer_call_id = ? AND user_id = ?`)
    .bind(c.req.param('id'), user.userId)
    .run()
  return c.redirect('/app/volunteer')
})

ui.get('/app/logout', async (c) => {
  const user = await requireUiUser(c)
  if (!(user instanceof Response)) {
    await c.env.DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind(user.sessionId).run()
  }
  clearSessionCookie(c)
  return c.redirect('/app')
})

export default ui
