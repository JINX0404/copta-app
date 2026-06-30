/** POC用ダミー決済手段（実際の決済代行接続は Phase 1） */
export type PaymentMethodId =
  | 'paypay'
  | 'apple_pay'
  | 'google_pay'
  | 'credit_card'
  | 'convenience'
  | 'bank_transfer'

export type PaymentMethod = {
  id: PaymentMethodId
  label: string
  sublabel: string
  cssClass: string
  icon: string
}

export const PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'paypay', label: 'PayPay', sublabel: 'かんたん残高払い', cssClass: 'pm-paypay', icon: 'P' },
  { id: 'apple_pay', label: 'Apple Pay', sublabel: 'iPhone / Apple Watch', cssClass: 'pm-apple', icon: '' },
  { id: 'google_pay', label: 'Google Pay', sublabel: 'Android', cssClass: 'pm-google', icon: 'G' },
  { id: 'credit_card', label: 'クレジットカード', sublabel: 'VISA / Mastercard / JCB', cssClass: 'pm-card', icon: '💳' },
  { id: 'convenience', label: 'コンビニ払い', sublabel: 'セブン・ファミマ・ローソン等', cssClass: 'pm-convenience', icon: '🏪' },
  { id: 'bank_transfer', label: '銀行振込', sublabel: 'Pay-easy（ペイジー）', cssClass: 'pm-bank', icon: '🏦' },
]

export function getPaymentMethod(id: string | null | undefined): PaymentMethod | undefined {
  return PAYMENT_METHODS.find((m) => m.id === id)
}

export function renderPaymentMethodsStrip(compact = false): string {
  const items = PAYMENT_METHODS.map(
    (m) =>
      `<span class="pm-badge ${m.cssClass}${compact ? ' pm-badge-sm' : ''}" title="${m.label}">${m.icon ? `<span class="pm-icon">${m.icon}</span>` : ''}${m.label}</span>`,
  ).join('')
  return `<div class="pm-strip${compact ? ' pm-strip-compact' : ''}"><p class="pm-strip-label">対応決済（デモ）</p><div class="pm-badges">${items}</div></div>`
}

export function renderPaymentMethodPicker(formAction: string, amountYen: number): string {
  const options = PAYMENT_METHODS.map(
    (m, i) => `
    <label class="pm-option ${m.cssClass}">
      <input type="radio" name="payment_method" value="${m.id}" ${i === 0 ? 'checked' : ''} required>
      <div class="pm-option-body">
        <div class="pm-option-icon">${m.icon || (m.id === 'apple_pay' ? '<span class="apple-logo"></span>' : m.label[0])}</div>
        <div>
          <div class="pm-option-label">${m.label}</div>
          <div class="pm-option-sub">${m.sublabel}</div>
        </div>
      </div>
    </label>`,
  ).join('')

  return `
    <div class="checkout-box">
      <div class="checkout-amount">¥${amountYen.toLocaleString()}<span class="checkout-tax">（税込）</span></div>
      <p class="meta">お支払い方法を選択してください</p>
      <form method="post" action="${formAction}" class="pm-form">
        ${options}
        <button class="btn btn-primary btn-pay" type="submit">支払う</button>
      </form>
      <p class="meta checkout-note">※POCデモのため実際の決済は発生しません。受取人はさくら小学校PTA（団体）です。</p>
    </div>`
}

export function renderMethodBadge(methodId: string | null): string {
  const m = getPaymentMethod(methodId)
  if (!m) return '<span class="meta">—</span>'
  return `<span class="pm-badge ${m.cssClass} pm-badge-sm">${m.label}</span>`
}

export function providerRefForMethod(methodId: PaymentMethodId): string {
  const prefix: Record<PaymentMethodId, string> = {
    paypay: 'PPY-DEMO',
    apple_pay: 'APL-DEMO',
    google_pay: 'GPY-DEMO',
    credit_card: 'CRD-DEMO',
    convenience: 'CVN-DEMO',
    bank_transfer: 'BNK-DEMO',
  }
  return `${prefix[methodId]}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
}
