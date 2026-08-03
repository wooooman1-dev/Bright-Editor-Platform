import { describe, expect, it } from "vitest";

import { approvalFactMatchesPage } from "../../../../core/approval";

const fact = Object.freeze({
  field: "depositProtectionEffectiveDate",
  value: "2025년 9월 1일",
});

function page(text: string, url = "https://law.go.kr/lsInfoP.do"): Readonly<{
  title: string;
  publisher: string;
  text: string;
  requestedUrl: string;
  finalUrl: string;
}> {
  return Object.freeze({
    title: "예금자보호법 시행령",
    publisher: "국가법령정보센터",
    text,
    requestedUrl: url,
    finalUrl: url,
  });
}

describe("Approval effective-date matching", () => {
  it.each([
    "2025년 9월 1일",
    "[시행 2025. 9. 1.]",
    "2025-09-01",
    "2025/9/1",
  ])("matches the same canonical date in %s form", (value) => {
    expect(approvalFactMatchesPage(page(value), fact)).toBe(true);
  });

  it("matches a compact official law effective-date query value", () => {
    expect(approvalFactMatchesPage(
      page(
        "예금자보호법 시행령",
        "https://law.go.kr/lsInfoP.do?efYd=20250901&lsiSeq=273001&urlMode=lsInfoP",
      ),
      fact,
    )).toBe(true);
  });

  it("rejects a different date", () => {
    expect(approvalFactMatchesPage(page("[시행 2025. 8. 31.]"), fact)).toBe(false);
  });

  it("rejects a page without the claimed date", () => {
    expect(approvalFactMatchesPage(page("예금자보호법 시행령 안내"), fact)).toBe(false);
  });
});
