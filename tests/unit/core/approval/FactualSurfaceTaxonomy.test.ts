import { describe, expect, it } from "vitest";

import {
  classifyFactualSurface,
  factualSurfaceCandidates,
  requiresExternalEvidence,
  statesAValue,
} from "../../../../core/approval";
import type { ContentDocument } from "../../../../core/content";

function document(blocks: ContentDocument["blocks"]): ContentDocument {
  return {
    id: "content-1",
    title: "생활비 관리 방법",
    blocks,
    metadata: {
      buttonCount: 0, createdAt: "2026-08-14T00:00:00.000Z", generator: "test", imageCount: 0,
      language: "ko", readingTime: 1, source: "test", updatedAt: "2026-08-14T00:00:00.000Z",
      version: 1, videoCount: 0, wordCount: 20,
    },
  };
}

const paragraph = (id: string, text: string) => ({ id, type: "paragraph" as const, text });
const heading = (id: string, text: string) => ({ id, type: "heading" as const, level: 2 as const, text });

describe("FactualSurfaceTaxonomy — naming a condition is not asserting its value", () => {
  /**
   * The 39 of 48 withdrawn surfaces that carried no value at all. Every one of
   * these was deleted from a published manuscript by `criticalSurfacePattern`,
   * which matched the vocabulary of the subject rather than a claim about it.
   */
  it("classifies value-free wording as editorial frame", () => {
    for (const surface of [
      "예금 적금 비교 방법을 금리만이 아닌 목돈 여부, 월 저축 계획, 사용 예정일, 중도해지 조건으로 정리합니다.",
      "기본 조건과 우대 조건을 분리해 기록한다",
      "우대 조건을 충족하기 위해 새로 해야 하는 거래가 무엇인지 적습니다.",
      "가장 주의할 점은 예상액을 확정된 지급액으로 사용하지 않는 것입니다.",
      "후보 상품을 정한 뒤에는 금융회사 공식 상품설명서와 가입 화면을 기준으로 최종 조건을 다시 확인해야 합니다.",
      "신청 자격은 공고문에서 직접 확인하세요.",
    ]) {
      expect(classifyFactualSurface(surface), surface).toBe("editorial_frame");
    }
  });

  it("classifies an attributed value as an external fact", () => {
    for (const surface of [
      "적용 금리는 12.5%입니다.",
      "주거 지원 기간은 24개월입니다.",
      "계약 기간은 24개월로 정해져 있습니다.",
      "전입신고는 14일 이내에 해야 합니다.",
      "이 지원금은 매월 350,000원이 지급됩니다.",
      "신청 조건은 만 19세 이상이다.",
    ]) {
      expect(classifyFactualSurface(surface), surface).toBe("external_fact");
      expect(requiresExternalEvidence(classifyFactualSurface(surface))).toBe(true);
    }
  });

  /**
   * No institution publishes "최근 1년". Requiring a source for it is a demand
   * nothing can satisfy, and two finished articles scoring 100 sat blocked on
   * `1년` and `2년` for exactly that reason.
   */
  it("suppresses a recency window the reader is asked to look back over", () => {
    for (const surface of [
      "최근 1년 동안 발생한 소득을 유형별로 적습니다.",
      "최근 3개월 사용 내역 기록하기",
      "지난 6개월 사용량을 한곳에 모으세요.",
    ]) {
      expect(classifyFactualSurface(surface), surface).toBe("editorial_frame");
    }
    // A threshold cancels it: an eligibility period is a published rule.
    expect(classifyFactualSurface("최근 6개월 이내에 폐업한 사업자만 신청할 수 있습니다."))
      .toBe("external_fact");
  });

  it("keeps the 정보 기준일 line out of classification entirely", () => {
    expect(classifyFactualSurface("정보 기준일: 2026-08-14")).toBe("publication_meta");
    expect(classifyFactualSurface("최종 검토일: 2026년 8월 14일")).toBe("publication_meta");
    expect(statesAValue("publication_meta")).toBe(false);
  });

  /**
   * The subject has to sit next to the value. Accepting it anywhere in the
   * sentence read this as a statutory claim because `해지 조건` appears twenty
   * characters after `1년 안에`, when it is the reader's own judgement call.
   */
  it("does not attribute a value to a subject that merely appears later", () => {
    expect(classifyFactualSurface(
      "보유 목돈이 있어도 1년 안에 쓸 가능성이 크다면 장기간 묶는 선택보다 사용일과 해지 조건을 우선 점검해야 합니다.",
    )).toBe("unattributed_value");
    expect(requiresExternalEvidence("unattributed_value")).toBe(false);
    expect(statesAValue("unattributed_value")).toBe(true);
  });
});

describe("FactualSurfaceTaxonomy — a table cell cannot carry its own subject", () => {
  it("reads the caption, column header and row label as the cell's attribution", () => {
    expect(classifyFactualSurface("500,000원")).toBe("unattributed_value");
    expect(classifyFactualSurface("500,000원", { attribution: ["방식별 비교", "월 이자", "만기일시상환"] }))
      .toBe("external_fact");
  });

  it("attributes measured cells through the document walk", () => {
    const candidates = factualSurfaceCandidates(document([
      heading("h", "상환방식 비교"),
      {
        id: "t", type: "table" as const,
        headers: ["방식", "월 납입액"],
        rows: [["원리금균등상환", "1,032,797원"]],
      },
    ]));
    const cell = candidates.find((item) => item.surface === "1,032,797원");
    expect(cell?.classification).toBe("external_fact");
  });
});

describe("FactualSurfaceTaxonomy — disclosed assumptions", () => {
  const disclosure = "아래 계산 예시는 대출원금 1,200만 원, 연 6% 고정금리, 12개월이라는 가정만 놓고 산출했습니다. 수수료와 금리 변동은 반영하지 않았으므로 계약상 청구액을 대신하지 않습니다.";

  it("treats figures in a section that states its assumptions as illustrative", () => {
    const candidates = factualSurfaceCandidates(document([
      heading("h", "상환방식 비교"),
      paragraph("p", disclosure),
      { id: "t", type: "table" as const, headers: ["방식", "월 납입액"], rows: [["만기일시상환", "60,000원"]] },
    ]));
    expect(candidates.find((item) => item.surface === "60,000원")?.classification).toBe("illustrative");
    expect(candidates.filter((item) => statesAValue(item.classification))).toHaveLength(0);
  });

  it("does not let a disclosure in one section shelter another section", () => {
    const candidates = factualSurfaceCandidates(document([
      heading("h1", "상환방식 비교"),
      paragraph("p1", disclosure),
      heading("h2", "지원금 안내"),
      paragraph("p2", "이 지원금은 매월 350,000원이 지급됩니다."),
    ]));
    expect(candidates.find((item) => item.surface.includes("350,000원"))?.classification)
      .toBe("external_fact");
  });
});
