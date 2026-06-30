# COPTA — PTA運営OS

Cloudflare Workers + D1 上で動く PTA 向け運営OS の POC。

**ライブデモ**: https://copta-app.imai-b66.workers.dev/app

## クイックスタート（ローカル）

```bash
npm install
npm run db:migrate:local
npm run db:seed:poc
npm run dev
# → http://127.0.0.1:8787/app
```

デモアカウント（ワンクリックログイン）:
- 保護者（田中 花子）
- 広報委員（佐藤）
- 会長（鈴木）

## リポジトリ構成

```
docs/           PRD・アーキテクチャ・デプロイ手順
migrations/     D1 スキーマ + seed_poc.sql（ダミーデータ）
src/routes/     API + POC UI
public/         静的アセット（CSS）
scripts/        DBセットアップ
.github/        CI/CD（Cloudflare deploy）
```

## API（`/org/:orgId/...`）

認証・名簿・お知らせ・アンケート・引き継ぎ・役員チャット・ボランティア。
詳細は `docs/PRD.md` 参照。

## Cloudflare へデプロイ

```bash
npm run db:setup:remote   # 初回: スキーマ + ダミーデータ
npm run deploy
```

詳細: [docs/DEPLOY.md](docs/DEPLOY.md)

## GitHub 運用

- `main` に push → GitHub Actions で自動デプロイ
- いつでも `git clone` してローカル再開可能
- DB シードは Actions から手動（workflow_dispatch）

## 設計制約（必読）

`.cursorrules` — 個人間送金禁止、Role ベース権限、コメント欄なし 等

## 実装状況（Phase 0 POC）

- [x] 認証（マジックリンク + POCデモログイン）
- [x] 子どもID自己登録
- [x] 名簿（ゼロトラスト）
- [x] お知らせ（承認ワークフロー・既読・要返信）
- [x] アンケート・出欠
- [x] 引き継ぎボックス
- [x] 役員チャット
- [x] ボランティア募集
- [x] POC Web UI
- [ ] 集金 / ledger（Phase 1 — 法務確認後）
