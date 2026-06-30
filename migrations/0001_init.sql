-- 0001_init.sql
-- COPTA 初期スキーマ
-- 設計原則：
--  1) 権限・データは Role（役職）に紐づける。User個人に直接紐づけない。
--  2) 集金の受取人は常に Organization。User個人を受取人にする経路を作らない。
--  3) RoleAssignment は school_year を持ち、年度を跨いで履歴が残る（引き継ぎ・監査ログの土台）。
--  4) User（保護者）は単一のOrganizationに固定しない。複数の学校PTAに同時所属できる
--     （きょうだいが別の学校に通う、進学で別組織に移る、等のケースに対応するため）。
--  5) Child（子ども）は卒業しても削除しない。status を 'graduated' にして履歴・支払い記録を読み取り専用で残す。

CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('pta','kodomokai','hogosyakai','other')),
  school_name TEXT,
  school_type TEXT CHECK (school_type IN ('yochien','hoikuen','shogakko','chugakko','kotogakko','other')),
  final_grade_label TEXT,               -- 例: 小学校なら"6年"。卒業判定の自動化に使う
  data_residency TEXT NOT NULL DEFAULT 'jp',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Userは特定のOrganizationに固定しない。所属はmembershipテーブルで多対多にする。
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  contact_method TEXT NOT NULL,         -- email or phone, used for magic link / OTP
  contact_value_hash TEXT NOT NULL,     -- hashed, not plaintext-searchable by default
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 1保護者 × 複数組織（例: 小学校PTA + 中学校PTA）に対応する中間テーブル
CREATE TABLE organization_memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  -- 'inactive' = その組織に紐づく子どもが全員卒業/転校した。退会ではなくアーカイブ。
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, organization_id)
);

CREATE TABLE children (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  class_name TEXT,
  grade_label TEXT,                     -- 例: "6年"。final_grade_labelと比較して卒業判定に使う
  child_code TEXT NOT NULL UNIQUE,      -- school-issued registration code (child-level, not class-level)
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','graduated','withdrawn')),
  graduated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE user_children (
  user_id TEXT NOT NULL REFERENCES users(id),
  child_id TEXT NOT NULL REFERENCES children(id),
  PRIMARY KEY (user_id, child_id)
);

-- 役職マスタ（団体ごとにカスタムも許容するが、標準セットを用意）
CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,                   -- 会長/副会長/会計/広報委員/学級委員/監査/一般保護者
  permission_set TEXT NOT NULL          -- JSON文字列。例: {"can_publish":true,"can_view_finance":true}
);

-- 年度付きの役職アサイン。これがデータと権限の紐付け先になる。
CREATE TABLE role_assignments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  role_id TEXT NOT NULL REFERENCES roles(id),
  school_year TEXT NOT NULL,            -- 例: "2026"
  active INTEGER NOT NULL DEFAULT 1,    -- 4/1ロールオーバーで自動的に0へ
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE announcements (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  created_by_role_id TEXT NOT NULL REFERENCES roles(id),  -- Roleに紐づく。Userではない
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  segment TEXT NOT NULL,                -- JSON: 学年/クラス/委員会指定
  requires_response INTEGER NOT NULL DEFAULT 0,
  approval_status TEXT NOT NULL DEFAULT 'draft' CHECK (approval_status IN ('draft','pending_approval','published')),
  published_at TEXT
  -- 注意: コメント/返信用のカラム・テーブルを意図的に作らない。既読確認のみ。荒れる温床になるため。
);

CREATE TABLE announcement_reads (
  announcement_id TEXT NOT NULL REFERENCES announcements(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  read_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (announcement_id, user_id)
);

CREATE TABLE surveys (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  created_by_role_id TEXT NOT NULL REFERENCES roles(id),
  title TEXT NOT NULL,
  questions TEXT NOT NULL,              -- JSON
  closes_at TEXT
);

CREATE TABLE survey_responses (
  id TEXT PRIMARY KEY,
  survey_id TEXT NOT NULL REFERENCES surveys(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  answers TEXT NOT NULL,                -- JSON
  submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 引き継ぎボックス：Roleに紐づく。担当者が変わっても残る。
CREATE TABLE handover_items (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  role_id TEXT NOT NULL REFERENCES roles(id),
  title TEXT NOT NULL,
  content TEXT,
  file_r2_key TEXT,
  school_year TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ボランティア募集：人数・先着/抽選・キャンセル待ちに対応
CREATE TABLE volunteer_calls (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  created_by_role_id TEXT NOT NULL REFERENCES roles(id),
  title TEXT NOT NULL,
  event_datetime TEXT,
  capacity INTEGER NOT NULL,
  selection_method TEXT NOT NULL DEFAULT 'first_come' CHECK (selection_method IN ('first_come','lottery')),
  closes_at TEXT
);

CREATE TABLE volunteer_signups (
  id TEXT PRIMARY KEY,
  volunteer_call_id TEXT NOT NULL REFERENCES volunteer_calls(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('confirmed','waitlisted','pending','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 台帳：受取人は常にOrganization。Userを受取人にするカラムを意図的に作らない。
CREATE TABLE ledger_entries (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),  -- 受取人は常に団体
  entry_type TEXT NOT NULL CHECK (entry_type IN ('income','expense')),
  category TEXT NOT NULL,               -- 会費/イベント費/備品/寄付 等
  amount_yen INTEGER NOT NULL,
  related_user_id TEXT REFERENCES users(id),  -- 支払者の参照（受取人ではない）
  payment_provider_ref TEXT,            -- 決済代行側のトランザクションID
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  actor_role_id TEXT REFERENCES roles(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_role_assignments_user ON role_assignments(user_id, active);
CREATE INDEX idx_ledger_org ON ledger_entries(organization_id, created_at);
CREATE INDEX idx_org_memberships_user ON organization_memberships(user_id, status);
CREATE INDEX idx_children_org_status ON children(organization_id, status);
