import { Hono } from 'hono'
import type { AppEnv } from '../types/env'
import { newId } from '../lib/id'
import { currentSchoolYear } from '../lib/school-year'
import { requireUiUser, getRole, header, page, esc, POC_ORG_ID } from '../lib/ui-helpers'
import { renderMethodBadge, renderPaymentMethodsStrip } from '../lib/payment-methods'

const officer = new Hono<AppEnv>()

officer.get('/', async (c) => {
  const user = await requireUiUser(c)
  if (user instanceof Response) return user
  const roleCtx = await getRole(c, user.userId)
  if (!roleCtx?.permissions.can_publish) return c.redirect('/app/home')

  const unpaid = await c.env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM payment_requests
     WHERE organization_id = ? AND status = 'pending'`,
  )
    .bind(POC_ORG_ID)
    .first<{ cnt: number }>()

  const body = `
    ${header('役員メニュー', roleCtx.roleName)}
    <main>
      <div class="stats-grid">
        <div class="stat"><div class="num">${unpaid?.cnt ?? 0}</div><div class="label">未払い</div></div>
      </div>
      <div class="card"><h2>配信・回覧</h2>
        <a class="btn btn-secondary" href="/app/officer/announcements">お知らせ管理</a>
        <a class="btn btn-secondary" href="/app/officer/surveys">アンケート管理</a>
      </div>
      <div class="card"><h2>運営</h2>
        <a class="btn btn-secondary" href="/app/officer/roster">名簿・未登録者</a>
        <a class="btn btn-secondary" href="/app/officer/handover">引き継ぎボックス</a>
        <a class="btn btn-secondary" href="/app/officer/chat">役員チャット</a>
        <a class="btn btn-secondary" href="/app/officer/volunteer">ボランティア管理</a>
      </div>
      <div class="card"><h2>会計（ダミー）</h2>
        <a class="btn btn-secondary" href="/app/officer/payments">集金・請求管理</a>
        <a class="btn btn-secondary" href="/app/officer/ledger">入金履歴</a>
      </div>
      ${roleCtx.permissions.can_manage_roles ? `<div class="card"><h2>権限</h2><a class="btn btn-secondary" href="/app/officer/roles">役職アサイン</a></div>` : ''}
    </main>`
  return page(c, '役員', body, 'off', true)
})

// --- お知らせ管理 ---
officer.get('/announcements', async (c) => {
  const user = await requireUiUser(c)
  if (user instanceof Response) return user
  const roleCtx = await getRole(c, user.userId)
  if (!roleCtx?.permissions.can_publish) return c.redirect('/app/home')

  const { results } = await c.env.DB.prepare(
    `SELECT id, title, approval_status, published_at FROM announcements
     WHERE organization_id = ? ORDER BY created_at DESC`,
  )
    .bind(POC_ORG_ID)
    .all<{ id: string; title: string; approval_status: string; published_at: string | null }>()

  const list = (results ?? [])
    .map(
      (a) => `<div class="card">
      <span class="badge officer">${esc(a.approval_status)}</span>
      <h2>${esc(a.title)}</h2>
      <p class="meta">${esc(a.published_at ?? '—')}</p>
      ${a.approval_status === 'draft' ? `<form method="post" action="/app/officer/announcements/${a.id}/submit"><button class="btn btn-sm btn-primary" type="submit">承認申請</button></form>` : ''}
      ${a.approval_status === 'pending_approval' && roleCtx.permissions.can_manage_org ? `<form method="post" action="/app/officer/announcements/${a.id}/publish"><button class="btn btn-sm btn-accent" type="submit">公開する</button></form>` : ''}
    </div>`,
    )
    .join('')

  const body = `
    ${header('お知らせ管理', '作成・承認・公開')}
    <main>
      <div class="card">
        <h2>新規作成</h2>
        <form method="post" action="/app/officer/announcements">
          <p><input name="title" placeholder="タイトル" required style="width:100%;padding:8px"></p>
          <p><textarea name="body" placeholder="本文" required rows="4" style="width:100%"></textarea></p>
          <label><input type="checkbox" name="requires_response" value="1"> 要返信</label>
          <label><input type="checkbox" name="all" value="1" checked> 全員に配信</label>
          <button class="btn btn-primary" type="submit">下書き保存</button>
        </form>
      </div>
      ${list}
      <a class="btn btn-secondary" href="/app/officer">← 役員メニュー</a>
    </main>`
  return page(c, 'お知らせ管理', body, 'off', true)
})

officer.post('/announcements', async (c) => {
  const user = await requireUiUser(c)
  if (user instanceof Response) return user
  const roleCtx = await getRole(c, user.userId)
  if (!roleCtx?.permissions.can_publish) return c.redirect('/app/home')

  const form = await c.req.parseBody()
  const segment = form.all ? JSON.stringify({ all: true }) : JSON.stringify({ grade_labels: ['4年'] })
  const id = newId()
  await c.env.DB.prepare(
    `INSERT INTO announcements (id, organization_id, created_by_role_id, title, body, segment, requires_response, approval_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')`,
  )
    .bind(id, POC_ORG_ID, roleCtx.roleId, String(form.title), String(form.body), segment, form.requires_response ? 1 : 0)
    .run()
  return c.redirect('/app/officer/announcements')
})

