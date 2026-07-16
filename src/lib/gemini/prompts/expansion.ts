/**
 * 検索語展開用のプロンプトを組み立てる。
 * 純粋関数（env・ネットワーク・DBに触れない）。
 */
export function buildExpansionPrompt(terms: string[], technicalField?: string): string {
  const termList = terms.map((term) => `- ${term}`).join("\n");
  const fieldLine = technicalField ? `技術分野: ${technicalField}` : "技術分野: 指定なし";

  return `あなたは特許調査を支援する検索語展開アシスタントです。
以下の入力語それぞれについて、特許検索に使える関連語を提案してください。

${fieldLine}
入力語:
${termList}

提案する語のタイプ（各タイプごとに提案してよい。該当がなければ提案しなくてよい）:
- synonym: 類義語
- broader: 上位概念
- narrower: 下位概念
- material: 材質
- function: 機能
- effect: 効果
- english: 英語表現

厳守事項:
- 入力語から直接導ける語のみを生成すること。発明の内容や意図を推測しないこと。
- 各タイプにつき最大5語までとすること。
- 存在が疑わしい専門用語を創作しないこと。実在が確認できない語は出力しないこと。
- 各提案語について、どの入力語から派生したかを "sourceTerm" フィールドに明記すること。
- 出力は指定されたJSONスキーマのみとし、それ以外の説明文やコードブロックの記号（\`\`\`など）を一切含めないこと。
`;
}
