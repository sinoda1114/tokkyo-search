"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Chip, Heading, Paragraph } from "@heroui/react";
import { deleteSearchTerm } from "@/features/search-terms/actions";
import type { SearchTermsByType } from "@/features/search-terms/queries";
import { TERM_TYPE_LABELS, TERM_TYPE_ORDER } from "@/features/search-terms/term-type-labels";

interface TermListProps {
  termsByType: SearchTermsByType;
}

const DELETE_CONFIRM_MESSAGE =
  "この検索語を削除しますか？この語をもとにAI展開で追加された検索語も一緒に削除されます。";
const DELETE_ERROR_MESSAGE = "検索語の削除に失敗しました。もう一度お試しください。";

export function TermList({ termsByType }: TermListProps) {
  const router = useRouter();
  const hasAnyTerm = TERM_TYPE_ORDER.some((type) => termsByType[type].length > 0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete(caseId: string, termId: string) {
    if (!window.confirm(DELETE_CONFIRM_MESSAGE)) {
      return;
    }
    setError(null);
    setDeletingId(termId);
    startTransition(async () => {
      try {
        await deleteSearchTerm(caseId, termId);
        router.refresh();
      } catch {
        setError(DELETE_ERROR_MESSAGE);
      } finally {
        setDeletingId(null);
      }
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius)] border border-[var(--border)] p-4">
      <Heading level={2}>登録済み検索語</Heading>

      {!hasAnyTerm ? (
        <Paragraph color="muted">まだ検索語が登録されていません。</Paragraph>
      ) : (
        <div className="flex flex-col gap-4">
          {TERM_TYPE_ORDER.map((type) => {
            const terms = termsByType[type];
            if (terms.length === 0) {
              return null;
            }
            return (
              <div key={type} className="flex flex-col gap-2">
                <Paragraph size="sm" color="muted">
                  {TERM_TYPE_LABELS[type]}
                </Paragraph>
                <div className="flex flex-wrap gap-2">
                  {terms.map((term) => {
                    const isUserTerm = term.source === "user";
                    return (
                      <div key={term.id} className="flex items-center gap-1">
                        <Chip color={isUserTerm ? "default" : "accent"} size="sm">
                          {isUserTerm ? "" : "AI: "}
                          {term.text}
                        </Chip>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`${term.text}を削除`}
                          onPress={() => handleDelete(term.caseId, term.id)}
                          isDisabled={isPending && deletingId === term.id}
                        >
                          削除
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {error ? (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
    </section>
  );
}
