# Cloudflare POC デプロイ手順

## 前提
- Cloudflare アカウント
- `npx wrangler login` 済み
- GitHub リポジトリ（push で自動デプロイ）

## 初回セットアップ（ローカルから）

```bash
npm install

# D1 / R2 は wrangler.toml に設定済み（初回のみ create が必要な場合）
# npx wrangler d1 create copta-db
# npx wrangler r2 bucket create copta-attachments

# リモートDBにスキーマ + ダミーデータ
npm run db:setup:remote

# デプロイ
npm run deploy
```

デプロイ後、Workers URL（例: `https://copta-app.<account>.workers.dev/app`）を開く。

## POC の試し方

1. `/app` を開く
2. **保護者 / 広報委員 / 会長** のいずれかでワンクリックログイン
3. お知らせ・アンケート・役員ダッシュボードを操作

### デモデータ概要
| 項目 | 内容 |
|------|------|
| 団体 | さくら小学校PTA |
| 未登録子ども | 2年1組（コード `SAKURA-2-1-002`） |
| お知らせ | 運動会（4年向け）、PTA総会、下書き1件 |
| 役員 | 会長が下書きを公開可能 |

## GitHub Actions

`main` ブランチへの push で Worker を自動デploy。

### 必要な Secrets（Repository Settings → Secrets）
| Name | 説明 |
|------|------|
| `CLOUDFLARE_API_TOKEN` | Workers + D1 権限付き API トークン |
| `CLOUDFLARE_ACCOUNT_ID` | `wrangler whoami` で確認 |

DB シードは Actions の **Run workflow**（workflow_dispatch）から手動実行。

## ローカル開発

```bash
npm run db:migrate:local
npm run db:seed:poc
npm run dev
# → http://127.0.0.1:8787/app
```

## 注意
- `POC_MODE=true` のときのみデモログインが有効
- 本番公開前に `POC_MODE` を `false` にし、`DEV_EXPOSE_MAGIC_LINK` も無効化すること
- 集金（ledger）は Phase 1 — 法務確認後