officer.post('/announcements/:id/submit', async (c) => {
  const user = await requireUiUser(c)
  if (user instanceof Response) return user
  await c.env.DB.prepare(
    `UPDATE announcements SET approval_status = 'pending_approval' WHERE id = ?`,
  )
    .bind(c.req.param('id'))
    .run()
  return c.redirect('/app/officer/announcements')
})

officer.post('/announcements/:id/publish', async (c) => {
  const user = await requireUiUser(c)
  if (user instanceof Response) return user
  const roleCtx = await getRole(c, user.userId)
  if (!roleCtx?.permissions.can_manage_org) return c.redirect('/app/officer/announcements')
  await c.env.DB.prepare(
    `UPDATE announcements SET approval_status = 'published', published_at = datetime('now') WHERE id = ?`,
  )
    .bind(c.req.param('id'))
    .run()
  return c.redirect('/app/officer/announcements')
})

// --- アンケート管理 ---
officer.get('/surveys', async (c) => {
  const user = await requireUiUser(c)
  if (user instanceof Response) return user
  const roleCtx = await getRole(c, user.userId)
  if (!roleCtx?.permissions.can_publish) return c.redirect('/app/home')

  const { results } = await c.env.DB.prepare(
    `SELECT s.id, s.title, (SELECT COUNT(*) FROM survey_responses sr WHERE sr.survey_id = s.id) AS responses
     FROM surveys s WHERE s.organization_id = ?`,
  )
    .bind(POC_ORG_ID)
    .all<{ id: string; title: string; responses: number }>()

  const list = (results ?? [])
    .map(
      (s) => `<div class="card"><h2>${esc(s.title)}</h2><p class="meta">回答 ${s.responses} 件</p>
      <a class="btn btn-sm btn-primary" href="/app/officer/surveys/${s.id}/summary">集計を見る</a></div>`,
    )
    .join('')

  const body = `
    ${header('アンケート管理', '')}
    <main>
      <div class="card">
        <form method="post" action="/app/officer/surveys">
          <input name="title" placeholder="タイトル（例: 保護者会 出欠）" required style="width:100%;padding:8px;margin-bottom:8px">
          <button class="btn btn-primary" type="submit">出欠アンケートを作成</button>
        </form>
      </div>
      ${list}
      <a class="btn btn-secondary" href="/app/officer">← 戻る</a>
    </main>`
  return page(c, 'アンケート管理', body, 'off', true)
})

