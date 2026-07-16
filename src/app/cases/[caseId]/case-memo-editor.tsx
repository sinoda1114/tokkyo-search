"use client";

import { useState, useTransition } from "react";
import { Alert, Button, Heading, Paragraph, TextArea, TextField } from "@heroui/react";
import { updateCaseMemo } from "@/features/cases/actions";

interface CaseMemoEditorProps {
  caseId: string;
  initialMemo: string | null;
}

export function CaseMemoEditor({ caseId, initialMemo }: CaseMemoEditorProps) {
  const [memo, setMemo] = useState(initialMemo ?? "");
  const [draft, setDraft] = useState(initialMemo ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const result = await updateCaseMemo(caseId, draft);
      setMemo(result.memo ?? "");
      setDraft(result.memo ?? "");
      setIsEditing(false);
    });
  }

  function handleCancel() {
    setDraft(memo);
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
        <Paragraph>{memo || "メモはまだありません。"}</Paragraph>
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
              {isPending ? "保存中..." : "保存"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
