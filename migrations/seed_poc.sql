-- seed_poc.sql — Cloudflare POC 用ダミーデータ（本番では使わない）
-- デモユーザー3名 + サンプル小学校PTA + 各機能のサンプル

-- 団体
INSERT OR REPLACE INTO organizations (id, name, type, school_name, school_type, final_grade_label)
VALUES (
  'org-demo-001',
  'さくら小学校PTA',
  'pta',
  'さくら小学校',
  'shogakko',
  '6年'
);

-- デモユーザー（contact_value_hash は magic link 用。POC は demo-login 推奨）
INSERT OR REPLACE INTO users (id, display_name, contact_method, contact_value_hash)
VALUES
  ('user-demo-parent', '田中 花子', 'email', 'e3cfddde61d1174a5cf9fec7a33c64553ab48596168006762a155e5a1c40a677'),
  ('user-demo-koho', '佐藤 広報', 'email', 'dc94290c3eb4fe28a17ebb2aa403e6b10b8b75e4510639d4beea24ecb2f5b6ae'),
  ('user-demo-president', '鈴木 会長', 'email', '221249f2db64c0183dc33d7c6683b2fc51fdf8a2142212cc559e2040e54b91cd');

-- 子ども（child-demo-002 は未登録）
INSERT OR REPLACE INTO children (id, organization_id, class_name, grade_label, child_code, status)
VALUES
  ('child-demo-001', 'org-demo-001', '3組', '4年', 'SAKURA-4-3-001', 'active'),
  ('child-demo-002', 'org-demo-001', '1組', '2年', 'SAKURA-2-1-002', 'active'),
  ('child-demo-003', 'org-demo-001', '2組', '6年', 'SAKURA-6-2-003', 'active');

-- 保護者紐付け
INSERT OR IGNORE INTO user_children (user_id, child_id)
VALUES
  ('user-demo-parent', 'child-demo-001'),
  ('user-demo-president', 'child-demo-001');

INSERT OR IGNORE INTO organization_memberships (id, user_id, organization_id, status)
VALUES
  ('mem-parent', 'user-demo-parent', 'org-demo-001', 'active'),
  ('mem-koho', 'user-demo-koho', 'org-demo-001', 'active'),
  ('mem-president', 'user-demo-president', 'org-demo-001', 'active');

-- 役職
INSERT OR REPLACE INTO roles (id, organization_id, name, permission_set)
VALUES
  ('role-parent', 'org-demo-001', '一般保護者',
   '{"can_publish":false,"can_view_finance":false,"can_view_roster_detail":false,"can_manage_roles":false,"can_manage_org":false}'),
  ('role-koho', 'org-demo-001', '広報委員',
   '{"can_publish":true,"can_view_finance":false,"can_view_roster_detail":true,"can_manage_roles":false,"can_manage_org":false}'),
  ('role-president', 'org-demo-001', '会長',
   '{"can_publish":true,"can_view_finance":true,"can_view_roster_detail":true,"can_manage_roles":true,"can_manage_org":true}');

-- 役職アサイン（school_year は実行時に近い年度を wrangler --command で上書き推奨）
INSERT OR REPLACE INTO role_assignments (id, user_id, role_id, school_year, active)
VALUES
  ('ra-parent', 'user-demo-parent', 'role-parent', '2026', 1),
  ('ra-koho', 'user-demo-koho', 'role-koho', '2026', 1),
  ('ra-president', 'user-demo-president', 'role-president', '2026', 1);

-- お知らせ
INSERT OR REPLACE INTO announcements (id, organization_id, created_by_role_id, title, body, segment, requires_response, approval_status, published_at)
VALUES
  ('ann-demo-001', 'org-demo-001', 'role-koho',
   '運動会のお知らせ',
   '9月20日（土）9:00〜14:00に運動会を開催します。弁当の持参をお願いします。雨天時は翌日に順延します。',
   '{"grade_labels":["4年"]}', 1, 'published', datetime('now', '-2 days')),
  ('ann-demo-002', 'org-demo-001', 'role-koho',
   'PTA総会のご案内',
   '10月5日 19:00〜 オンライン開催。Zoom URLは別途配信します。',
   '{"all":true}', 0, 'published', datetime('now', '-5 days')),
  ('ann-demo-draft', 'org-demo-001', 'role-koho',
   '【下書き】学芸会について',
   '内容確認中...',
   '{"all":true}', 0, 'draft', NULL);

