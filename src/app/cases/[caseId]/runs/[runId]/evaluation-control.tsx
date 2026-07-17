"use client";

import { useState, useTransition } from "react";
import { Alert, Button, Paragraph, TextArea, TextField } from "@heroui/react";
import { ratePatent } from "@/features/patents/evaluation-actions";
import { CASE_PATENT_STATUS_LABELS } from "@/features/patents/evaluation-options";
import type { CasePatentStatus } from "@/db/schema";

const SAVE_ERROR_MESSAGE = "評価の保存に失敗しました。もう一度お試しください。";
const REASON_REQUIRED_MESSAGE = "対象外理由を入力してください。";

export interface EvaluationControlProps {
  caseId: string;
  patentId: string;
  initialStatus: CasePatentStatus;
  initialComment?: string | null;
  initialExclusionReason?: string | null;
  /** trueの場合コメント入力欄も表示する（特許詳細画面向け）。検索結果一覧では省略してコンパクトに表示する。 */
  showComment?: boolean;
}

/**
 * 特許の評価（重要/参考/対象外）を選ぶコントロール。
 * `対象外`選択時は理由入力欄を表示し、理由が空のままでは保存できない
 * （`ratePatent` 側もZodでバリデーションするが、ここでは送信前にUIで防ぐ）。
 * 検索結果一覧・特許詳細画面の両方から使う想定。
 */
export function EvaluationControl({
  caseId,
  patentId,
  initialStatus,
  initialComment,
  initialExclusionReason,
  showComment = false,
}: EvaluationControlProps) {
  const [status, setStatus] = useState<CasePatentStatus>(initialStatus);
  const [comment, setComment] = useState(initialComment ?? "");
  const [commentDraft, setCommentDraft] = useState(initialComment ?? "");
  const [isEnteringReason, setIsEnteringReason] = useState(false);
  const [reasonDraft, setReasonDraft] = useState(initialExclusionReason ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(nextStatus: CasePatentStatus, options?: { exclusionReason?: string }) {
    setError(null);
    startTransition(async () => {
      try {
        await ratePatent({
          caseId,
          patentId,
          status: nextStatus,
          comment: comment || undefined,
          exclusionReason: options?.exclusionReason,
        });
        setStatus(nextStatus);
        setIsEnteringReason(false);
      } catch {
        setError(SAVE_ERROR_MESSAGE);
      }
    });
  }

  function handleSelectStatus(nextStatus: CasePatentStatus) {
    if (nextStatus === "excluded") {
      setError(null);
      setIsEnteringReason(true);
      return;
    }
    submit(nextStatus);
  }

  function handleConfirmExclusion() {
    const reason = reasonDraft.trim();
    if (!reason) {
      setError(REASON_REQUIRED_MESSAGE);
      return;
    }
    submit("excluded", { exclusionReason: reason });
  }

  function handleReset() {
    submit("unrated");
  }

  function handleCancelExclusion() {
    setError(null);
    setIsEnteringReason(false);
  }

  function handleSaveComment() {
    setError(null);
    startTransition(async () => {
      try {
        await ratePatent({
          caseId,
          patentId,
          status,
          comment: commentDraft || undefined,
          exclusionReason: status === "excluded" ? reasonDraft.trim() || undefined : undefined,
        });
        setComment(commentDraft);
      } catch {
        setError(SAVE_ERROR_MESSAGE);
      }
    });
  }

  const isReasonError = isEnteringReason && error === REASON_REQUIRED_MESSAGE;
  const isCommentUnchanged = commentDraft === comment;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Paragraph size="sm" color="muted">
          評価: {CASE_PATENT_STATUS_LABELS[status]}
        </Paragraph>
        <Button
          type="button"
          size="sm"
          variant={status === "important" ? "primary" : "outline"}
          aria-pressed={status === "important"}
          onPress={() => handleSelectStatus("important")}
          isDisabled={isPending}
        >
          重要
        </Button>
        <Button
          type="button"
          size="sm"
          variant={status === "reference" ? "primary" : "outline"}
          aria-pressed={status === "reference"}
          onPress={() => handleSelectStatus("reference")}
          isDisabled={isPending}
        >
          参考
        </Button>
        <Button
          type="button"
          size="sm"
          variant={status === "excluded" ? "danger" : "outline"}
          aria-pressed={status === "excluded"}
          onPress={() => handleSelectStatus("excluded")}
          isDisabled={isPending}
        >
          対象外
        </Button>
        {status !== "unrated" ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onPress={handleReset}
            isDisabled={isPending}
          >
            評価を解除
          </Button>
        ) : null}
      </div>

      {isEnteringReason ? (
        <div className="flex flex-col gap-2">
          <TextField
            value={reasonDraft}
            onChange={setReasonDraft}
            aria-label="対象外理由"
            isRequired
            isInvalid={Boolean(isReasonError)}
            aria-describedby={isReasonError ? "exclusion-reason-error" : undefined}
          >
            <TextArea rows={2} placeholder="対象外理由を入力してください" />
          </TextField>
          {isReasonError ? (
            <Alert id="exclusion-reason-error" status="danger">
              <Alert.Content>
                <Alert.Description>{error}</Alert.Description>
              </Alert.Content>
            </Alert>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onPress={handleCancelExclusion}
              isDisabled={isPending}
            >
              キャンセル
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onPress={handleConfirmExclusion}
              isDisabled={isPending}
            >
              {isPending ? "保存中…" : "対象外として保存"}
            </Button>
          </div>
        </div>
      ) : null}

      {showComment ? (
        <div className="flex flex-col gap-2">
          <TextField value={commentDraft} onChange={setCommentDraft} aria-label="評価コメント">
            <TextArea rows={2} placeholder="評価に関するコメント（任意）" />
          </TextField>
          <div className="flex items-center justify-end gap-2">
            {isCommentUnchanged && !isPending ? (
              <Paragraph size="xs" color="muted">
                変更がありません
              </Paragraph>
            ) : null}
            <Button
              type="button"
              variant="tertiary"
              size="sm"
              onPress={handleSaveComment}
              isDisabled={isPending || isCommentUnchanged}
            >
              コメントを保存
            </Button>
          </div>
        </div>
      ) : null}

      {error && !isReasonError ? (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
    </div>
  );
}