officer.post('/surveys', async (c) => {
  const user = await requireUiUser(c)
  if (user instanceof Response) return user
  const roleCtx = await getRole(c, user.userId)
  if (!roleCtx?.permissions.can_publish) return c.redirect('/app/home')
  const form = await c.req.parseBody()
  const questions = JSON.stringify([
    {
      id: 'attendance',
      type: 'attendance',
      label: '参加しますか？',
      options: ['参加する', '不参加'],
    },
  ])
  await c.env.DB.prepare(
    `INSERT INTO surveys (id, organization_id, created_by_role_id, title, questions, closes_at)
     VALUES (?, ?, ?, ?, ?, datetime('now', '+14 days'))`,
  )
    .bind(newId(), POC_ORG_ID, roleCtx.roleId, String(form.title), questions)
    .run()
  return c.redirect('/app/officer/surveys')
})

officer.get('/surveys/:id/summary', async (c) => {
  const user = await requireUiUser(c)
  if (user instanceof Response) return user
  const id = c.req.param('id')!
  const { results } = await c.env.DB.prepare(
    `SELECT answers FROM survey_responses WHERE survey_id = ?`,
  )
    .bind(id)
    .all<{ answers: string }>()

  const counts: Record<string, number> = {}
  for (const r of results ?? []) {
    const a = JSON.parse(r.answers) as Record<string, string>
    const key = a.attendance ?? '未回答'
    counts[key] = (counts[key] ?? 0) + 1
  }

  const body = `
    ${header('集計結果', '')}
    <main>
      <div class="card">
        ${Object.entries(counts)
          .map(([k, v]) => `<p><strong>${esc(k)}</strong>: ${v} 名</p>`)
          .join('') || '<p class="meta">回答なし</p>'}
      </div>
      <a class="btn btn-secondary" href="/app/officer/surveys">← 戻る</a>
    </main>`
  return page(c, '集計', body, 'off', true)
})

// --- 名簿 ---
officer.get('/roster', async (c) => {
  const user = await requireUiUser(c)
  if (user instanceof Response) return user
  const roleCtx = await getRole(c, user.userId)
  if (!roleCtx?.permissions.can_view_roster_detail) return c.redirect('/app/officer')

  const { results } = await c.env.DB.prepare(
    `SELECT c.grade_label, c.class_name, c.child_code,
            CASE WHEN uc.user_id IS NOT NULL THEN 1 ELSE 0 END AS registered,
            u.display_name
     FROM children c
     LEFT JOIN user_children uc ON uc.child_id = c.id
     LEFT JOIN users u ON u.id = uc.user_id
     WHERE c.organization_id = ? AND c.status = 'active'
     ORDER BY c.grade_label, c.class_name`,
  )
    .bind(POC_ORG_ID)
    .all<{ grade_label: string; class_name: string; registered: number; display_name: string | null; child_code: string }>()

  const rows = (results ?? [])
    .map(
      (r) =>
        `<tr><td>${esc(r.grade_label)}${esc(r.class_name)}</td>
        <td>${r.registered ? esc(r.display_name?.[0] ?? '') + '＊＊' : '❌'}</td>
        <td>${r.registered ? '✅' : esc(r.child_code.slice(0, 6) + '…')}</td></tr>`,
    )
    .join('')

  const body = `
    ${header('名簿管理', 'ゼロトラスト — 氏名は頭文字のみ')}
    <main>
      <div class="card">
        <table class="roster"><tr><th>学年組</th><th>保護者</th><th>登録</th></tr>${rows}</table>
      </div>
      <a class="btn btn-primary" href="/app/officer/roster/print">📄 未登録者リスト（紙配布用）</a>
      ${roleCtx.permissions.can_manage_org ? `
      <div class="card" style="margin-top:12px">
        <h2>子どもID発行</h2>
        <form method="post" action="/app/officer/roster/children">
          <input name="grade_label" placeholder="学年（例: 1年）" style="width:100%;padding:8px;margin-bottom:8px">
          <input name="class_name" placeholder="組（例: 2組）" style="width:100%;padding:8px;margin-bottom:8px">
          <button class="btn btn-primary" type="submit">新規発行</button>
        </form>
      </div>` : ''}
      <a class="btn btn-secondary" href="/app/officer">← 戻る</a>
    </main>`
  return page(c, '名簿', body, 'off', true)
})

