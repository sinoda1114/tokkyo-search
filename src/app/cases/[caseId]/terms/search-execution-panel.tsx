"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Checkbox, Heading, Input, Label, Paragraph, Spinner, TextField } from "@heroui/react";
import { getLocalTimeZone, today } from "@internationalized/date";
import type { SearchTermsByType, SearchTermRow } from "@/features/search-terms/queries";
import { TERM_TYPE_LABELS, TERM_TYPE_ORDER } from "@/features/search-terms/term-type-labels";
import { collectFieldErrors, searchRequestSchema } from "@/features/patent-search/validation";
import { DateRangeField } from "./date-range-field";

const DEFAULT_SEARCH_RANGE_YEARS = 5;

/** 検索対象期間の初期値。開始日・終了日は必須入力のため、毎回手入力させず直近5年を自動セットする。 */
function getDefaultDateRange(): { from: string; to: string } {
  const end = today(getLocalTimeZone());
  const start = end.subtract({ years: DEFAULT_SEARCH_RANGE_YEARS });
  return { from: start.toString(), to: end.toString() };
}

interface SearchExecutionPanelProps {
  caseId: string;
  termsByType: SearchTermsByType;
}

interface SelectableTerm {
  id: string;
  label: string;
}

/** 概念グループ（先行技術調査のAND検索単位）。ルート語（`parentTermId`がnullの語）ごとにまとまる。 */
interface TermGroup {
  rootId: string;
  rootLabel: string;
  terms: SelectableTerm[];
}

type SubmitState = { status: "idle" } | { status: "loading" } | { status: "error"; message: string };

interface TouchedFields {
  termIds: boolean;
  dateFrom: boolean;
  dateTo: boolean;
}

const INITIAL_TOUCHED: TouchedFields = { termIds: false, dateFrom: false, dateTo: false };

/**
 * `parentTermId`をルート（`parentTermId`がnullの語）まで辿り、そのルートのidを返す。
 * `search-service.ts`の`resolveRootId`とロジックを揃えている（検索実行時のグループ化と
 * 画面上のグループ表示を一致させるため）。
 */
function resolveRootId(term: SearchTermRow, byId: Map<string, SearchTermRow>): string {
  let current: SearchTermRow = term;
  const visited = new Set<string>([current.id]);
  while (current.parentTermId) {
    const parent = byId.get(current.parentTermId);
    if (!parent || visited.has(parent.id)) {
      break;
    }
    visited.add(parent.id);
    current = parent;
  }
  return current.id;
}

/**
 * 検索語を概念グループ（ルートが同じもの同士）にセクション分けする。
 * グループ・グループ内の語の順序は、いずれも既存の`TERM_TYPE_ORDER`表示順に従う。
 */
