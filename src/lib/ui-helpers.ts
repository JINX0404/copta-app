import type { Context } from 'hono'
import type { AppEnv, RoleContext } from '../types/env'
import { esc, layout } from './html'
import { resolveSessionUser, POC_ORG_ID } from './session'
import { resolveActiveRole } from '../middleware/role-guard'

export type UiUser = { userId: string; sessionId: string; display_name: string }

export async function requireUiUser(c: Context<AppEnv>): Promise<UiUser | Response> {
  const user = await resolveSessionUser(c.env.DB, c.req.header('Cookie'))
  if (!user) return c.redirect('/app')
  return user
}

export async function getRole(c: Context<AppEnv>, userId: string): Promise<RoleContext | null> {
  return resolveActiveRole(c.env.DB, userId, POC_ORG_ID)
}

export function header(name: string, sub: string): string {
  return `<header class="app-header"><h1>${esc(name)}</h1><p>${esc(sub)}</p></header>`
}

export function nav(active: string, isOfficer: boolean): string {
  const items = [
    { href: '/app/home', key: 'home', icon: '🏠', label: 'ホーム' },
    { href: '/app/announcements', key: 'ann', icon: '📢', label: 'お知らせ' },
    { href: '/app/surveys', key: 'sur', icon: '📋', label: 'アンケート' },
    { href: '/app/payments', key: 'pay', icon: '💰', label: '集金' },
    { href: '/app/volunteer', key: 'vol', icon: '🤝', label: 'ボランティア' },
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

export function page(c: Context<AppEnv>, title: string, body: string, active: string, isOfficer: boolean) {
  return c.html(layout(title, body + nav(active, isOfficer)))
}

export { esc, layout, POC_ORG_ID }