officer.get('/roster/print', async (c) => {
  const user = await requireUiUser(c)
  if (user instanceof Response) return user
  const { results } = await c.env.DB.prepare(
    `SELECT c.grade_label, c.class_name FROM children c
     LEFT JOIN user_children uc ON uc.child_id = c.id
     WHERE c.organization_id = ? AND c.status = 'active' AND uc.user_id IS NULL`,
  )
    .bind(POC_ORG_ID)
    .all<{ grade_label: string; class_name: string }>()

  const body = `
    ${header('未登録者リスト', '印刷用')}
    <main>
      <div class="card">
        <p>以下のクラスに未登録のお子さまがいます。子どもIDコードを配布してください。</p>
        <ul>${(results ?? []).map((r) => `<li>${esc(r.grade_label)}${esc(r.class_name)}</li>`).join('') || '<li>なし</li>'}</ul>
      </div>
      <a class="btn btn-secondary" href="/app/officer/roster">← 戻る</a>
    </main>`
  return page(c, '印刷', body, 'off', true)
})

officer.post('/roster/children', async (c) => {
  const user = await requireUiUser(c)
  if (user instanceof Response) return user
  const roleCtx = await getRole(c, user.userId)
  if (!roleCtx?.permissions.can_manage_org) return c.redirect('/app/officer/roster')
  const form = await c.req.parseBody()
  const code = `SAKURA-${String(form.grade_label).replace(/\D/g, '')}-${String(form.class_name).replace(/\D/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  await c.env.DB.prepare(
    `INSERT INTO children (id, organization_id, class_name, grade_label, child_code, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
  )
    .bind(newId(), POC_ORG_ID, String(form.class_name), String(form.grade_label), code)
    .run()
  return c.redirect('/app/officer/roster')
})

// --- 引き継ぎ ---
officer.get('/handover', async (c) => {
  const user = await requireUiUser(c)
  if (user instanceof Response) return user
  const roleCtx = await getRole(c, user.userId)
  if (!roleCtx?.permissions.can_publish) return c.redirect('/app/home')

  const sy = currentSchoolYear()
  const { results } = await c.env.DB.prepare(
    `SELECT h.title, h.content, r.name AS role_name FROM handover_items h
     JOIN roles r ON r.id = h.role_id WHERE h.organization_id = ? AND h.school_year = ?`,
  )
    .bind(POC_ORG_ID, sy)
    .all<{ title: string; content: string | null; role_name: string }>()

  const body = `
    ${header('引き継ぎボックス', `${sy}年度`)}
    <main>
      ${(results ?? []).map((h) => `<div class="card"><h2>${esc(h.title)}</h2><p class="meta">${esc(h.role_name)}</p><p>${esc(h.content ?? '').replace(/\n/g, '<br>')}</p></div>`).join('')}
      <div class="card">
        <form method="post" action="/app/officer/handover">
          <input name="title" placeholder="タイトル" required style="width:100%;padding:8px;margin-bottom:8px">
          <textarea name="content" placeholder="引き継ぎ内容" rows="3" style="width:100%"></textarea>
          <button class="btn btn-primary" type="submit">追加</button>
        </form>
      </div>
      <a class="btn btn-secondary" href="/app/officer">← 戻る</a>
    </main>`
  return page(c, '引き継ぎ', body, 'off', true)
})

