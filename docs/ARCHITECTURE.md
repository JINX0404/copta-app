# アーキテクチャ方針

## 技術スタック（S-suiteとの継続性を優先）
- **Runtime**: Cloudflare Workers
- **Framework**: Hono
- **DB**: Cloudflare D1（SQLite互換）。将来的に集金GMVが増えたら、トランザクション/集計が重い部分のみ別DB（Postgres on Neon等）への切り出しを検討。
- **Auth**: マジックリンク or SMS OTP。Cloudflare Access（Zero Trust）は社内/役員管理画面側に限定し、保護者向けは独自の軽量認証。
- **Storage**: Cloudflare R2（PDF・画像添付、領収書OCR用の原本保存）
- **OCR**: Google Cloud Vision API（既存S-suiteのSquashと同じ構成を流用）
- **AI構造化**: Workers AI（お知らせ本文生成、OCR後のテキスト構造化）
- **フロント**: Hono + HTMX or 軽量SPA（React等）。保護者向けはモバイル最適化必須、PWA化を前提にネイティブアプリストア審査を回避。
- **国内residency**: Cloudflareのデータロケーション機能（Regional Services / Jurisdictional Restrictions）でJP固定を検討。教委・自治体向け要件として必須になるため、後付けしやすいよう最初からテーブル設計・リージョン設定を意識する。

## マルチテナント設計
- 1テナント = 1 PTA団体（Organization）。サブドメイン or パスベースのルーティングはS-suiteのSlash/Squashと同様の方式を流用可能。
- 学校が複数PTA（例：小学校PTA＋地域子ども会）を持つケースに対応できるよう、Organization同士の親子関係を許容。

## 集金（決済）の接続方針 ※法的構造は必ず厳守
- 自社は決済処理を持たない。決済代行（候補：GMO-PG / Stripe / KOMOJU）に委託。
- **受取人（債権者）= Organization（PTA）固定**。個人ユーザーのウォレット/口座への送金経路を一切作らない。
- PTAから収納代行の委託（代理受領権の付与）を受ける規約を、Organization作成時の同意フローに組み込む。
- 自前のチャージ残高（前払式支払手段）は実装しない。決済代行のトークン化・都度決済のみ。
- 実装フェーズはPRD通りPhase 1以降だが、`Ledger`（台帳）テーブルは最初から「Organization単位の入出金」として設計しておく（後から個人間送金的な機能を足さない設計を、スキーマレベルで強制する）。

## ディレクトリ構成（初期スキャフォールド）
```
copta-app/
  docs/
    PRD.md
    ARCHITECTURE.md
    STRATEGY.md          # Claude/Gemini統合戦略（追って格納）
  migrations/
    0001_init.sql
  src/
    index.ts             # Hono entrypoint
    routes/
      auth.ts
      org.ts
      announcements.ts
      surveys.ts
      handover.ts         # 引き継ぎボックス
    middleware/
      role-guard.ts        # 役職ベースの権限チェック
    db/
      schema.ts
  wrangler.toml
  package.json
  .cursorrules
  CLAUDE.md
```

## Cursor / AIペアプロ運用ルール
- `.cursorrules` に「個人役員口座への送金経路を作らない」「データはRoleに紐づける」等のガードレールを明文化済み（実装時にAIが誤って個人間送金的な機能を生成しないようにするため）。
