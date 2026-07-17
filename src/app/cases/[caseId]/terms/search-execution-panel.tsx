"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Checkbox, Heading, Input, Label, Paragraph, Spinner, TextField } from "@heroui/react";
import type { SearchTermsByType } from "@/features/search-terms/queries";
import { TERM_TYPE_LABELS, TERM_TYPE_ORDER } from "@/features/search-terms/term-type-labels";
import { collectFieldErrors, searchRequestSchema } from "@/features/patent-search/validation";
import { DateRangeField } from "./date-range-field";

interface SearchExecutionPanelProps {
  caseId: string;
  termsByType: SearchTermsByType;
}

interface SelectableTerm {
  id: string;
  label: string;
}

type SubmitState = { status: "idle" } | { status: "loading" } | { status: "error"; message: string };

interface TouchedFields {
  termIds: boolean;
  dateFrom: boolean;
  dateTo: boolean;
}

const INITIAL_TOUCHED: TouchedFields = { termIds: false, dateFrom: false, dateTo: false };

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
  const [touched, setTouched] = useState<TouchedFields>(INITIAL_TOUCHED);
  const [submitState, setSubmitState] = useState<SubmitState>({ status: "idle" });
  const [isNavigating, startNavigateTransition] = useTransition();

  // 送信前でも各フィールドの妥当性をリアルタイムに把握し、「送信して初めてエラーに気づく」を防ぐ。
  const fieldErrors = useMemo(() => {
    const parsed = searchRequestSchema.safeParse({
      termIds: Array.from(selectedTermIds),
      dateFrom,
      dateTo,
      assignee,
      ipcPrefix,
    });
    return parsed.success ? {} : collectFieldErrors(parsed.error);
  }, [selectedTermIds, dateFrom, dateTo, assignee, ipcPrefix]);

  const termsErrorVisible = touched.termIds && Boolean(fieldErrors.termIds);
  const dateErrorVisible = (touched.dateFrom || touched.dateTo) && Boolean(fieldErrors.dateFrom ?? fieldErrors.dateTo);
  const dateErrorMessage = fieldErrors.dateTo ?? fieldErrors.dateFrom;

  function toggleTerm(id: string, checked: boolean) {
    setTouched((prev) => ({ ...prev, termIds: true }));
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

  function handleDateRangeChange(nextDateFrom: string, nextDateTo: string) {
    setTouched((prev) => ({ ...prev, dateFrom: true, dateTo: true }));
    setDateFrom(nextDateFrom);
    setDateTo(nextDateTo);
  }

  async function handleSubmit() {
    setTouched({ termIds: true, dateFrom: true, dateTo: true });

    const parsed = searchRequestSchema.safeParse({
      termIds: Array.from(selectedTermIds),
      dateFrom,
      dateTo,
      assignee,
      ipcPrefix,
    });

    if (!parsed.success) {
      // 各項目の指摘はフィールド直下にインライン表示するため、ここでは送信を止めるだけでよい。
      return;
    }

    setSubmitState({ status: "loading" });

    try {
      const response = await fetch(`/api/cases/${caseId}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          termIds: parsed.data.termIds,
          dateFrom: parsed.data.dateFrom,
          dateTo: parsed.data.dateTo,
          assignee: parsed.data.assignee,
          ipcPrefix: parsed.data.ipcPrefix,
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
          {termsErrorVisible ? (
            <Paragraph size="sm" className="text-[var(--danger,#dc2626)]">
              {fieldErrors.termIds}
            </Paragraph>
          ) : null}
        </div>
      )}

      <DateRangeField
        label="検索対象期間（開始日・終了日）"
        dateFrom={dateFrom}
        dateTo={dateTo}
        onChange={handleDateRangeChange}
        onBlur={() => setTouched((prev) => ({ ...prev, dateFrom: true, dateTo: true }))}
        isInvalid={dateErrorVisible}
        errorMessage={dateErrorVisible ? dateErrorMessage : undefined}
      />

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
