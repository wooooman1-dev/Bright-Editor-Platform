import { describe, expect, it } from "vitest";

import { approvalFactMatchesPage } from "../../../../core/approval";

const fact = Object.freeze({
  field: "depositProtectionEffectiveDate",
  value: "2025년 9월 1일",
});

function page(input: Readonly<{
  text?: string;
  requestedUrl?: string;
  finalUrl?: string;
}>) {
  return Object.freeze({
    title: "예금자보호 시행일 안내",
    publisher: "국가법령정보센터",
    text: input.text ?? "",
    requestedUrl: input.requestedUrl,
    finalUrl: input.finalUrl,
  });
}

describe("Approval Evidence effective-date verification", () => {
  it.each([
    "2025년 9월 1일",
    "2025. 9. 1.",
    "2025-09-01",
    "2025/09/01",
    "20250901",
  ])("accepts the exact date written as %s", (date) => {
    expect(approvalFactMatchesPage(
      page({ text: `이 기준은 ${date}부터 시행합니다.` }),
      fact,
    )).toBe(true);
  });

  it("accepts the exact compact date in the fetched final URL", () => {
    expect(approvalFactMatchesPage(
      page({
        text: "예금자보호법 시행일 안내",
        requestedUrl: "https://law.go.kr/page?efYd=20250901",
        finalUrl: "https://law.go.kr/page?efYd=20250901",
      }),
      fact,
    )).toBe(true);
  });

  it.each([
    "2025년 8월 31일",
    "2025. 9. 2.",
    "2026-09-01",
    "시행일은 공식 페이지에서 확인합니다.",
  ])("rejects a different or absent date written as %s", (date) => {
    expect(approvalFactMatchesPage(
      page({ text: `이 기준의 시행일: ${date}` }),
      fact,
    )).toBe(false);
  });
});