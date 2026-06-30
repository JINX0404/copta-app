# COPTA — PTA運営OS

Cloudflare Workers + D1 上で動く PTA 向け運営OS の POC。

**ライブデモ**: https://copta-app.imai-b66.workers.dev/app

## クイックスタート（ローカル）

```bash
npm install
npm run db:setup:local:full   # 初回必須（忘れるとログインでエラー）
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

## POCで体験できる機能

| 機能 | 保護者 | 広報 | 会長 |
|------|:------:|:----:|:----:|
| お知らせ閲覧・既読・要返信 | ✅ | ✅ | ✅ |
| お知らせ作成→承認→公開 | — | ✅ | ✅（公開） |
| 出欠・アンケート回答 | ✅ | ✅ | ✅ |
| アンケート作成・集計 | — | ✅ | ✅ |
| 集金（ダミー決済） | ✅ | — | ✅（請求発行） |
| ボランティア申込 | ✅ | ✅ | ✅ |
| 名簿・未登録者リスト | — | ✅ | ✅ |
| 引き継ぎボックス | — | ✅ | ✅ |
| 役員チャット | — | ✅ | ✅ |
| 子どもID自己登録 | ✅ | — | — |
| 役職アサイン | — | — | ✅ |

### おすすめデモ手順
1. **保護者**でログイン → 未払い会費をダミー決済 / 運動会出欠回答 / ボランティア申込
2. **広報**でログイン → お知らせ下書き→承認申請 / アンケート作成 / チャット投稿
3. **会長**でログイン → お知らせ公開 / 一括請求発行 / 入金履歴確認

## 実装状況（Phase 0 POC）

- [x] 認証（マジックリンク + POCデモログイン）
- [x] 子どもID自己登録（UIフォーム）
- [x] 名簿（ゼロトラスト）・未登録者印刷
- [x] お知らせ（承認ワークフロー・既読・要返信）
- [x] アンケート・出欠
- [x] 引き継ぎボックス
- [x] 役員チャット
- [x] ボランティア募集
- [x] 集金（ダミー決済 + 台帳記録）
- [x] POC Web UI（全機能）
- [ ] 実決済代行接続（Phase 1 — 法務確認後）
