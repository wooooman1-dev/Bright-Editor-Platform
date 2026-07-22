import { describe, expect, it } from "vitest";

import type { ContentDocument } from "../../../../core/content";
import { QualityEngine } from "../../../../core/quality";

const keyword = "장내 마이크로바이옴 정신 건강";
const metaDescription = "장내 마이크로바이옴 정신 건강과 만성 염증의 관계, 식단 구성과 생활 속 관리 기준을 실제 본문 내용에 맞춰 설명합니다.";

function article(title: string): ContentDocument {
  return {
    id: "title-quality",
    title,
    metadata: {
      buttonCount: 0,
      createdAt: "now",
      generator: "test",
      imageCount: 0,
      language: "ko",
      readingTime: 1,
      source: "test",
      updatedAt: "now",
      version: 1,
      videoCount: 0,
      wordCount: 100,
      metaDescription,
    },
    blocks: [
      { id: "intro", type: "paragraph", text: `${keyword} 관련 핵심 원리와 식단 관리 기준을 설명합니다. 독자가 제목에서 기대한 내용을 본문에서 직접 확인할 수 있습니다.` },
    ],
  };
}

describe("QualityEngine SEO title readability", () => {
  it("penalizes long repeated-colon keyword-list titles", () => {
    const longTitle = "만성 염증 완화 식단 상세 실천 가이드: 장내 마이크로바이옴 정신 건강: 식이섬유·프로바이오틱스·프리바이오틱스·장건강 실천 가이드";
    const seo = new QualityEngine().review(article(longTitle), { primaryKeyword: keyword }).dimensions.find((item) => item.category === "seo");

    expect(longTitle.length).toBeGreaterThan(68);
    expect(seo?.score).toBeLessThan(85);
    expect(seo?.reasons).toContain("제목이 68자를 초과해 핵심 내용을 빠르게 파악하기 어렵습니다.");
    expect(seo?.reasons).toContain("제목에 콜론이 두 번 이상 사용되어 문장 구조가 복잡합니다.");
    expect(seo?.reasons).toContain("제목에 키워드가 나열되어 자연스러운 문장 가독성이 떨어집니다.");
    expect(seo?.evidence).toContainEqual({ signal: "titleColonCount", value: 2 });
  });

  it("keeps a concise one-colon title at the full SEO score", () => {
    const seo = new QualityEngine().review(article(`${keyword}: 만성 염증 완화 식단 가이드`), { primaryKeyword: keyword }).dimensions.find((item) => item.category === "seo");

    expect(seo?.score).toBe(100);
    expect(seo?.reasons).toContain("모든 정의된 검사 기준을 통과했습니다.");
  });
});
