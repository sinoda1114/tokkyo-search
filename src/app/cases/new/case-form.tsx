"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  Alert,
  Button,
  FieldError,
  Form,
  Input,
  Label,
  TextArea,
  TextField,
} from "@heroui/react";
import { createCase, type CreateCaseFormState } from "@/features/cases/actions";

const initialState: CreateCaseFormState = {};

export function CaseForm() {
  const [state, formAction, pending] = useActionState(createCase, initialState);

  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const referenceNumberRef = useRef<HTMLInputElement>(null);
  const technicalFieldRef = useRef<HTMLInputElement>(null);
  const memoRef = useRef<HTMLTextAreaElement>(null);

  // 送信失敗時、最初にエラーがあるフィールドへフォーカスを移動する
  useEffect(() => {
    if (!state.errors) return;

    if (state.errors.name) {
      nameRef.current?.focus();
    } else if (state.errors.referenceNumber) {
      referenceNumberRef.current?.focus();
    } else if (state.errors.technicalField) {
      technicalFieldRef.current?.focus();
    } else if (state.errors.memo) {
      memoRef.current?.focus();
    }
  }, [state]);

  // 未保存の変更がある状態でのページ離脱に確認ダイアログを出す
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const form = formRef.current;
      if (!form) return;

      const data = new FormData(form);
      const isDirty = ["name", "referenceNumber", "technicalField", "memo"].some(
        (key) => (data.get(key) ?? "") !== "",
      );

      if (isDirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  return (
    <Form ref={formRef} action={formAction} className="flex flex-col gap-6">
      <Alert status="warning">
        <Alert.Content>
          <Alert.Title>入力時の注意</Alert.Title>
          <Alert.Description>
            未公開発明の核心部分・秘密情報はこのシステムに入力しないでください。
          </Alert.Description>
        </Alert.Content>
      </Alert>

      <TextField
        name="name"
        isRequired
        isInvalid={Boolean(state.errors?.name)}
        defaultValue={state.values?.name}
      >
        <Label>案件名</Label>
        <Input ref={nameRef} placeholder="例: 半導体パッケージ構造の先行技術調査" />
        {state.errors?.name ? <FieldError>{state.errors.name[0]}</FieldError> : null}
      </TextField>

      <TextField
        name="referenceNumber"
        isInvalid={Boolean(state.errors?.referenceNumber)}
        defaultValue={state.values?.referenceNumber}
      >
        <Label>管理番号</Label>
        <Input ref={referenceNumberRef} placeholder="例: 2026-001" />
        {state.errors?.referenceNumber ? (
          <FieldError>{state.errors.referenceNumber[0]}</FieldError>
        ) : null}
      </TextField>

      <TextField
        name="technicalField"
        isInvalid={Boolean(state.errors?.technicalField)}
        defaultValue={state.values?.technicalField}
      >
        <Label>技術分野</Label>
        <Input ref={technicalFieldRef} placeholder="例: 画像処理" />
        {state.errors?.technicalField ? (
          <FieldError>{state.errors.technicalField[0]}</FieldError>
        ) : null}
      </TextField>

      <TextField name="memo" isInvalid={Boolean(state.errors?.memo)} defaultValue={state.values?.memo}>
        <Label>メモ</Label>
        <TextArea
          ref={memoRef}
          rows={5}
          placeholder="案件の背景や検索方針など（秘密情報は入力しないこと）"
        />
        {state.errors?.memo ? <FieldError>{state.errors.memo[0]}</FieldError> : null}
      </TextField>

      <div className="flex justify-end gap-3">
        <Button type="submit" variant="primary" isDisabled={pending}>
          {pending ? "作成中…" : "案件を作成"}
        </Button>
      </div>
    </Form>
  );
}
