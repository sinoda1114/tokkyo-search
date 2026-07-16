import { notFound } from "next/navigation";
import { Chip, Heading, Link, Paragraph } from "@heroui/react";
import { getCaseById } from "@/features/cases/queries";
import { getPatentById } from "@/features/patents/queries";
import { buildGooglePatentsUrl } from "@/features/patents/google-patents-link";
import { getAnalysisByPatentId } from "@/features/analysis/queries";
import { getCasePatentStatus } from "@/features/patents/evaluation-queries";
import { ClaimsSection } from "./claims-section";
import { AnalysisSection } from "./analysis-section";
import { EvaluationSection } from "./evaluation-section";

// 特許詳細は請求項キャッシュ更新等を反映するため force-dynamic（キャッシュしない）。
export const dynamic = "force-dynamic";

interface PatentDetailPageProps {
  params: Promise<{ caseId: string; patentId: string }>;
}

function formatList(values: string[] | null, emptyLabel: string): string {
  if (!values || values.length === 0) return emptyLabel;
  return values.join("、");
}

export default async function PatentDetailPage({ params }: PatentDetailPageProps) {
  const { caseId, patentId } = await params;

  const caseItem = await getCaseById(caseId);
  if (!caseItem) {
    notFound();
  }

  const patent = await getPatentById(patentId);
  if (!patent) {
    notFound();
  }

  const evaluation = await getCasePatentStatus(caseId, patent.id);
  const analysis = await getAnalysisByPatentId(patent.id);
  const initialAnalysis =
    analysis && analysis.status === "success" && analysis.result
      ? { status: "success" as const, result: analysis.result }
      : analysis && analysis.status === "error"
        ? { status: "error" as const, errorMessage: analysis.errorMessage ?? "解析に失敗しました" }
        : null;

  const googlePatentsUrl = buildGooglePatentsUrl(patent.publicationNumber);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Heading level={1}>{patent.title ?? "（名称不明）"}</Heading>
        <Paragraph color="muted">
          「{caseItem.name}」の特許詳細 ・ {patent.publicationNumber}
        </Paragraph>
      </div>

      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-[var(--muted,gray)]">公開番号</dt>
        <dd>{patent.publicationNumber}</dd>

        <dt className="text-[var(--muted,gray)]">出願番号</dt>
        <dd>{patent.applicationNumber ?? "出願番号不明"}</dd>

        <dt className="text-[var(--muted,gray)]">出願人</dt>
        <dd>{formatList(patent.assignees, "出願人不明")}</dd>

        <dt className="text-[var(--muted,gray)]">公開日</dt>
        <dd>{patent.publicationDate ?? "公開日不明"}</dd>

        <dt className="text-[var(--muted,gray)]">出願日</dt>
        <dd>{patent.filingDate ?? "出願日不明"}</dd>

        <dt className="text-[var(--muted,gray)]">IPCコード</dt>
        <dd>
          {patent.ipcCodes && patent.ipcCodes.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {patent.ipcCodes.map((code) => (
                <Chip key={code} size="sm">
                  {code}
                </Chip>
              ))}
            </div>
          ) : (
            "IPCコード未収録"
          )}
        </dd>

        <dt className="text-[var(--muted,gray)]">CPCコード</dt>
        <dd>
          {patent.cpcCodes && patent.cpcCodes.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {patent.cpcCodes.map((code) => (
                <Chip key={code} size="sm">
                  {code}
                </Chip>
              ))}
            </div>
          ) : (
            "CPCコード未収録"
          )}
        </dd>
      </dl>

      <section className="flex flex-col gap-2">
        <Heading level={2}>要約</Heading>
        <Paragraph>{patent.abstract ?? "要約未収録"}</Paragraph>
      </section>

      <section className="flex flex-col gap-2">
        <Heading level={2}>引用文献</Heading>
        {patent.citedPublications && patent.citedPublications.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {patent.citedPublications.map((publicationNumber) => (
              <li key={publicationNumber}>
                <Chip size="sm">{publicationNumber}</Chip>
              </li>
            ))}
          </ul>
        ) : (
          <Paragraph color="muted">引用文献はありません。</Paragraph>
        )}
      </section>

      <ClaimsSection patentId={patent.id} initialClaimsText={patent.claimsText} />

      <EvaluationSection
        caseId={caseId}
        patentId={patent.id}
        initialStatus={evaluation?.status ?? "unrated"}
        initialComment={evaluation?.comment}
        initialExclusionReason={evaluation?.exclusionReason}
      />

      <AnalysisSection caseId={caseId} patentId={patent.id} initialAnalysis={initialAnalysis} />

      <Link href={googlePatentsUrl} target="_blank" rel="noopener noreferrer">
        Google Patentsで開く
      </Link>
    </div>
  );
}
