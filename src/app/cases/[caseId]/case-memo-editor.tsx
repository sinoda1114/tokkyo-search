"use client";

import { useEffect, useState, useTransition } from "react";
import { z } from "zod";
import { Alert, Button, Heading, Paragraph, TextArea, TextField } from "@heroui/react";
import { updateCaseMemo } from "@/features/cases/actions";

interface CaseMemoEditorProps {
  caseId: string;
  initialMemo: string | null;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "メモの保存に失敗しました。";
  }
  return error instanceof Error ? error.message : "メモの保存に失敗しました。";
}

export function CaseMemoEditor({ caseId, initialMemo }: CaseMemoEditorProps) {
  const [memo, setMemo] = useState(initialMemo ?? "");
  const [draft, setDraft] = useState(initialMemo ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isEditing || draft === memo) {
      return;
    }
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isEditing, draft, memo]);

  function handleSave() {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const result = await updateCaseMemo(caseId, draft);
        setMemo(result.memo ?? "");
        setDraft(result.memo ?? "");
        setIsEditing(false);
      } catch (error: unknown) {
        setErrorMessage(extractErrorMessage(error));
      }
    });
  }

  function handleCancel() {
    setDraft(memo);
    setErrorMessage(null);
    setIsEditing(false);
  }

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius)] border border-[var(--border)] p-4">
      <div className="flex items-center justify-between">
        <Heading level={2}>メモ</Heading>
        {!isEditing ? (
          <Button type="button" variant="tertiary" size="sm" onPress={() => setIsEditing(true)}>
            編集
          </Button>
        ) : null}
      </div>

      {!isEditing ? (
        <Paragraph className="whitespace-pre-wrap">{memo || "メモはまだありません。"}</Paragraph>
      ) : (
        <div className="flex flex-col gap-3">
          <Alert status="warning">
            <Alert.Content>
              <Alert.Description>
                未公開発明の核心部分・秘密情報は入力しないでください。
              </Alert.Description>
            </Alert.Content>
          </Alert>
          <TextField value={draft} onChange={setDraft} aria-label="メモ">
            <TextArea rows={6} />
          </TextField>
          {errorMessage ? (
            <Alert status="danger">
              <Alert.Content>
                <Alert.Title>メモを保存できませんでした</Alert.Title>
                <Alert.Description>{errorMessage}</Alert.Description>
              </Alert.Content>
            </Alert>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onPress={handleCancel}
              isDisabled={isPending}
            >
              キャンセル
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onPress={handleSave}
              isDisabled={isPending}
            >
              {isPending ? "保存中…" : "保存"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
