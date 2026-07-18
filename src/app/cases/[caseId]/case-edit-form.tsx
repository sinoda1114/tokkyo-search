"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Alert, Button, Heading, Input, Label, TextField } from "@heroui/react";
import { deleteCase, updateCase } from "@/features/cases/actions";

interface CaseEditFormProps {
  caseId: string;
  initialName: string;
  initialReferenceNumber: string | null;
  initialTechnicalField: string | null;
}

/** redirect()が投げる特殊なエラー（NEXT_REDIRECT）かどうかを判定する。 */
function isRedirectError(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "案件情報の保存に失敗しました。";
  }
  return error instanceof Error ? error.message : "案件情報の保存に失敗しました。";
}

/**
 * 案件名・管理番号・技術分野のインライン編集フォームと、案件削除ボタンを提供する。
 * `case-memo-editor.tsx` の表示/編集切り替えパターンを踏襲する。
 */
export function CaseEditForm({
  caseId,
  initialName,
  initialReferenceNumber,
  initialTechnicalField,
}: CaseEditFormProps) {
  const router = useRouter();

  const [name, setName] = useState(initialName);
  const [referenceNumber, setReferenceNumber] = useState(initialReferenceNumber ?? "");
  const [technicalField, setTechnicalField] = useState(initialTechnicalField ?? "");

  const [draftName, setDraftName] = useState(initialName);
  const [draftReferenceNumber, setDraftReferenceNumber] = useState(initialReferenceNumber ?? "");
  const [draftTechnicalField, setDraftTechnicalField] = useState(initialTechnicalField ?? "");

  const [isEditing, setIsEditing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, startSaveTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();

  function handleEdit() {
    setDraftName(name);
    setDraftReferenceNumber(referenceNumber);
    setDraftTechnicalField(technicalField);
    setErrorMessage(null);
    setIsEditing(true);
  }

  function handleCancel() {
    setErrorMessage(null);
    setIsEditing(false);
  }

  function handleSave() {
    setErrorMessage(null);
    startSaveTransition(async () => {
      try {
        await updateCase(caseId, {
          name: draftName,
          referenceNumber: draftReferenceNumber,
          technicalField: draftTechnicalField,
        });
        setName(draftName.trim());
        setReferenceNumber(draftReferenceNumber.trim());
        setTechnicalField(draftTechnicalField.trim());
        setIsEditing(false);
        router.refresh();
      } catch (error: unknown) {
        setErrorMessage(extractErrorMessage(error));
      }
    });
  }

  function handleDelete() {
    const confirmed = window.confirm(
      `案件「${name}」を削除します。検索語・検索実行履歴・評価などの関連データもすべて削除され、元に戻せません。よろしいですか？`,
    );
    if (!confirmed) {
      return;
    }

    setErrorMessage(null);
    startDeleteTransition(async () => {
      try {
        await deleteCase(caseId);
      } catch (error: unknown) {
        // deleteCase は成功時 redirect() を呼ぶため、正常系でもこの例外（NEXT_REDIRECT）を通る。
        if (isRedirectError(error)) {
          router.push("/cases");
          return;
        }
        setErrorMessage(extractErrorMessage(error));
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {!isEditing ? (
            <>
              <Heading level={1} className="text-balance">
                {name}
              </Heading>
              <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
                <dt className="text-[var(--muted,gray)]">管理番号</dt>
                <dd className="text-pretty">{referenceNumber || "未設定"}</dd>
                <dt className="text-[var(--muted,gray)]">技術分野</dt>
                <dd className="text-pretty">{technicalField || "未設定"}</dd>
              </dl>
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <TextField
                value={draftName}
                onChange={setDraftName}
                aria-label="案件名"
                isRequired
              >
                <Label>案件名</Label>
                <Input />
              </TextField>
              <TextField
                value={draftReferenceNumber}
                onChange={setDraftReferenceNumber}
                aria-label="管理番号"
              >
                <Label>管理番号</Label>
                <Input />
              </TextField>
              <TextField
                value={draftTechnicalField}
                onChange={setDraftTechnicalField}
                aria-label="技術分野"
              >
                <Label>技術分野</Label>
                <Input />
              </TextField>
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-2">
          {!isEditing ? (
            <Button type="button" variant="tertiary" size="sm" onPress={handleEdit}>
              編集
            </Button>
          ) : null}
          <Button
            type="button"
            variant="danger"
            size="sm"
            onPress={handleDelete}
            isDisabled={isDeleting || isEditing}
          >
            {isDeleting ? "削除中…" : "案件を削除"}
          </Button>
        </div>
      </div>

      {errorMessage ? (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Title>案件情報を保存できませんでした</Alert.Title>
            <Alert.Description>{errorMessage}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      {isEditing ? (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onPress={handleCancel}
            isDisabled={isSaving}
          >
            キャンセル
          </Button>
          <Button type="button" variant="primary" size="sm" onPress={handleSave} isDisabled={isSaving}>
            {isSaving ? "保存中…" : "保存"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
