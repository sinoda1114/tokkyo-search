const NOT_AVAILABLE_TEXT = "未収録";

export interface AnalysisPatentInput {
  title: string;
  abstract: string | null;
  claims: string | null;
}

/**
 * 特許文献解析用のプロンプトを組み立てる。
 * 純粋関数（env・ネットワーク・DBに触れない）。
 */
export function buildAnalysisPrompt(patent: AnalysisPatentInput): string {
  const abstractText = patent.abstract ?? NOT_AVAILABLE_TEXT;
  const claimsText = patent.claims ?? NOT_AVAILABLE_TEXT;

  return `あなたは特許文献の内容を整理するアシスタントです。
以下の特許文献の本文から、記載されている内容のみを抽出してください。

タイトル: ${patent.title}

要約:
${abstractText}

請求項:
${claimsText}

抽出する項目:
- overview: 発明の概要
- background: 背景技術
- problem: 課題
- solution: 課題を解決するための手段
- effect: 発明の効果
- keyTerms: 特徴的な技術用語のリスト
- searchCandidates: 再検索に使える候補語（type と text の組）
- citedReferences: 本文中に記載された引用文献・参考文献のリスト

厳守事項:
- 提供された本文に明記されている内容のみを根拠とすること。本文から特定できない項目は null とすること（keyTerms・searchCandidates・citedReferences に該当がない場合は空配列とすること）。
- 特許性・新規性・進歩性の評価や断定を一切行わないこと。
- 本文に書かれていない内容を推測・補完しないこと。
- 出力は指定されたJSONスキーマのみとし、それ以外の説明文やコードブロックの記号（\`\`\`など）を一切含めないこと。
`;
}
