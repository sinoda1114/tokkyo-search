/** Gemini APIへのリクエスト自体が失敗した場合（ネットワークエラー・レート制限超過・5xx等）に投げる。 */
export class GeminiRequestError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "GeminiRequestError";
  }
}

/** Geminiのレスポンスが期待するJSONスキーマに従わなかった場合（リトライ後も含む）に投げる。 */
export class GeminiValidationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "GeminiValidationError";
  }
}
