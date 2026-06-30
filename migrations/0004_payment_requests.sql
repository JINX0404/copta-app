-- 0004_payment_requests.sql
-- POC用: 請求・ダミー決済（受取人は常に Organization。ledger_entries へ入金記録）

CREATE TABLE payment_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  child_id TEXT REFERENCES children(id),
  title TEXT NOT NULL,
  amount_yen INTEGER NOT NULL,
  category TEXT NOT NULL DEFAULT '会費',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled')),
  payment_provider_ref TEXT,
  due_at TEXT,
  created_by_role_id TEXT REFERENCES roles(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_payment_requests_org_status ON payment_requests(organization_id, status);
CREATE INDEX idx_payment_requests_user ON payment_requests(user_id, status);
