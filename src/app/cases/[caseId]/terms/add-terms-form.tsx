"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Heading, Label, Paragraph, TextArea, TextField } from "@heroui/react";
import { addSearchTerms } from "@/features/search-terms/actions";

interface AddTermsFormProps {
  caseId: string;
}

/** カンマ・読点・改行区切りの入力を検索語の配列に分割する。 */
function splitTerms(raw: string): string[] {
  return raw
    .split(/[,、\n]/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

export function AddTermsForm({ caseId }: AddTermsFormProps) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    const terms = splitTerms(value);
    if (terms.length === 0) {
      setMessage("検索語を入力してください。");
      return;
    }

    startTransition(async () => {
      const result = await addSearchTerms(caseId, terms);
      setMessage(
        result.insertedCount > 0
          ? `${result.insertedCount}件の検索語を登録しました。`
          : "入力された検索語はすでに登録済みでした。",
      );
      setValue("");
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius)] border border-[var(--border)] p-4">
      <Heading level={2}>検索語を登録</Heading>
      <Alert status="warning">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>入力前にご確認ください</Alert.Title>
          <Alert.Description>
            未公開発明の核心部分・秘密情報はこのシステムに入力しないでください。
          </Alert.Description>
        </Alert.Content>
      </Alert>

      <TextField value={value} onChange={setValue} aria-label="検索語">
        <Label>検索語（カンマ・読点・改行区切りで複数入力可）</Label>
        <TextArea rows={4} placeholder="例: 半導体, 放熱構造" />
      </TextField>

      {message ? <Paragraph color="muted">{message}</Paragraph> : null}

      <div className="flex justify-end">
        <Button type="button" variant="primary" onPress={handleSubmit} isDisabled={isPending}>
          {isPending ? "登録中..." : "検索語を登録"}
        </Button>
      </div>
    </section>
  );
}
