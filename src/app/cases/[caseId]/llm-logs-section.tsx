import { Heading, Paragraph } from "@heroui/react";
import type { LlmLogRow } from "@/features/llm-logs/queries";
import { LLM_LOG_KIND_LABELS } from "@/features/llm-logs/labels";

interface LlmLogsSectionProps {
  logs: LlmLogRow[];
}

function formatDateTime(value: Date): string {
  return value.toLocaleString("ja-JP");
}

/**
 * 案件詳細ページに表示する「AI送受信ログ」セクション。
 * `getLlmLogsByCase` で取得した直近ログ一覧を、送受信内容は折りたたみ表示で提供する。
 */
export function LlmLogsSection({ logs }: LlmLogsSectionProps) {
  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius)] border border-[var(--border)] p-4">
      <Heading level={2}>AI送受信ログ</Heading>
      {logs.length === 0 ? (
        <Paragraph color="muted">まだAIへの送受信履歴はありません。</Paragraph>
      ) : (
        <ul className="flex flex-col gap-2">
          {logs.map((log) => (
            <li
              key={log.id}
              className="flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--border)] p-3 text-sm"
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-medium">{LLM_LOG_KIND_LABELS[log.kind]}</span>
                <span className="text-[var(--muted,gray)]">{log.model}</span>
                <span className="text-[var(--muted,gray)]">{formatDateTime(log.createdAt)}</span>
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer select-none">送信内容（プロンプト）</summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded-[var(--radius)] bg-[var(--muted-bg,#f5f5f5)] p-2 whitespace-pre-wrap">
                  {log.requestPayload}
                </pre>
              </details>
              <details className="text-sm">
                <summary className="cursor-pointer select-none">受信内容（応答）</summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded-[var(--radius)] bg-[var(--muted-bg,#f5f5f5)] p-2 whitespace-pre-wrap">
                  {log.responsePayload ?? "応答なし（エラー等）"}
                </pre>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