officer.post('/handover', async (c) => {
  const user = await requireUiUser(c)
  if (user instanceof Response) return user
  const roleCtx = await getRole(c, user.userId)
  if (!roleCtx?.permissions.can_publish) return c.redirect('/app/home')
  const form = await c.req.parseBody()
  await c.env.DB.prepare(
    `INSERT INTO handover_items (id, organization_id, role_id, title, content, school_year)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(newId(), POC_ORG_ID, roleCtx.roleId, String(form.title), String(form.content ?? ''), currentSchoolYear())
    .run()
  return c.redirect('/app/officer/handover')
})

// --- チャット ---
officer.get('/chat', async (c) => {
  const user = await requireUiUser(c)
  if (user instanceof Response) return user
  const roleCtx = await getRole(c, user.userId)
  if (!roleCtx?.permissions.can_publish) return c.redirect('/app/home')

  const channel = await c.env.DB.prepare(
    `SELECT id FROM chat_channels WHERE organization_id = ? LIMIT 1`,
  )
    .bind(POC_ORG_ID)
    .first<{ id: string }>()

  const { results } = channel
    ? await c.env.DB.prepare(
        `SELECT m.body, r.name AS role_name FROM chat_messages m
         JOIN roles r ON r.id = m.sender_role_id WHERE m.channel_id = ? ORDER BY m.created_at`,
      )
        .bind(channel.id)
        .all<{ body: string; role_name: string }>()
    : { results: [] }

  const body = `
    ${header('役員チャット', '役職単位 — 保護者自由投稿なし')}
    <main>
      ${(results ?? []).map((m) => `<div class="chat-msg"><div class="who">${esc(m.role_name)}</div>${esc(m.body)}</div>`).join('')}
      ${channel ? `<form method="post" action="/app/officer/chat">
        <textarea name="body" placeholder="メッセージ" required rows="2" style="width:100%"></textarea>
        <button class="btn btn-primary" type="submit">送信（${esc(roleCtx.roleName)}名義）</button>
      </form>` : '<p class="meta">チャンネルがありません</p>'}
      <a class="btn btn-secondary" href="/app/officer">← 戻る</a>
    </main>`
  return page(c, 'チャット', body, 'off', true)
})

officer.post('/chat', async (c) => {
  const user = await requireUiUser(c)
  if (user instanceof Response) return user
  const roleCtx = await getRole(c, user.userId)
  if (!roleCtx?.permissions.can_publish) return c.redirect('/app/home')
  const form = await c.req.parseBody()
  const channel = await c.env.DB.prepare(
    `SELECT id FROM chat_channels WHERE organization_id = ? LIMIT 1`,
  )
    .bind(POC_ORG_ID)
    .first<{ id: string }>()
  if (!channel) return c.redirect('/app/officer/chat')
  await c.env.DB.prepare(
    `INSERT INTO chat_messages (id, channel_id, sender_role_id, body) VALUES (?, ?, ?, ?)`,
  )
    .bind(newId(), channel.id, roleCtx.roleId, String(form.body))
    .run()
  return c.redirect('/app/officer/chat')
})

// --- ボランティア管理 ---
officer.get('/volunteer', async (c) => {
  const user = await requireUiUser(c)
  if (user instanceof Response) return user
  const roleCtx = await getRole(c, user.userId)
  if (!roleCtx?.permissions.can_publish) return c.redirect('/app/home')

  const { results } = await c.env.DB.prepare(
    `SELECT v.id, v.title, v.capacity,
            (SELECT COUNT(*) FROM volunteer_signups vs WHERE vs.volunteer_call_id = v.id AND vs.status = 'confirmed') AS confirmed
     FROM volunteer_calls v WHERE v.organization_id = ?`,
  )
    .bind(POC_ORG_ID)
    .all<{ id: string; title: string; capacity: number; confirmed: number }>()

  const list = (results ?? [])
    .map(
      (v) => `<div class="card"><h2>${esc(v.title)}</h2><p class="meta">${v.confirmed}/${v.capacity} 名確定</p></div>`,
    )
    .join('')

  const body = `
    ${header('ボランティア管理', '')}
    <main>
      <div class="card">
        <form method="post" action="/app/officer/volunteer">
          <input name="title" placeholder="募集タイトル" required style="width:100%;padding:8px;margin-bottom:8px">
          <input name="capacity" type="number" value="5" min="1" style="width:100%;padding:8px;margin-bottom:8px">
          <button class="btn btn-primary" type="submit">募集を作成</button>
        </form>
      </div>
      ${list}
      <a class="btn btn-secondary" href="/app/officer">← 戻る</a>
    </main>`
  return page(c, 'ボランティア管理', body, 'off', true)
})

officer.post('/volunteer', async (c) => {
  const user = await requireUiUser(c)
  if (user instanceof Response) return user
  const roleCtx = await getRole(c, user.userId)
  if (!roleCtx?.permissions.can_publish) return c.redirect('/app/home')
  const form = await c.req.parseBody()
  await c.env.DB.prepare(
    `INSERT INTO volunteer_calls (id, organization_id, created_by_role_id, title, capacity, event_datetime, closes_at)
     VALUES (?, ?, ?, ?, ?, datetime('now', '+14 days'), datetime('now', '+7 days'))`,
  )
    .bind(newId(), POC_ORG_ID, roleCtx.roleId, String(form.title), Number(form.capacity))
    .run()
  return c.redirect('/app/officer/volunteer')
})

// --- 集金（ダミー） ---
officer.get('/payments', async (c) => {
  const user = await requireUiUser(c)
  if (user instanceof Response) return user
  const roleCtx = await getRole(c, user.userId)
  if (!roleCtx?.permissions.can_view_finance) return c.redirect('/app/officer')

  const { results } = await c.env.DB.prepare(
    `SELECT pr.id, pr.title, pr.amount_yen, pr.status, u.display_name, pr.payment_method
     FROM payment_requests pr JOIN users u ON u.id = pr.user_id
     WHERE pr.organization_id = ? ORDER BY pr.status, pr.created_at DESC`,
  )
    .bind(POC_ORG_ID)
    .all<{ id: string; title: string; amount_yen: number; status: string; display_name: string; payment_method: string | null }>()

  const unpaid = (results ?? []).filter((r) => r.status === 'pending').length

  const body = `
    ${header('集金管理', `未払い ${unpaid} 件`)}
    <main>
      ${renderPaymentMethodsStrip()}
      <div class="card">
        <h2>一括請求（デモ）</h2>
        <form method="post" action="/app/officer/payments/bulk">
          <input name="title" value="PTA会費（2026年度）" style="width:100%;padding:8px;margin-bottom:8px">
          <input name="amount_yen" type="number" value="5000" style="width:100%;padding:8px;margin-bottom:8px">
          <button class="btn btn-primary" type="submit">全保護者に請求を発行</button>
        </form>
        <p class="meta">※実際の決済は Phase 1 で外部決済代行に接続予定</p>
      </div>
      ${(results ?? [])
        .map(
          (r) => `<div class="card"><span class="badge ${r.status === 'pending' ? 'unread' : ''}">${esc(r.status)}</span>
        <h2>${esc(r.title)}</h2><p>${esc(r.display_name)} — ¥${r.amount_yen.toLocaleString()} ${r.payment_method ? renderMethodBadge(r.payment_method) : ''}</p></div>`,
        )
        .join('')}
      <a class="btn btn-secondary" href="/app/officer">← 戻る</a>
    </main>`
  return page(c, '集金', body, 'off', true)
})

officer.post('/payments/bulk', async (c) => {
  const user = await requireUiUser(c)
  if (user instanceof Response) return user
  const roleCtx = await getRole(c, user.userId)
  if (!roleCtx?.permissions.can_view_finance) return c.redirect('/app/officer')
  const form = await c.req.parseBody()
  const { results: members } = await c.env.DB.prepare(
    `SELECT user_id FROM organization_memberships WHERE organization_id = ? AND status = 'active'`,
  )
    .bind(POC_ORG_ID)
    .all<{ user_id: string }>()

  for (const m of members ?? []) {
    await c.env.DB.prepare(
      `INSERT INTO payment_requests (id, organization_id, user_id, title, amount_yen, category, created_by_role_id)
       VALUES (?, ?, ?, ?, ?, '会費', ?)`,
    )
      .bind(newId(), POC_ORG_ID, m.user_id, String(form.title), Number(form.amount_yen), roleCtx.roleId)
      .run()
  }
  return c.redirect('/app/officer/payments')
})

officer.get('/ledger', async (c) => {
  const user = await requireUiUser(c)
  if (user instanceof Response) return user
  const roleCtx = await getRole(c, user.userId)
  if (!roleCtx?.permissions.can_view_finance) return c.redirect('/app/officer')

  const { results } = await c.env.DB.prepare(
    `SELECT le.amount_yen, le.category, le.payment_provider_ref, le.payment_method, le.created_at, u.display_name
     FROM ledger_entries le LEFT JOIN users u ON u.id = le.related_user_id
     WHERE le.organization_id = ? AND le.entry_type = 'income' ORDER BY le.created_at DESC`,
  )
    .bind(POC_ORG_ID)
    .all<{ amount_yen: number; category: string; payment_provider_ref: string; payment_method: string; created_at: string; display_name: string }>()

  const body = `
    ${header('入金履歴', 'Organization 受取 — ダミー決済分')}
    <main>
      ${(results ?? [])
        .map(
          (e) => `<div class="card"><p><strong>¥${e.amount_yen.toLocaleString()}</strong> ${esc(e.category)} ${renderMethodBadge(e.payment_method)}</p>
        <p class="meta">${esc(e.display_name ?? '')} · ${esc(e.payment_provider_ref)} · ${esc(e.created_at)}</p></div>`,
        )
        .join('') || '<div class="empty">入金履歴なし</div>'}
      <a class="btn btn-secondary" href="/app/officer">← 戻る</a>
    </main>`
  return page(c, '入金履歴', body, 'off', true)
})

// --- 役職アサイン ---
officer.get('/roles', async (c) => {
  const user = await requireUiUser(c)
  if (user instanceof Response) return user
  const roleCtx = await getRole(c, user.userId)
  if (!roleCtx?.permissions.can_manage_roles) return c.redirect('/app/officer')

  const { results: roles } = await c.env.DB.prepare(
    `SELECT id, name FROM roles WHERE organization_id = ? AND name != '一般保護者'`,
  )
    .bind(POC_ORG_ID)
    .all<{ id: string; name: string }>()

  const body = `
    ${header('役職アサイン', `年度: ${currentSchoolYear()}`)}
    <main>
      <div class="card">
        <p class="meta">デモ: 保護者アカウント (user-demo-parent) を広報委員に昇格</p>
        <form method="post" action="/app/officer/roles/assign">
          <select name="role_id" style="width:100%;padding:8px;margin-bottom:8px">
            ${(roles ?? []).map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}
          </select>
          <input type="hidden" name="user_id" value="user-demo-parent">
          <button class="btn btn-primary" type="submit">アサイン</button>
        </form>
      </div>
      <a class="btn btn-secondary" href="/app/officer">← 戻る</a>
    </main>`
  return page(c, '権限', body, 'off', true)
})

officer.post('/roles/assign', async (c) => {
  const user = await requireUiUser(c)
  if (user instanceof Response) return user
  const roleCtx = await getRole(c, user.userId)
  if (!roleCtx?.permissions.can_manage_roles) return c.redirect('/app/officer')
  const form = await c.req.parseBody()
  await c.env.DB.prepare(
    `INSERT INTO role_assignments (id, user_id, role_id, school_year, active) VALUES (?, ?, ?, ?, 1)`,
  )
    .bind(newId(), String(form.user_id), String(form.role_id), currentSchoolYear())
    .run()
  return c.redirect('/app/officer/roles')
})

export default officer
