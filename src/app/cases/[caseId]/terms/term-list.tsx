import { Chip, Heading, Paragraph } from "@heroui/react";
import type { SearchTermsByType } from "@/features/search-terms/queries";
import { TERM_TYPE_LABELS, TERM_TYPE_ORDER } from "@/features/search-terms/term-type-labels";

interface TermListProps {
  termsByType: SearchTermsByType;
}

export function TermList({ termsByType }: TermListProps) {
  const hasAnyTerm = TERM_TYPE_ORDER.some((type) => termsByType[type].length > 0);

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
                      <Chip key={term.id} color={isUserTerm ? "default" : "accent"} size="sm">
                        {isUserTerm ? "" : "AI: "}
                        {term.text}
                      </Chip>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
