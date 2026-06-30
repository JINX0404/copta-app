#!/usr/bin/env bash
# Cloudflare D1 にマイグレーション + POCダミーデータを投入
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET="${1:---remote}"
echo "==> Target: $TARGET"

run_sql() {
  npx wrangler d1 execute copta-db "$TARGET" --file="$1"
}

run_sql ./migrations/0001_init.sql || true
run_sql ./migrations/0002_auth_sessions.sql || true
run_sql ./migrations/0003_officer_chat.sql || true
run_sql ./migrations/seed_poc.sql

SY=$(node --input-type=module -e "
const d = new Date();
const y = d.getFullYear();
const m = d.getMonth() + 1;
console.log(m >= 4 ? y : y - 1);
")

echo "==> Sync school_year to $SY"
npx wrangler d1 execute copta-db "$TARGET" --command \
  "UPDATE role_assignments SET school_year = '$SY' WHERE id IN ('ra-parent','ra-koho','ra-president');"

echo "==> Done. Open /app and use demo login."
