import { describe, expect, it } from "vitest";

import {
  approvalEvidenceContainsScalar,
  approvalEvidenceScalarHaystack,
} from "../../../../core/approval/ApprovalEvidenceScalarPresence";
import type { ContentDocument } from "../../../../core/content";

/** 2026-08-28 근로장려금 원고에 실제로 붙었던 국세청 발췌. */
const nationalTaxExcerpt = [
  "신청기간 - 구분, 대상자, 산정대상, 신청시기 포함",
  "선택 | 정기신청 | 근로 · 사업 · 종교인 소득자 | ’25년 연간 소득 | ’26.5.1.~6.1.",
  "반기신청 | 근로소득자 | ’26년 상반기 소득 | ’26.9.1~9.15.",
  "’26년 하반기 소득 | ’27.3.1.~3.15.",
  "기한 후 신청 기간은 ’26.6.2.~12.1.입니다.",
  "총소득기준금액 | 2,200만 원 미만 | 3,200만 원 미만 | 4,400만 원 미만",
  "2025년 6월 1일 현재, 가구원 모두가 소유하고 있는 주택·토지·건물·예금 등 재산 합계액이 2.4억원 미만",
].join("\n");

function documentWithEvidence(excerpt: string): ContentDocument {
  return {
    id: "content-1",
    title: "근로장려금 신청 조건",
    blocks: [{ id: "p", type: "paragraph", text: "본문" }],
    metadata: {
      approvalEvidence: {
        version: "1.0",
        status: "verified",
        sources: [{
          sourceId: "nts",
          url: "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=238977",
          citationExcerpt: excerpt,
        }],
      },
    },
  } as unknown as ContentDocument;
}

describe("approval evidence scalar presence", () => {
  const haystack = approvalEvidenceScalarHaystack(documentWithEvidence(nationalTaxExcerpt));

  it.each([
    "2,200만",
    "2.4억",
    "2025년 6월 1일",
  ])("finds a value written the same way in the excerpt: %s", (value) => {
    expect(approvalEvidenceContainsScalar(haystack, value)).toBe(true);
  });

  /**
   * 국세청은 ’26.5.1. 로 쓰고 원고는 2026년 5월 1일 로 푼다. 같은 날짜인데
   * 글자가 겹치지 않아 그대로 비교하면 전부 경고가 된다.
   */
  it.each([
    "2026년 5월 1일",
    "2026년 9월 1일",
    "2027년 3월 1일",
    "2026년 6월 2일",
  ])("finds a date the government wrote in the abbreviated form: %s", (value) => {
    expect(approvalEvidenceContainsScalar(haystack, value)).toBe(true);
  });

  /** ’26.9.1~9.15. 의 뒤쪽은 연도와 월이 생략되어 있다. */
  it("finds the tail of an abbreviated date range", () => {
    expect(approvalEvidenceContainsScalar(haystack, "2026년 9월 15일")).toBe(true);
    expect(approvalEvidenceContainsScalar(haystack, "15일")).toBe(true);
  });

  it("still reports a value that appears nowhere in the excerpt", () => {
    expect(approvalEvidenceContainsScalar(haystack, "7,700만")).toBe(false);
    expect(approvalEvidenceContainsScalar(haystack, "2031년 4월 9일")).toBe(false);
  });

  /** 발췌가 없으면 비교할 근거가 없으므로 걸러내지 않는다. */
  it("filters nothing when the document carries no stored excerpt", () => {
    const empty = approvalEvidenceScalarHaystack(documentWithEvidence(""));
    expect(empty).toBe("");
    expect(approvalEvidenceContainsScalar(empty, "2,200만")).toBe(false);
  });
});
