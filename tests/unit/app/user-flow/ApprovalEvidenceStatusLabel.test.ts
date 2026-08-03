import { describe, expect, it } from "vitest";

import { evidenceStatusLabel } from "../../../../app/user-flow/ApprovalReadinessActions";
import type { ApprovalEvidenceSource, ApprovalEvidenceVerificationStatus } from "../../../../core/approval";

function source(status: ApprovalEvidenceVerificationStatus, verified = false): ApprovalEvidenceSource {
  return {
    sourceId: status,
    url: "https://law.go.kr/source",
    title: "공식 출처",
    publisher: "국가법령정보센터",
    sourceType: "official_law",
    retrievedAt: "2026-08-03T00:00:00.000Z",
    verified,
    facts: [],
    verificationStatus: status,
  };
}

describe("Evidence source terminal status labels", () => {
  it.each([
    ["unreachable", "접근 불가"],
    ["unsupported_content_type", "문서 형식 미지원"],
    ["empty_content", "본문 없음"],
    ["malformed_content", "문서 형식 오류"],
    ["content_too_large", "문서 크기 초과"],
    ["unsupported_claim", "지원되지 않는 Claim"],
    ["unofficial_source", "공식 출처 아님"],
    ["fact_mismatch", "Claim 불일치"],
    ["duplicate_source", "중복 후보"],
    ["excluded", "후보 · 판정 제외"],
  ] as const)("renders %s deterministically", (status, label) => {
    expect(evidenceStatusLabel(source(status), true)).toBe(label);
  });

  it("prioritizes verified state over a stale diagnostic status", () => {
    expect(evidenceStatusLabel(source("fact_mismatch", true), false)).toBe("검증 완료");
  });
});
