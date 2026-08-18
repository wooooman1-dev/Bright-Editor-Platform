import { describe, expect, it } from "vitest";
import {
  buildCorroborationSearchQueries,
  corroborationSupportedFacts,
  isLikelyStaleCorroborationPage,
} from "../../../../core/approval/CorroborationSearch";
import type { ApprovalEvidenceSource } from "../../../../core/approval/ApprovalReadiness";

function source(overrides: Partial<ApprovalEvidenceSource> = {}): ApprovalEvidenceSource {
  return {
    sourceId: "source-a",
    url: "https://example.com/article",
    title: "계약갱신요구권 안내",
    publisher: "example.com",
    sourceType: "official_institution",
    retrievedAt: "2026-08-16T00:00:00.000Z",
    verified: false,
    facts: [
      { field: "renewalPeriod", value: "임대차 종료 전 계약갱신요구권 행사 기간" },
      { field: "renewalRight", value: "임차인은 계약갱신요구권을 행사할 수 있다" },
    ],
    matchedFacts: [
      { field: "renewalPeriod", value: "임대차 종료 전 계약갱신요구권 행사 기간" },
    ],
    verificationStatus: "needs_corroboration",
    official: false,
    ...overrides,
  };
}

describe("CorroborationSearch", () => {
  it("builds claim-based queries without numeric/date tokens", () => {
    const queries = buildCorroborationSearchQueries(source({
      matchedFacts: [{ field: "renewalPeriod", value: "계약 종료 6개월 전부터 2개월 전까지 행사" }],
    }));
    expect(queries.length).toBeGreaterThan(0);
    expect(queries[0]?.query).not.toContain("6개월");
    expect(queries[0]?.query).not.toContain("2개월");
    expect(queries[0]?.query).toContain("계약갱신요구권");
  });

  it("accepts corroboration when the same period content is supported", () => {
    const facts = [{ field: "renewalPeriod", value: "계약 종료 6개월 전부터 2개월 전까지 행사" }];
    const supported = corroborationSupportedFacts({
      url: "https://other.example.org/lease",
      finalUrl: "https://other.example.org/lease",
      title: "계약갱신요구권 행사 안내",
      publisher: "other.example.org",
      text: "임대차 종료 6개월 전부터 2개월 전까지 계약갱신요구권을 행사할 수 있습니다.",
    }, facts);
    expect(supported).toHaveLength(1);
  });

  it("rejects corroboration when the numeric content changes", () => {
    const facts = [{ field: "renewalPeriod", value: "계약 종료 6개월 전부터 2개월 전까지 행사" }];
    const supported = corroborationSupportedFacts({
      url: "https://other.example.org/lease",
      finalUrl: "https://other.example.org/lease",
      title: "계약갱신요구권 행사 안내",
      publisher: "other.example.org",
      text: "임대차 종료 12개월 전부터 1개월 전까지 계약갱신요구권을 행사할 수 있습니다.",
    }, facts);
    expect(supported).toHaveLength(0);
  });

  it("rejects an obviously expired event/application page", () => {
    expect(isLikelyStaleCorroborationPage({
      url: "https://example.org/event",
      title: "2024년 지원사업 신청기간 및 마감 안내",
      publisher: "example.org",
      text: "2024년 지원사업 신청기간은 3월부터 4월까지이며 접수가 종료되었습니다.",
    }, new Date("2026-08-16T00:00:00.000Z"))).toBe(true);
  });

  it("does not reject a current legal page merely because it mentions an old amendment", () => {
    expect(isLikelyStaleCorroborationPage({
      url: "https://example.gov/law",
      title: "주택임대차보호법 현행 법령",
      publisher: "example.gov",
      text: "2020년 개정 내용을 반영한 현행 법령입니다. 현재 계약갱신요구권 규정을 안내합니다.",
    }, new Date("2026-08-16T00:00:00.000Z"))).toBe(false);
  });
});
