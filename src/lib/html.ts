/** HTMLエスケープ */
export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function layout(title: string, body: string, extraHead = ''): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#1e4d8c">
  <title>${esc(title)} — COPTA POC</title>
  <link rel="stylesheet" href="/assets/poc.css">
  ${extraHead}
</head>
<body>
  <div class="app-shell">
    ${body}
  </div>
  <footer class="poc-footer">COPTA POC — デモデータのみ・本番利用不可</footer>
</body>
</html>`
}
