"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Checkbox, Heading, Label, Paragraph, Spinner } from "@heroui/react";
import { saveSelectedExpansions, type SelectedExpansionTerm } from "@/features/search-terms/actions";
import { TERM_TYPE_LABELS } from "@/features/search-terms/term-type-labels";
import type { ExpansionTermType } from "@/lib/gemini/schemas";

interface ExpansionPanelProps {
  caseId: string;
  originalTerms: string[];
  technicalField: string | null;
}

interface ExpansionCandidate {
  type: ExpansionTermType;
  text: string;
  sourceTerm: string;
}

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; candidates: ExpansionCandidate[] };

function candidateKey(candidate: ExpansionCandidate, index: number): string {
  return `${candidate.type}:${candidate.text}:${index}`;
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
  return "検索語展開に失敗しました。";
}

export function ExpansionPanel({ caseId, originalTerms, technicalField }: ExpansionPanelProps) {
  const router = useRouter();
  const [excludedTerms, setExcludedTerms] = useState<Set<string>>(new Set());
  const [fetchState, setFetchState] = useState<FetchState>({ status: "idle" });
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, startSaveTransition] = useTransition();

  const targetTerms = originalTerms.filter((term) => !excludedTerms.has(term));

  function toggleTargetTerm(term: string, checked: boolean) {
    setExcludedTerms((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.delete(term);
      } else {
        next.add(term);
      }
      return next;
    });
  }

  async function runExpansion() {
    if (targetTerms.length === 0) {
      setFetchState({ status: "error", message: "展開する検索語を1件以上選択してください。" });
      return;
    }

    setFetchState({ status: "loading" });
    setSaveMessage(null);

    try {
      const response = await fetch(`/api/cases/${caseId}/expansions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terms: targetTerms }),
      });
      const json: unknown = await response.json();

      if (!response.ok) {
        setFetchState({ status: "error", message: extractErrorMessage(json) });
        return;
      }

      const candidates = (json as { terms?: ExpansionCandidate[] }).terms ?? [];
      setFetchState({ status: "success", candidates });
      setSelectedKeys(new Set(candidates.map((candidate, index) => candidateKey(candidate, index))));
    } catch {
      setFetchState({
        status: "error",
        message: "検索語展開に失敗しました。通信状況を確認してもう一度お試しください。",
      });
    }
  }

  function toggleCandidate(key: string, checked: boolean) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  function handleSave() {
    if (fetchState.status !== "success") {
      return;
    }
    const selected: SelectedExpansionTerm[] = fetchState.candidates.filter((candidate, index) =>
      selectedKeys.has(candidateKey(candidate, index)),
    );
    if (selected.length === 0) {
      setSaveMessage("保存する候補を選択してください。");
      return;
    }

    startSaveTransition(async () => {
      const result = await saveSelectedExpansions(caseId, selected);
      setSaveMessage(`${result.insertedCount}件の検索語を保存しました。`);
      setFetchState({ status: "idle" });
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius)] border border-[var(--border)] p-4">
      <Heading level={2}>AIによる検索語展開</Heading>
      <Paragraph color="muted">
        {technicalField ? `技術分野「${technicalField}」をヒントに、` : ""}
        類義語・上位/下位概念・材質・機能・効果・英語表現の候補をAIが提案します。提案はそのまま保存されず、選んだものだけを登録できます。
      </Paragraph>

      {originalTerms.length === 0 ? (
        <Paragraph color="muted">先に検索語を登録してください。</Paragraph>
      ) : (
        <div className="flex flex-col gap-2">
          <Paragraph size="sm" color="muted">
            展開する検索語
          </Paragraph>
          <div className="flex flex-wrap gap-3">
            {originalTerms.map((term) => (
              <Checkbox
                key={term}
                isSelected={targetTerms.includes(term)}
                onChange={(checked) => toggleTargetTerm(term, checked)}
              >
                <Checkbox.Content>
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <Label>{term}</Label>
                </Checkbox.Content>
              </Checkbox>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          type="button"
          variant="primary"
          onPress={runExpansion}
          isDisabled={fetchState.status === "loading" || originalTerms.length === 0}
        >
          {fetchState.status === "loading" ? "展開中..." : "AI展開を実行"}
        </Button>
      </div>

      {fetchState.status === "loading" ? (
        <div className="flex items-center gap-2">
          <Spinner size="sm" />
          <Paragraph color="muted">Geminiに問い合わせています...</Paragraph>
        </div>
      ) : null}

      {fetchState.status === "error" ? (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Title>展開に失敗しました</Alert.Title>
            <Alert.Description>{fetchState.message}</Alert.Description>
          </Alert.Content>
          <Button type="button" variant="tertiary" size="sm" onPress={runExpansion}>
            再実行
          </Button>
        </Alert>
      ) : null}

      {fetchState.status === "success" ? (
        <div className="flex flex-col gap-4">
          {fetchState.candidates.length === 0 ? (
            <Paragraph color="muted">提案できる候補が見つかりませんでした。</Paragraph>
          ) : (
            <>
              <div className="flex flex-col gap-3">
                {fetchState.candidates.map((candidate, index) => {
                  const key = candidateKey(candidate, index);
                  return (
                    <Checkbox
                      key={key}
                      isSelected={selectedKeys.has(key)}
                      onChange={(checked) => toggleCandidate(key, checked)}
                    >
                      <Checkbox.Content>
                        <Checkbox.Control>
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                        <Label>
                          {`[${TERM_TYPE_LABELS[candidate.type]}] ${candidate.text}（由来: ${candidate.sourceTerm}）`}
                        </Label>
                      </Checkbox.Content>
                    </Checkbox>
                  );
                })}
              </div>
              <div className="flex items-center justify-between gap-3">
                <Paragraph color="muted">{saveMessage ?? ""}</Paragraph>
                <Button type="button" variant="primary" onPress={handleSave} isDisabled={isSaving}>
                  {isSaving ? "保存中..." : "選択した候補を保存"}
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