INSERT OR IGNORE INTO announcement_reads (announcement_id, user_id)
VALUES ('ann-demo-002', 'user-demo-parent');

-- アンケート
INSERT OR REPLACE INTO surveys (id, organization_id, created_by_role_id, title, questions, closes_at)
VALUES
  ('survey-demo-001', 'org-demo-001', 'role-koho', '運動会 出欠確認',
   '[{"id":"attendance","type":"attendance","label":"運動会に参加しますか？","options":["参加する","不参加"]}]',
   datetime('now', '+14 days'));

INSERT OR IGNORE INTO survey_responses (id, survey_id, user_id, answers)
VALUES ('resp-demo-001', 'survey-demo-001', 'user-demo-president', '{"attendance":"参加する"}');

-- 引き継ぎ
INSERT OR REPLACE INTO handover_items (id, organization_id, role_id, title, content, school_year)
VALUES
  ('handover-demo-001', 'org-demo-001', 'role-koho', '広報SNSアカウント',
   'Instagram: @sakura-pta（パスワードは別途共有）\n更新頻度: 週1回', '2026');

-- ボランティア
INSERT OR REPLACE INTO volunteer_calls (id, organization_id, created_by_role_id, title, event_datetime, capacity, selection_method, closes_at)
VALUES
  ('vol-demo-001', 'org-demo-001', 'role-koho', '運動会当日ボランティア',
   datetime('now', '+7 days'), 10, 'first_come', datetime('now', '+5 days'));

-- チャット
INSERT OR REPLACE INTO chat_channels (id, organization_id, role_id, name)
VALUES ('chat-demo-001', 'org-demo-001', 'role-koho', '広報委員会');

INSERT OR REPLACE INTO chat_messages (id, channel_id, sender_role_id, body)
VALUES
  ('msg-demo-001', 'chat-demo-001', 'role-koho', '来年度の広報計画を来週の定例で共有します。'),
  ('msg-demo-002', 'chat-demo-001', 'role-president', '了解です。会場予約の状況も併せてお願いします。');

-- ダミー請求
INSERT OR REPLACE INTO payment_requests (id, organization_id, user_id, child_id, title, amount_yen, category, status, payment_method, payment_provider_ref, paid_at, created_by_role_id, due_at)
VALUES
  ('pay-demo-001', 'org-demo-001', 'user-demo-parent', 'child-demo-001', 'PTA会費（2026年度）', 5000, '会費', 'pending', NULL, NULL, NULL, 'role-president', datetime('now', '+30 days')),
  ('pay-demo-002', 'org-demo-001', 'user-demo-president', 'child-demo-001', 'PTA会費（2026年度）', 5000, '会費', 'paid', 'apple_pay', 'APL-DEMO-SEED001', datetime('now', '-3 days'), 'role-president', datetime('now', '+30 days')),
  ('pay-demo-003', 'org-demo-001', 'user-demo-parent', 'child-demo-001', '運動会Tシャツ代', 1500, 'イベント費', 'pending', NULL, NULL, NULL, 'role-koho', datetime('now', '+14 days')),
  ('pay-demo-004', 'org-demo-001', 'user-demo-koho', 'child-demo-001', '教材費（4年）', 800, '教材費', 'paid', 'paypay', 'PPY-DEMO-SEED002', datetime('now', '-1 days'), 'role-president', datetime('now', '+30 days'));

INSERT OR IGNORE INTO ledger_entries (id, organization_id, entry_type, category, amount_yen, related_user_id, payment_provider_ref, payment_method)
VALUES
  ('ledger-demo-001', 'org-demo-001', 'income', '会費', 5000, 'user-demo-president', 'APL-DEMO-SEED001', 'apple_pay'),
  ('ledger-demo-002', 'org-demo-001', 'income', '教材費', 800, 'user-demo-koho', 'PPY-DEMO-SEED002', 'paypay');
