-- seed_dev.sql — ローカル開発用のサンプルデータ
-- 子どもコード DEV-CHILD-001 で登録テスト可能

INSERT OR IGNORE INTO organizations (id, name, type, school_name, school_type, final_grade_label)
VALUES (
  'org-dev-001',
  'サンプル小学校PTA',
  'pta',
  'サンプル小学校',
  'shogakko',
  '6年'
);

INSERT OR IGNORE INTO children (id, organization_id, class_name, grade_label, child_code, status)
VALUES
  ('child-dev-001', 'org-dev-001', '3組', '4年', 'DEV-CHILD-001', 'active'),
  ('child-dev-002', 'org-dev-001', '1組', '2年', 'DEV-CHILD-002', 'active');

-- 未登録の子ども（名簿・紙出力テスト用）
-- child-dev-002 は保護者未登録

INSERT OR IGNORE INTO roles (id, organization_id, name, permission_set)
VALUES
  (
    'role-dev-parent',
    'org-dev-001',
    '一般保護者',
    '{"can_publish":false,"can_view_finance":false,"can_view_roster_detail":false,"can_manage_roles":false,"can_manage_org":false}'
  ),
  (
    'role-dev-koho',
    'org-dev-001',
    '広報委員',
    '{"can_publish":true,"can_view_finance":false,"can_view_roster_detail":true,"can_manage_roles":false,"can_manage_org":false}'
  ),
  (
    'role-dev-president',
    'org-dev-001',
    '会長',
    '{"can_publish":true,"can_view_finance":true,"can_view_roster_detail":true,"can_manage_roles":true,"can_manage_org":true}'
  );

-- 役員ユーザー割当は API POST /org/:orgId/roles/:roleId/assign で行う
-- 会長ロール ID: role-dev-president / 広報: role-dev-koho
