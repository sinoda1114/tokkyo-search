"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Checkbox, Heading, Label, Link, Paragraph, Spinner } from "@heroui/react";
import { addResearchTerms, type ResearchTerm } from "@/features/search-terms/actions";
import { mapAnalysisCandidateType } from "@/features/search-terms/analysis-term-type-mapper";
import type { AnalysisResult } from "@/lib/gemini/schemas";

interface ResearchCandidatesPanelProps {
  caseId: string;
  analysis: AnalysisResult;
}

interface CandidateItem extends ResearchTerm {
  key: string;
}

interface CandidateGroup {
  label: string;
  items: CandidateItem[];
}

/**
 * キーワード検索語として登録可能な候補（特徴的な技術用語・再検索候補語）のみをグループ化する。
 * 「引用文献」（公開特許番号の文字列）はタイトル・要約への正規表現検索語としては機能しないため、
 * ここには含めない（`CitedReferencesSection` で公開番号から直接特許詳細を開くボタンとして表示する）。
 */
function buildCandidateGroups(analysis: AnalysisResult): CandidateGroup[] {
  return [
    {
      label: "特徴的な技術用語",
      items: analysis.keyTerms.map((text, index) => ({
        key: `keyTerm:${index}`,
        text,
        termType: "synonym",
      })),
    },
    {
      label: "再検索候補語",
      items: analysis.searchCandidates.map((candidate, index) => ({
        key: `searchCandidate:${index}`,
        text: candidate.text,
        termType: mapAnalysisCandidateType(candidate.type),
      })),
    },
  ];
}

/**
 * AI文献解析結果（特徴的用語・再検索候補・引用文献）からユーザーが選んだ語を
 * `addResearchTerms` で案件の検索語一覧（source: "analysis"）に追加するパネル。
 * `analysis-section.tsx` の解析結果表示に埋め込まれ、解析結果があるときだけ表示される。
 */
export function ResearchCandidatesPanel({ caseId, analysis }: ResearchCandidatesPanelProps) {
  const groups = buildCandidateGroups(analysis);
  const allItems = groups.flatMap((group) => group.items);
  const hasCitedReferences = analysis.citedReferences.length > 0;

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );
  const [isSaving, startSaveTransition] = useTransition();

  if (allItems.length === 0 && !hasCitedReferences) {
    return null;
  }

  function toggleItem(key: string, checked: boolean) {
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
    const selected = allItems.filter((item) => selectedKeys.has(item.key));
    if (selected.length === 0) {
      setSaveMessage({ type: "error", text: "追加する語を選択してください。" });
      return;
    }

    startSaveTransition(async () => {
      await addResearchTerms(
        caseId,
        selected.map((item) => ({ termType: item.termType, text: item.text })),
      );
      setSaveMessage({
        type: "success",
        text: "案件の検索語一覧に追加しました。検索語作成画面から再検索できます。",
      });
      setSelectedKeys(new Set());
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius)] border border-[var(--border)] p-4">
      <Heading level={3}>解析結果から検索語を追加</Heading>
      <Paragraph color="muted">
        気になる語を選んで案件の検索語一覧に追加できます。追加後は検索語作成画面から再検索できます。
      </Paragraph>

      {groups.map((group) => {
        const groupLabelId = `research-candidates-group-${group.label}`;
        return group.items.length > 0 ? (
          <div key={group.label} className="flex flex-col gap-2">
            <Paragraph size="sm" color="muted" id={groupLabelId}>
              {group.label}
            </Paragraph>
            <div role="group" aria-labelledby={groupLabelId} className="flex flex-wrap gap-3">
              {group.items.map((item) => (
                <Checkbox
                  key={item.key}
                  isSelected={selectedKeys.has(item.key)}
                  onChange={(checked) => toggleItem(item.key, checked)}
                >
                  <Checkbox.Content>
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                    <Label>{item.text}</Label>
                  </Checkbox.Content>
                </Checkbox>
              ))}
            </div>
          </div>
        ) : null;
      })}

      {allItems.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            {saveMessage && (
              <Alert status={saveMessage.type === "error" ? "danger" : "success"}>
                <Alert.Content>
                  <Alert.Description>
                    {saveMessage.text}
                    {saveMessage.type === "success" ? (
                      <>
                        {" "}
                        <Link href={`/cases/${caseId}/terms`}>検索語作成画面を開く</Link>
                      </>
                    ) : null}
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            )}
          </div>
          <Button type="button" variant="primary" size="sm" onPress={handleSave} isDisabled={isSaving}>
            {isSaving ? "追加中..." : "選択した語を検索語に追加"}
          </Button>
        </div>
      )}

      {hasCitedReferences && (
        <CitedReferencesSection caseId={caseId} publicationNumbers={analysis.citedReferences} />
      )}
    </section>
  );
}

interface CitedReferencesSectionProps {
  caseId: string;
  publicationNumbers: string[];
}

/**
 * AI解析結果の「引用文献」（公開特許番号の文字列）を表示するセクション。
 * 公開番号はタイトル・要約への正規表現検索語としては機能しないため、検索語追加チェックボックスではなく
 * `/api/patents/lookup` 経由でその特許を直接開くボタンとして表示する。
 */
function CitedReferencesSection({ caseId, publicationNumbers }: CitedReferencesSectionProps) {
  const groupLabelId = "research-candidates-group-cited-references";
  return (
    <div className="flex flex-col gap-2">
      <Paragraph size="sm" color="muted" id={groupLabelId}>
        引用文献（公開番号から特許詳細を開く）
      </Paragraph>
      <div role="group" aria-labelledby={groupLabelId} className="flex flex-wrap gap-3">
        {publicationNumbers.map((publicationNumber) => (
          <CitedReferenceButton
            key={publicationNumber}
            caseId={caseId}
            publicationNumber={publicationNumber}
          />
        ))}
      </div>
    </div>
  );
}

interface CitedReferenceButtonProps {
  caseId: string;
  publicationNumber: string;
}

interface PatentLookupSuccessBody {
  patentId: string;
}

function isPatentLookupSuccessBody(value: unknown): value is PatentLookupSuccessBody {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { patentId?: unknown }).patentId === "string"
  );
}

const CITED_REFERENCE_LOOKUP_ERROR_MESSAGE = "特許情報を取得できませんでした";

/**
 * 引用文献1件分。押下時に `/api/patents/lookup` で公開番号から特許を取得し、
 * 成功したらその特許の詳細ページへ遷移する。失敗時はボタン直下にエラーを表示する。
 */
function CitedReferenceButton({ caseId, publicationNumber }: CitedReferenceButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleOpen() {
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/patents/lookup?publicationNumber=${encodeURIComponent(publicationNumber)}`,
        );
        if (!response.ok) {
          setError(CITED_REFERENCE_LOOKUP_ERROR_MESSAGE);
          return;
        }
        const json: unknown = await response.json();
        if (!isPatentLookupSuccessBody(json)) {
          setError(CITED_REFERENCE_LOOKUP_ERROR_MESSAGE);
          return;
        }
        router.push(`/cases/${caseId}/patents/${json.patentId}`);
      } catch {
        setError(CITED_REFERENCE_LOOKUP_ERROR_MESSAGE);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variant="secondary" size="sm" onPress={handleOpen} isDisabled={isPending}>
        {isPending ? (
          <>
            <Spinner size="sm" /> 確認中…
          </>
        ) : (
          publicationNumber
        )}
      </Button>
      {error && (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
    </div>
  );
}
