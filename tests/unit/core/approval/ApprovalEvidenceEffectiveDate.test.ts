import { describe, expect, it } from "vitest";

import { approvalFactMatchesPage } from "../../../../core/approval/ApprovalEvidenceClaimPolicyBase";

const effectiveDateFact = Object.freeze({
  field: "depositProtectionEffectiveDate",
  value: "예금자보호법 시행령은 2025년 9월 1일부터 시행합니다.",
});

describe("approval Evidence effective-date matching", () => {
  it.each([
    "예금자보호법 시행령 [시행 2025. 9. 1.]",
    "예금자보호법 시행령은 2025-09-01부터 시행합니다.",
    "예금자보호법 시행령은 2025/9/1부터 시행합니다.",
    "예금자보호법 시행령은 2025년 9월 1일부터 시행합니다.",
  ])("matches the same effective date across official-page date formats: %s", (text) => {
    expect(approvalFactMatchesPage({
      title: "예금자보호법 시행령",
      publisher: "국가법령정보센터",
      text,
    }, effectiveDateFact)).toBe(true);
  });

  it("matches the canonical law.go.kr efYd date when the extracted page text omits punctuation-equivalent wording", () => {
    expect(approvalFactMatchesPage({
      title: "예금자보호법 시행령",
      publisher: "국가법령정보센터",
      text: "현재 시행 중인 예금자보호법 시행령 조문입니다.",
      requestedUrl: "https://law.go.kr/lsInfoP.do?lsiSeq=273001&efYd=20250901",
      finalUrl: "https://law.go.kr/lsInfoP.do?ancYnChk=0&efYd=20250901&lsiSeq=273001&urlMode=lsInfoP",
    }, effectiveDateFact)).toBe(true);
  });

  it("does not verify a different date", () => {
    expect(approvalFactMatchesPage({
      title: "예금자보호법 시행령",
      publisher: "국가법령정보센터",
      text: "예금자보호법 시행령 [시행 2025. 8. 31.]",
      finalUrl: "https://law.go.kr/lsInfoP.do?efYd=20250831&lsiSeq=273001",
    }, effectiveDateFact)).toBe(false);
  });

  it("does not verify a date-free page", () => {
    expect(approvalFactMatchesPage({
      title: "예금자보호법 시행령",
      publisher: "국가법령정보센터",
      text: "예금자보호법 시행령의 보호한도 조문입니다.",
    }, effectiveDateFact)).toBe(false);
  });
});