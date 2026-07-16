"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Checkbox, Heading, Input, Label, Paragraph, Spinner, TextField } from "@heroui/react";
import type { SearchTermsByType } from "@/features/search-terms/queries";
import { TERM_TYPE_LABELS, TERM_TYPE_ORDER } from "@/features/search-terms/term-type-labels";

interface SearchExecutionPanelProps {
  caseId: string;
  termsByType: SearchTermsByType;
}

interface SelectableTerm {
  id: string;
  label: string;
}

type SubmitState = { status: "idle" } | { status: "loading" } | { status: "error"; message: string };

function flattenTerms(termsByType: SearchTermsByType): SelectableTerm[] {
  const result: SelectableTerm[] = [];
  for (const type of TERM_TYPE_ORDER) {
    for (const term of termsByType[type]) {
      result.push({ id: term.id, label: `[${TERM_TYPE_LABELS[type]}] ${term.text}` });
    }
  }
  return result;
}

function extractErrorMessage(json: unknown): string {
  if (
    typeof json === "object" &&
    json !== null &&
    "error" in json &&
    typeof (json as { error: unknown }).error === "string"
  ) {
    return (json as { error: string }).error;
  }
  return "検索の実行に失敗しました。";
}

export function SearchExecutionPanel({ caseId, termsByType }: SearchExecutionPanelProps) {
  const router = useRouter();
  const selectableTerms = flattenTerms(termsByType);
  const [selectedTermIds, setSelectedTermIds] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [assignee, setAssignee] = useState("");
  const [ipcPrefix, setIpcPrefix] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>({ status: "idle" });
  const [isNavigating, startNavigateTransition] = useTransition();

  function toggleTerm(id: string, checked: boolean) {
    setSelectedTermIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  async function handleSubmit() {
    if (selectedTermIds.size === 0) {
      setSubmitState({ status: "error", message: "検索に使う検索語を1件以上選択してください。" });
      return;
    }
    if (!dateFrom || !dateTo) {
      setSubmitState({
        status: "error",
        message: "検索対象期間（開始日・終了日）を指定してください。",
      });
      return;
    }

    setSubmitState({ status: "loading" });

    try {
      const response = await fetch(`/api/cases/${caseId}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          termIds: Array.from(selectedTermIds),
          dateFrom,
          dateTo,
          assignee: assignee.trim() || undefined,
          ipcPrefix: ipcPrefix.trim() || undefined,
        }),
      });
      const json: unknown = await response.json();

      if (!response.ok) {
        setSubmitState({ status: "error", message: extractErrorMessage(json) });
        return;
      }

      const searchRunId = (json as { searchRunId?: string }).searchRunId;
      if (!searchRunId) {
        setSubmitState({ status: "error", message: "検索結果の取得に失敗しました。" });
        return;
      }

      setSubmitState({ status: "idle" });
      startNavigateTransition(() => {
        router.push(`/cases/${caseId}/runs/${searchRunId}`);
      });
    } catch {
      setSubmitState({
        status: "error",
        message: "検索の実行に失敗しました。通信状況を確認してもう一度お試しください。",
      });
    }
  }

  const isSubmitting = submitState.status === "loading" || isNavigating;

  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius)] border border-[var(--border)] p-4">
      <Heading level={2}>公開特許検索を実行</Heading>

      {selectableTerms.length === 0 ? (
        <Paragraph color="muted">先に検索語を登録してください。</Paragraph>
      ) : (
        <div className="flex flex-col gap-2">
          <Paragraph size="sm" color="muted">
            検索に使う検索語
          </Paragraph>
          <div className="flex flex-wrap gap-3">
            {selectableTerms.map((term) => (
              <Checkbox
                key={term.id}
                isSelected={selectedTermIds.has(term.id)}
                onChange={(checked) => toggleTerm(term.id, checked)}
              >
                <Checkbox.Content>
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <Label>{term.label}</Label>
                </Checkbox.Content>
              </Checkbox>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="search-date-from" className="text-sm text-[var(--muted,gray)]">
            検索対象期間（開始日・必須）
          </label>
          <input
            id="search-date-from"
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            className="rounded-[var(--radius)] border border-[var(--border)] px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="search-date-to" className="text-sm text-[var(--muted,gray)]">
            検索対象期間（終了日・必須）
          </label>
          <input
            id="search-date-to"
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
            className="rounded-[var(--radius)] border border-[var(--border)] px-3 py-2 text-sm"
          />
        </div>
      </div>

      <TextField value={assignee} onChange={setAssignee} aria-label="出願人">
        <Label>出願人（部分一致・任意）</Label>
        <Input placeholder="例: テスト工業" />
      </TextField>

      <TextField value={ipcPrefix} onChange={setIpcPrefix} aria-label="IPC前方一致">
        <Label>IPC前方一致（任意）</Label>
        <Input placeholder="例: H01L" />
      </TextField>

      {submitState.status === "error" ? (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Title>検索を実行できませんでした</Alert.Title>
            <Alert.Description>{submitState.message}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      <div className="flex justify-end">
        <Button
          type="button"
          variant="primary"
          onPress={handleSubmit}
          isDisabled={isSubmitting || selectableTerms.length === 0}
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <Spinner size="sm" />
              検索を実行中...
            </span>
          ) : (
            "検索を実行"
          )}
        </Button>
      </div>
    </section>
  );
}
