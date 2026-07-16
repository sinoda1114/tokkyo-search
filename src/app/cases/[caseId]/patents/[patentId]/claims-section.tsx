"use client";

import { useState, useTransition } from "react";
import { Alert, Button, Heading, Paragraph, Spinner } from "@heroui/react";
import { loadClaims } from "@/features/patents/actions";

interface ClaimsSectionProps {
  patentId: string;
  initialClaimsText: string | null;
}

/**
 * 請求項セクション。
 * `claimsText` が未取得の場合はボタンを表示し、押下時にServer Action経由で
 * BigQueryから請求項全文を取得する（取得成功時はDB側にもキャッシュされる）。
 */
export function ClaimsSection({ patentId, initialClaimsText }: ClaimsSectionProps) {
  const [claimsText, setClaimsText] = useState(initialClaimsText);
  const [hasFetched, setHasFetched] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleFetchClaims() {
    startTransition(async () => {
      const result = await loadClaims(patentId);
      setClaimsText(result.claimsText);
      setHasFetched(true);
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius)] border border-[var(--border)] p-4">
      <Heading level={2}>請求項</Heading>

      {claimsText ? (
        <Paragraph className="whitespace-pre-wrap">{claimsText}</Paragraph>
      ) : isPending ? (
        <div className="flex items-center gap-2">
          <Spinner size="sm" />
          <Paragraph color="muted">請求項を取得しています...</Paragraph>
        </div>
      ) : hasFetched ? (
        <Alert status="warning">
          <Alert.Content>
            <Alert.Description>請求項データが見つかりませんでした。</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : (
        <Button type="button" variant="secondary" size="sm" onPress={handleFetchClaims}>
          請求項を取得
        </Button>
      )}
    </section>
  );
}
