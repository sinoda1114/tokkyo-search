"use server";

import { fetchAndCacheClaims } from "./claims-service";

export interface LoadClaimsResult {
  claimsText: string | null;
}

/**
 * 特許詳細画面の「請求項を取得」ボタンから呼ばれるServer Action。
 * Client Componentから直接呼び出す想定（FormDataを介さずpatentIdを受け取る）。
 */
export async function loadClaims(patentId: string): Promise<LoadClaimsResult> {
  const claimsText = await fetchAndCacheClaims(patentId);
  return { claimsText };
}
