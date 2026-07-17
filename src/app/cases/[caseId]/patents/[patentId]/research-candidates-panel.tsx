"use client";

import { useState, useTransition } from "react";
import { Alert, Button, Checkbox, Heading, Label, Link, Paragraph } from "@heroui/react";
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
    {
      label: "引用文献",
      items: analysis.citedReferences.map((text, index) => ({
        key: `citedReference:${index}`,
        text,
        termType: "synonym",
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

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );
  const [isSaving, startSaveTransition] = useTransition();

  if (allItems.length === 0) {
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
    </section>
  );
}
