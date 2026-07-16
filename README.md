# Patent Search Assistant（tokko-search）

一般的な検索語から公開特許を検索し、特許文献から新しい検索語・引用文献を抽出して再検索する、先行技術調査支援システム。未公開発明・秘密情報は扱わない。

詳細な要件は PRD/SPEC（別管理）、開発運用は `AGENTS.md` と `notes/` を参照。

## セットアップ

```bash
npm ci
cp .env.example .env.local   # 値を埋める（下記参照）
npm run db:migrate           # Tursoへスキーマ適用
npm run dev
```

### 環境変数（`.env.local`）

| 変数 | 取得方法 |
|---|---|
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | `turso db create tokko-search` → `turso db show tokko-search --url` / `turso db tokens create tokko-search` |
| `GCP_PROJECT_ID` / `GCP_SERVICE_ACCOUNT_KEY` | GCPプロジェクト作成 + BigQuery API有効化 + 課金有効化 + サービスアカウント作成（`roles/bigquery.jobUser`）。JSONキーをbase64化して設定 |
| `BQ_DATASET` / `BQ_MAX_BYTES_BILLED` | `patents_jp` / `53687091200`（50GiB、デフォルトのまま推奨） |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Google AI Studio |
| `JPO_API_USERNAME` / `JPO_API_PASSWORD` | 特許庁「特許情報取得API」利用申請（任意・数営業日）。未設定でも他機能は動作する |

### BigQuery JP派生テーブルの作成（初回のみ）

`patents-public-data.patents.publications` への直接検索は無料枠（1TB/月）を即座に超えるため使用しない。`scripts/bq-setup.sql` で自プロジェクトにJP限定の派生テーブルを一度だけ作成する。

```bash
# 必ず先にdry-runでスキャン量を見積もる
bq query --use_legacy_sql=false --dry_run < scripts/bq-setup.sql
# 1TB前後に収まることを確認してから実行
bq query --use_legacy_sql=false < scripts/bq-setup.sql
```

## コマンド

```bash
npm run dev          # 開発サーバ
npm run build         # 本番ビルド
npm run test           # vitest（ユニット）
npm run lint            # ESLint
npx tsc --noEmit         # 型チェック
npm run db:generate       # スキーマ変更からマイグレーション生成
npm run db:migrate         # マイグレーション適用
npm run db:studio           # Drizzle Studio
```

## 開発運用

worktree運用・2段ゲート（`/ai-review` → commit → `/security-review`）・PRベース開発・GitHub正本は `AGENTS.md` / `notes/` を参照。
