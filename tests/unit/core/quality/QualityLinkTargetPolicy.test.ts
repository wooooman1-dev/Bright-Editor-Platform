import { describe, expect, it } from "vitest";

import type { ContentDocument } from "../../../../core/content";
import { QualityEngine } from "../../../../core/quality";

function documentWith(block: Readonly<Record<string, unknown>>): ContentDocument {
  return {
    id: "link-target",
    title: "예금 적금 비교 방법",
    blocks: [
      { id: "p", type: "paragraph", text: "예금과 적금을 비교하는 기준을 정리합니다." },
      block,
    ],
  } as unknown as ContentDocument;
}

function targetPolicyViolations(document: ContentDocument, platform: string): number {
  const report = new QualityEngine().review(document, { platform, primaryKeyword: "예금 적금 비교", searchIntent: "예금 적금 비교" });
  const evidence = report.dimensions
    .find((item) => item.category === "htmlQuality")
    ?.evidence.find((item) => item.signal === "targetPolicyViolations");
  return Number(evidence?.value ?? -1);
}

describe("quality link target policy", () => {
  it("treats an absolute self-site internal link as internal on WordPress", () => {
    const document = documentWith({
      id: "auto-internal-link",
      type: "button",
      purpose: "internal_link",
      label: "적금 우대금리 조건 확인 방법",
      targetUrl: "https://brightjaetech.kr/적금-우대금리-조건-확인-방법/",
      target: "_self",
    });

    expect(targetPolicyViolations(document, "wordpress")).toBe(0);
  });

  it("treats an absolute self-site related post as internal on WordPress", () => {
    const document = documentWith({
      id: "auto-related-post",
      type: "button",
      purpose: "related_post",
      label: "신용카드 명세서 보는 방법",
      targetUrl: "https://brightjaetech.kr/신용카드-명세서-보는-방법/",
      target: "_self",
    });

    expect(targetPolicyViolations(document, "wordpress")).toBe(0);
  });

  it("still flags an internal link that opens in a new tab", () => {
    const document = documentWith({
      id: "auto-internal-link",
      type: "button",
      purpose: "internal_link",
      label: "관련 안내",
      targetUrl: "https://brightjaetech.kr/관련-안내/",
      target: "_blank",
    });

    expect(targetPolicyViolations(document, "wordpress")).toBe(1);
  });

  it("still flags an external CTA that opens in the same tab", () => {
    const document = documentWith({
      id: "cta",
      type: "button",
      purpose: "cta",
      label: "공식 안내 보기",
      targetUrl: "https://www.fss.or.kr/guide",
      target: "_self",
    });

    expect(targetPolicyViolations(document, "wordpress")).toBe(1);
  });

  it("keeps the existing Tistory entry behaviour unchanged", () => {
    const document = documentWith({
      id: "auto-related-post",
      type: "button",
      purpose: "related_post",
      label: "관련 글",
      targetUrl: "https://bright-health.tistory.com/entry/related-1",
      target: "_self",
    });

    expect(targetPolicyViolations(document, "tistory")).toBe(0);
  });
});