function groupTerms(termsByType: SearchTermsByType): TermGroup[] {
  const allTerms: SearchTermRow[] = TERM_TYPE_ORDER.flatMap((type) => termsByType[type]);
  const byId = new Map(allTerms.map((term) => [term.id, term]));

  const groupOrder: string[] = [];
  const groups = new Map<string, TermGroup>();

  for (const type of TERM_TYPE_ORDER) {
    for (const term of termsByType[type]) {
      const rootId = resolveRootId(term, byId);
      if (!groups.has(rootId)) {
        groupOrder.push(rootId);
        groups.set(rootId, { rootId, rootLabel: byId.get(rootId)?.text ?? term.text, terms: [] });
      }
      groups.get(rootId)!.terms.push({
        id: term.id,
        label: `[${TERM_TYPE_LABELS[type]}] ${term.text}`,
      });
    }
  }

  return groupOrder.map((rootId) => groups.get(rootId)!);
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
  const termGroups = useMemo(() => groupTerms(termsByType), [termsByType]);
  const selectableTerms = useMemo(
    () => termGroups.flatMap((group) => group.terms),
    [termGroups],
  );
  // 「除外した語のID」だけを保持する設計にすることで、新しく登録・AI展開で追加された検索語は
  // 何もしなくても自動的に選択済み（検索対象）になる。ユーザーが個別に外した語だけ覚えておく。
  const [deselectedTermIds, setDeselectedTermIds] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState(() => getDefaultDateRange().from);
  const [dateTo, setDateTo] = useState(() => getDefaultDateRange().to);
  const [assignee, setAssignee] = useState("");
  const [ipcPrefix, setIpcPrefix] = useState("");
  const [touched, setTouched] = useState<TouchedFields>(INITIAL_TOUCHED);
  const [submitState, setSubmitState] = useState<SubmitState>({ status: "idle" });
  const [isNavigating, startNavigateTransition] = useTransition();
  const termsGroupRef = useRef<HTMLDivElement>(null);
  const dateRangeWrapperRef = useRef<HTMLDivElement>(null);

  const selectedTermIds = useMemo(
    () => selectableTerms.filter((term) => !deselectedTermIds.has(term.id)).map((term) => term.id),
    [selectableTerms, deselectedTermIds],
  );

  // 送信前でも各フィールドの妥当性をリアルタイムに把握し、「送信して初めてエラーに気づく」を防ぐ。
  const fieldErrors = useMemo(() => {
    const parsed = searchRequestSchema.safeParse({
      termIds: selectedTermIds,
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
    setDeselectedTermIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.delete(id);
      } else {
        next.add(id);
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
      termIds: selectedTermIds,
      dateFrom,
      dateTo,
      assignee,
      ipcPrefix,
    });

    if (!parsed.success) {
      // 各項目の指摘はフィールド直下にインライン表示するが、それだけでは気づきにくいため
      // 最初のエラー項目へフォーカスを移動する。
      const fieldErrorsOnSubmit = collectFieldErrors(parsed.error);
      if (fieldErrorsOnSubmit.termIds) {
        termsGroupRef.current?.focus();
      } else if (fieldErrorsOnSubmit.dateFrom ?? fieldErrorsOnSubmit.dateTo) {
        dateRangeWrapperRef.current?.focus();
      }
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
        <div
          ref={termsGroupRef}
          role="group"
          aria-label="検索に使う検索語"
          aria-describedby={termsErrorVisible ? "term-ids-error" : undefined}
          tabIndex={-1}
          className="flex flex-col gap-2"
        >
          <Paragraph size="sm" color="muted">
            検索に使う検索語（グループ内はOR、グループ間はANDで検索します。展開元の語ごとにグループ分けされています）
          </Paragraph>
          <div className="flex flex-col gap-3">
            {termGroups.map((group) => (
              <div
                key={group.rootId}
                className="flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--border)] p-3"
              >
                <Heading level={3}>{group.rootLabel}</Heading>
                <div className="flex flex-wrap gap-3">
                  {group.terms.map((term) => (
                    <Checkbox
                      key={term.id}
                      isSelected={!deselectedTermIds.has(term.id)}
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
            ))}
          </div>
          {termsErrorVisible ? (
            <Paragraph id="term-ids-error" role="alert" size="sm" className="text-[var(--danger,#dc2626)]">
              {fieldErrors.termIds}
            </Paragraph>
          ) : null}
        </div>
      )}

      <div ref={dateRangeWrapperRef} tabIndex={-1}>
        <DateRangeField
          label="検索対象期間（開始日・終了日）"
          dateFrom={dateFrom}
          dateTo={dateTo}
          onChange={handleDateRangeChange}
          onBlur={() => setTouched((prev) => ({ ...prev, dateFrom: true, dateTo: true }))}
          isInvalid={dateErrorVisible}
          errorMessage={dateErrorVisible ? dateErrorMessage : undefined}
        />
      </div>

      <TextField value={assignee} onChange={setAssignee}>
        <Label>出願人（部分一致・任意）</Label>
        <Input placeholder="例: テスト工業" />
      </TextField>

      <TextField value={ipcPrefix} onChange={setIpcPrefix}>
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
              検索を実行中…
            </span>
          ) : (
            "検索を実行"
          )}
        </Button>
      </div>
    </section>
  );
}
