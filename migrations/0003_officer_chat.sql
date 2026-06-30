-- 0003_officer_chat.sql
-- 役員間チャット（役職・委員会単位。全保護者自由投稿は不可）

CREATE TABLE chat_channels (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  role_id TEXT NOT NULL REFERENCES roles(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_chat_channels_org ON chat_channels(organization_id);

CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES chat_channels(id),
  sender_role_id TEXT NOT NULL REFERENCES roles(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_chat_messages_channel ON chat_messages(channel_id, created_at);

-- アンケート回答の重複防止（1ユーザー1回答）
CREATE UNIQUE INDEX idx_survey_responses_unique ON survey_responses(survey_id, user_id);

-- お知らせ要返信フラグ用（既読とは別）
CREATE TABLE announcement_responses (
  announcement_id TEXT NOT NULL REFERENCES announcements(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  responded_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (announcement_id, user_id)
);
