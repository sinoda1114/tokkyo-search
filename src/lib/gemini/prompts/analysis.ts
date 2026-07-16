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

searchCandidates の作成ルール（厳守）:
- text は特許検索の検索語として使える**単語・短いフレーズのみ**とし、20文字以内を目安とすること。文や節（「〜を提供する」「〜と、〜とを備え」等）をそのまま抜き出さないこと。
- type は次のいずれかとすること: synonym（類義語）, broader（上位概念）, narrower（下位概念）, material（材質）, function（機能）, effect（効果）, english（英語表現）。
- overview・problem・solution 等の項目名や文章全体を type・text にそのまま転記しないこと。

厳守事項:
- 提供された本文に明記されている内容のみを根拠とすること。本文から特定できない項目は null とすること（keyTerms・searchCandidates・citedReferences に該当がない場合は空配列とすること）。
- 特許性・新規性・進歩性の評価や断定を一切行わないこと。
- 本文に書かれていない内容を推測・補完しないこと。
- 出力は指定されたJSONスキーマのみとし、それ以外の説明文やコードブロックの記号（\`\`\`など）を一切含めないこと。
`;
}
