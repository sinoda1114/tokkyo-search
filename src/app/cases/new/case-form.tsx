"use client";

import { useActionState } from "react";
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

  return (
    <Form action={formAction} className="flex flex-col gap-6">
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
        <Input placeholder="例: 半導体パッケージ構造の先行技術調査" />
        {state.errors?.name ? <FieldError>{state.errors.name[0]}</FieldError> : null}
      </TextField>

      <TextField
        name="referenceNumber"
        isInvalid={Boolean(state.errors?.referenceNumber)}
        defaultValue={state.values?.referenceNumber}
      >
        <Label>管理番号</Label>
        <Input placeholder="例: 2026-001" />
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
        <Input placeholder="例: 画像処理" />
        {state.errors?.technicalField ? (
          <FieldError>{state.errors.technicalField[0]}</FieldError>
        ) : null}
      </TextField>

      <TextField name="memo" isInvalid={Boolean(state.errors?.memo)} defaultValue={state.values?.memo}>
        <Label>メモ</Label>
        <TextArea rows={5} placeholder="案件の背景や検索方針など（秘密情報は入力しないこと）" />
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
