-- 0005_payment_method.sql
-- 決済手段（POCダミー: PayPay / Apple Pay 等）

ALTER TABLE payment_requests ADD COLUMN payment_method TEXT;
ALTER TABLE payment_requests ADD COLUMN paid_at TEXT;

ALTER TABLE ledger_entries ADD COLUMN payment_method TEXT;
