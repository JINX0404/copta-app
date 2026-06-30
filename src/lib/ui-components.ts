import { esc } from './html'
import { renderPaymentMethodsStrip } from './payment-methods'

export function renderTodoList(items: Array<{ label: string; href: string; urgent?: boolean }>): string {
  if (items.length === 0) {
    return `<div class="card card-ok"><p>✅ 対応事項はすべて完了です</p></div>`
  }
  return `<div class="card">
    <h2>やること</h2>
    <ul class="todo-list">
      ${items.map((i) => `<li class="${i.urgent ? 'urgent' : ''}"><a href="${i.href}">${esc(i.label)}</a></li>`).join('')}
    </ul>
  </div>`
}

export function renderFeedItem(icon: string, title: string, meta: string, href: string): string {
  return `<a class="feed-item" href="${href}">
    <span class="feed-icon">${icon}</span>
    <div><div class="feed-title">${esc(title)}</div><div class="meta">${esc(meta)}</div></div>
  </a>`
}

export { renderPaymentMethodsStrip }
