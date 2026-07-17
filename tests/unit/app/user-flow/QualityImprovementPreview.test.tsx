import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { QualityImprovementPreview } from "../../../../app/user-flow/QualityImprovementPreview";
import type { ContentDocument } from "../../../../core/content";
import type { QualityCategory, QualityDimensionResult, QualityReport } from "../../../../core/quality";

const categories: readonly QualityCategory[] = ["searchIntent", "seo", "readability", "structure", "completeness", "usefulness", "htmlQuality", "imageStrategy", "internalLinks", "cta"];
const weights = Object.fromEntries(categories.map((category) => [category, 10])) as Record<QualityCategory, number>;
const document: ContentDocument = { id: "c", title: "장 건강 가이드", blocks: [{ id: "p", type: "paragraph", text: "본문" }] };

function report(overallScore: number, approved: boolean, scores: Partial<Record<QualityCategory, number>>): QualityReport {
  const dimensions = categories.map((category): QualityDimensionResult => ({
    category,
    score: scores[category] ?? 100,
    status: (scores[category] ?? 100) >= (category === "searchIntent" || category === "seo" || category === "readability" || category === "completeness" ? 95 : 80) ? "ready" : "needs_improvement",
    evaluation: "evaluated",
    reasons: [],
    tasks: [],
    evidence: [],
  }));
  return {
    approved,
    approvalState: approved ? "approved" : "improvement_required",
    findings: [],
    overallScore,
    reviews: dimensions,
    dimensions,
    tasks: [],
    reviewedAt: "2026-07-17T00:00:00.000Z",
    reviewedRevisionId: "rev-test",
    weights,
  };
}

describe("QualityImprovementPreview", () => {
  it("shows current and candidate scores and blocks an under-target candidate", () => {
    const html = renderToStaticMarkup(<QualityImprovementPreview baseline={report(92, false, { seo: 55, readability: 77 })} candidate={report(95, false, { seo: 65, readability: 96 })} document={document} improvementAccepted onApply={vi.fn()} onCancel={vi.fn()} />);
    expect(html).toContain("현재 점수");
    expect(html).toContain("개선안 점수");
    expect(html).toContain("SEO");
    expect(html).toContain("55");
    expect(html).toContain("65");
    expect(html).toContain("품질 승인 기준 미달");
    expect(html).toContain('disabled=""');
  });

  it("enables applying an approved candidate", () => {
    const html = renderToStaticMarkup(<QualityImprovementPreview baseline={report(92, false, { seo: 55 })} candidate={report(98, true, { seo: 95 })} document={document} improvementAccepted onApply={vi.fn()} onCancel={vi.fn()} />);
    expect(html).toContain("품질 승인 기준 충족");
    expect(html).toContain(">개선안 적용</button>");
    expect(html).not.toContain('disabled="">개선안 적용');
  });

  it("shows and blocks a generated candidate that did not improve the current document", () => {
    const html = renderToStaticMarkup(<QualityImprovementPreview baseline={report(95, false, { seo: 65 })} candidate={report(95, false, { seo: 65 })} document={document} improvementAccepted={false} rejectionReasons={["전체 점수가 상승하지 않았습니다. 95 → 95"]} onApply={vi.fn()} onCancel={vi.fn()} />);
    expect(html).toContain("현재 원고보다 개선되지 않음");
    expect(html).toContain("전체 점수가 상승하지 않았습니다");
    expect(html).toContain('disabled=""');
  });
});
