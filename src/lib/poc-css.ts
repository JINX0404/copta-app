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
`
