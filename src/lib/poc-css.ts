export const POC_CSS = `/* COPTA POC — モバイルファースト */
:root {
  --bg: #f4f6f9;
  --card: #fff;
  --primary: #1e4d8c;
  --primary-dark: #163a6b;
  --accent: #e85d04;
  --muted: #64748b;
  --border: #e2e8f0;
  --ok: #059669;
  --warn: #d97706;
  --radius: 12px;
  --shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
  font-family: 'Hiragino Sans', 'Noto Sans JP', system-ui, sans-serif;
}

* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: #0f172a;
  line-height: 1.5;
  min-height: 100dvh;
}

.app-shell { max-width: 480px; margin: 0 auto; padding: 0 0 72px; }

header.app-header {
  background: var(--primary);
  color: #fff;
  padding: 16px;
  position: sticky;
  top: 0;
  z-index: 10;
}
header.app-header h1 { margin: 0; font-size: 1.1rem; font-weight: 700; }
header.app-header p { margin: 4px 0 0; font-size: 0.8rem; opacity: 0.85; }

main { padding: 16px; }

.card {
  background: var(--card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 16px;
  margin-bottom: 12px;
  border: 1px solid var(--border);
}
.card h2 { margin: 0 0 8px; font-size: 1rem; }
.card p { margin: 0 0 8px; color: #334155; font-size: 0.9rem; }
.meta { font-size: 0.75rem; color: var(--muted); }

.badge {
  display: inline-block;
  font-size: 0.7rem;
  padding: 2px 8px;
  border-radius: 999px;
  background: #dbeafe;
  color: var(--primary);
  font-weight: 600;
}
.badge.unread { background: #fee2e2; color: #b91c1c; }
.badge.officer { background: #fef3c7; color: #92400e; }

.btn {
  display: inline-block;
  border: none;
  border-radius: 10px;
  padding: 12px 16px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  text-align: center;
}
.btn-primary { background: var(--primary); color: #fff; width: 100%; }
.btn-primary:active { background: var(--primary-dark); }
.btn-secondary { background: #e2e8f0; color: #334155; width: 100%; margin-top: 8px; }
.btn-accent { background: var(--accent); color: #fff; width: 100%; margin-top: 8px; }
.btn-sm { padding: 8px 12px; font-size: 0.85rem; width: auto; }

.demo-grid { display: grid; gap: 8px; margin-top: 12px; }

nav.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  border-top: 1px solid var(--border);
  display: flex;
  max-width: 480px;
  margin: 0 auto;
  z-index: 20;
}
nav.bottom-nav a {
  flex: 1;
  text-align: center;
  padding: 10px 4px;
  font-size: 0.65rem;
  color: var(--muted);
  text-decoration: none;
}
nav.bottom-nav a.active { color: var(--primary); font-weight: 700; }
nav.bottom-nav a span { display: block; font-size: 1.2rem; }

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.stat {
  background: var(--card);
  border-radius: var(--radius);
  padding: 14px;
  text-align: center;
  border: 1px solid var(--border);
}
.stat .num { font-size: 1.6rem; font-weight: 800; color: var(--primary); }
.stat .label { font-size: 0.7rem; color: var(--muted); }

table.roster { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
table.roster th, table.roster td { padding: 8px 4px; border-bottom: 1px solid var(--border); text-align: left; }

.poc-footer {
  text-align: center;
  font-size: 0.7rem;
  color: var(--muted);
  padding: 8px 16px 24px;
}

.login-hero {
  text-align: center;
  padding: 32px 16px 16px;
}
.login-hero h1 { font-size: 1.5rem; color: var(--primary); margin: 0 0 8px; }
.login-hero p { color: var(--muted); font-size: 0.9rem; margin: 0; }

.empty { text-align: center; color: var(--muted); padding: 24px; font-size: 0.9rem; }

.alert {
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: var(--radius);
  padding: 12px;
  font-size: 0.85rem;
  margin-bottom: 12px;
}

.chat-msg {
  margin-bottom: 10px;
  padding: 10px;
  background: #f8fafc;
  border-radius: 10px;
  font-size: 0.9rem;
}
.chat-msg .who { font-size: 0.75rem; color: var(--primary); font-weight: 600; }

/* 決済手段 */
.pm-strip { background: #fff; border-radius: var(--radius); padding: 12px; margin-bottom: 12px; border: 1px solid var(--border); }
.pm-strip-label { font-size: 0.7rem; color: var(--muted); margin: 0 0 8px; font-weight: 600; }
.pm-badges { display: flex; flex-wrap: wrap; gap: 6px; }
.pm-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 0.65rem; font-weight: 700; padding: 4px 8px; border-radius: 6px; color: #fff; }
.pm-badge-sm { font-size: 0.6rem; padding: 2px 6px; }
.pm-paypay { background: #ff0033; }
.pm-apple { background: #000; }
.pm-google { background: #4285f4; }
.pm-card { background: #1e4d8c; }
.pm-convenience { background: #059669; }
.pm-bank { background: #6366f1; }
.pm-icon { font-weight: 900; }

.checkout-box { text-align: center; }
.checkout-amount { font-size: 2rem; font-weight: 800; color: var(--primary); margin: 16px 0 8px; }
.checkout-tax { font-size: 0.8rem; font-weight: 400; color: var(--muted); }
.checkout-note { margin-top: 16px; font-size: 0.75rem; }

.pm-form { text-align: left; margin-top: 16px; }
.pm-option { display: block; margin-bottom: 8px; cursor: pointer; }
.pm-option input { position: absolute; opacity: 0; }
.pm-option-body {
  display: flex; align-items: center; gap: 12px;
  padding: 14px; border: 2px solid var(--border); border-radius: 12px;
  background: #fff; transition: border-color 0.15s;
}
.pm-option input:checked + .pm-option-body { border-color: var(--primary); background: #eff6ff; }
.pm-option-icon {
  width: 44px; height: 44px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.2rem; font-weight: 800; color: #fff; flex-shrink: 0;
}
.pm-paypay .pm-option-icon { background: #ff0033; }
.pm-apple .pm-option-icon { background: #000; }
.pm-google .pm-option-icon { background: #4285f4; }
.pm-card .pm-option-icon { background: #1e4d8c; }
.pm-convenience .pm-option-icon { background: #059669; }
.pm-bank .pm-option-icon { background: #6366f1; }
.apple-logo {
  display: inline-block; width: 18px; height: 22px;
  background: #fff; mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 814 1000'%3E%3Cpath fill='black' d='M788 739c-15 38-33 73-54 105-28 43-51 73-69 90-28 27-57 41-88 42-23 0-50-7-82-21-32-15-61-22-88-22-28 0-59 7-93 21-34 15-61 23-83 23-32 0-61-14-88-42-19-18-43-49-73-93-31-46-57-96-78-151-35-87-52-171-52-252 0-93 20-164 61-212 32-38 74-57 126-57 30 0 74 8 131 24 57 16 93 24 109 24 12 0 52-9 120-28 64-17 118-24 162-21 120 10 210 58 270 145-107 65-160 155-160 271 0 102 38 187 114 255 34 32 72 57 114 75-9 26-19 51-30 75zM671 19c0 80-29 145-86 195-69 59-152 93-242 88-1-9-2-18-2-28 0-77 34-159 94-226 30-34 68-62 114-84 46-21 89-33 122-35 1 10 2 19 2 30z'/%3E%3C/svg%3E") center/contain no-repeat;
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 814 1000'%3E%3Cpath fill='black' d='M788 739c-15 38-33 73-54 105-28 43-51 73-69 90-28 27-57 41-88 42-23 0-50-7-82-21-32-15-61-22-88-22-28 0-59 7-93 21-34 15-61 23-83 23-32 0-61-14-88-42-19-18-43-49-73-93-31-46-57-96-78-151-35-87-52-171-52-252 0-93 20-164 61-212 32-38 74-57 126-57 30 0 74 8 131 24 57 16 93 24 109 24 12 0 52-9 120-28 64-17 118-24 162-21 120 10 210 58 270 145-107 65-160 155-160 271 0 102 38 187 114 255 34 32 72 57 114 75-9 26-19 51-30 75zM671 19c0 80-29 145-86 195-69 59-152 93-242 88-1-9-2-18-2-28 0-77 34-159 94-226 30-34 68-62 114-84 46-21 89-33 122-35 1 10 2 19 2 30z'/%3E%3C/svg%3E") center/contain no-repeat;
}
.pm-option-label { font-weight: 700; font-size: 0.95rem; }
.pm-option-sub { font-size: 0.75rem; color: var(--muted); }
.btn-pay { margin-top: 16px; font-size: 1.05rem; padding: 16px; }

.pay-success { text-align: center; padding: 24px 0; }
.pay-success-icon { font-size: 4rem; margin-bottom: 8px; }
.receipt-box {
  background: #fff; border: 2px dashed var(--border); border-radius: var(--radius);
  padding: 20px; margin: 16px 0; text-align: left;
}
.receipt-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
.receipt-row:last-child { border-bottom: none; font-weight: 700; font-size: 1.1rem; }

.todo-list { list-style: none; padding: 0; margin: 0; }
.todo-list li { padding: 10px 0; border-bottom: 1px solid var(--border); }
.todo-list li.urgent a { color: #b91c1c; font-weight: 600; }
.todo-list a { text-decoration: none; color: var(--primary); }

.feed-item {
  display: flex; gap: 12px; align-items: flex-start;
  padding: 12px 0; border-bottom: 1px solid var(--border);
  text-decoration: none; color: inherit;
}
.feed-icon { font-size: 1.4rem; flex-shrink: 0; }
.feed-title { font-weight: 600; font-size: 0.9rem; }
.card-ok { background: #ecfdf5; border-color: #a7f3d0; }

.feature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.feature-tile {
  background: #fff; border: 1px solid var(--border); border-radius: var(--radius);
  padding: 16px 12px; text-align: center; text-decoration: none; color: inherit;
  box-shadow: var(--shadow);
}
.feature-tile span { font-size: 1.6rem; display: block; margin-bottom: 4px; }
.feature-tile strong { font-size: 0.8rem; }
`
