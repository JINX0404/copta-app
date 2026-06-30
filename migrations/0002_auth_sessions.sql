-- 0002_auth_sessions.sql
-- マジックリンク認証とセッション管理

CREATE TABLE magic_link_tokens (
  id TEXT PRIMARY KEY,
  contact_method TEXT NOT NULL CHECK (contact_method IN ('email', 'phone')),
  contact_value_hash TEXT NOT NULL,
  display_name TEXT,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_magic_link_token ON magic_link_tokens(token);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
