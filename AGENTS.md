<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Patent Search Assistant（tokko-search）— プロジェクト指示

特許先行技術調査支援システム（`tokko-search`）の AI 向けプロジェクト指示。

## 運用ルール（HOW）の正本

このプロジェクトの開発フロー（worktree / PR / 2 段ゲート / デプロイ規律 / GitHub 正本 / Issue・Project タスク管理 / 供給網デフォルト）は、**本リポの `notes/`** を正本とする（リポと一緒に travel する）。
同じ挙動規律は `~/.claude` グローバルにも既定として入っているため、自分の端末の全 PJ に自動適用される。
**ここには挙動の再説明を書かない**（重複・ドリフト防止）。このファイルは**このプロジェクト固有の値だけ**を持つ。

- 開発フロー詳細: `notes/dev-workflow-multiagent.md`
- タスク管理詳細: `notes/task-management-issue-workflow.md`

## このプロジェクト固有の値

| 項目 | 値 |
|---|---|
| リポ実体 dir（統合＋デプロイ専用・ここで機能開発しない） | `~/dev/tokko-search` |
| GitHub | 未作成（実装完了後にユーザー承認を得て作成） |
| デプロイ基盤 | Vercel（git 駆動・feature push = Preview / main マージ = Production・未接続） |
| 本番 URL | 未デプロイ |
| 絶対 URL の env | `NEXT_PUBLIC_SITE_URL`（ハードコード禁止） |
| タスク正本 | GitHub Issue / Project「Patent Search Assistant」（GitHub 作成後に設定） |

## プロダクト固有の制約（重要）

- 未公開発明の核心部分・秘密情報は本システムに入力しない。案件作成・検索語入力の各画面に注意書きを表示する。
- AI（Gemini）は特許性・新規性・進歩性を断定しない。提供された本文にない情報を事実として出力しない。プロンプトにこの制約を必ず含める。
- BigQuery `patents-public-data.patents.publications` への直接キーワード検索は禁止（コスト暴発）。必ず自プロジェクトの JP 派生テーブル（`scripts/bq-setup.sql`）経由。全クエリに `maximumBytesBilled` を強制する。
- AI への送信内容は `llm_logs` テーブルに保存し、後から確認できるようにする。
- 同一特許の AI 解析結果は再利用する（`patent_analyses.patentId` UNIQUE で担保、再計算しない）。

## 役割境界（このプロジェクト）

現状ソロ運用。将来複数エージェント/worktree 並行時は `features/` 単位（cases / search-terms / patent-search / patents / analysis / jpo）で担当を分割する。

## dev 規律

- dev サーバ起動中にビルド成果物を消したり本番ビルドを実行しない（壊れる）。dev は 1 つ。
- 実装は原則 TDD（テスト先行）で進める。テストを先に書き、失敗を確認してから最小実装、その後リファクタする。
- AI 検証は `tsc` / `eslint` / `test` で行う（手動確認をユーザーに丸投げしない）。
- ユーザー向けの主要フローには E2E テスト（Playwright 等）を用意し、マージ前に通す。単体・結合テストだけで済ませない。
- `.env.local` は触らない・中身を出力しない（本番 env は Vercel ダッシュボードが正本）。
- シークレット（API キー・トークン）はログ / 出力に出さない。必要なら redact する。
- `JPO_API_USERNAME` / `JPO_API_PASSWORD` は未取得（申請中、発行まで数営業日）。未設定でもビルド・テスト・他機能が壊れない設計にする（`lib/env.ts` で optional 扱い、UI は該当セクションを非表示）。
