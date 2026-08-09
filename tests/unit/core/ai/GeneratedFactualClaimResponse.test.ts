import { describe, expect, it } from "vitest";

import {
  hasGeneratedFactualClaimInventoryResponse,
  parseGeneratedFactualClaimInventoryDrafts,
  parseGeneratedFactualClaimDrafts,
  withGeneratedFactualClaimResponseInstruction,
} from "../../../../core/ai/GeneratedFactualClaimResponse";

describe("Generated factual Claim response contract", () => {
  it("parses only complete structured factual Claim records", () => {
    const response = JSON.stringify({
      verificationClaimsUsed: [
        {
          claimId: "claim-money",
          surfaceText: "현재 지원 금액은 월 50만원입니다.",
          kind: "money",
          normalizedValueJson: JSON.stringify({
            kind: "money",
            value: { amount: 500000, currency: "KRW", basis: "monthly" },
          }),
          qualifiers: {
            subject: "지원 금액",
            scope: "",
            basis: "monthly",
            note: "",
          },
          temporalRequirementJson: JSON.stringify({ mode: "current" }),
        },
        {
          claimId: "incomplete",
          surfaceText: "누락된 fixture",
          kind: "money",
          normalizedValueJson: "{}",
          qualifiers: { subject: "", scope: "", basis: "", note: "" },
        },
      ],
    });

    expect(parseGeneratedFactualClaimDrafts(response)).toEqual([
      {
        claimId: "claim-money",
        surfaceText: "현재 지원 금액은 월 50만원입니다.",
        kind: "money",
        normalizedValueJson: JSON.stringify({
          kind: "money",
          value: { amount: 500000, currency: "KRW", basis: "monthly" },
        }),
        qualifiers: {
          subject: "지원 금액",
          scope: "",
          basis: "monthly",
          note: "",
        },
        temporalRequirementJson: JSON.stringify({ mode: "current" }),
      },
    ]);
  });

  it("adds the one-call semantic contract without authorizing new facts", () => {
    const instruction = withGeneratedFactualClaimResponseInstruction("Write the verified article.");

    expect(instruction).toContain("verificationClaimsUsed");
    expect(instruction).toContain("surfaceText must be one exact verbatim complete reader-visible sentence");
    expect(instruction).toContain("Never invent or substitute another claimId");
    expect(instruction).toContain("Do not inventory advice, checklists");
    expect(instruction).toContain("Never introduce a CRITICAL item");
    expect(instruction).toContain("The server will reject the whole Generation result");
  });

  it("parses VERIFY inventory ownership and same-call Evidence fields", () => {
    const response = JSON.stringify({ verificationClaimsUsed: [{
      claimId: "claim-verify", planningClaimId: "", origin: "generation", risk: "verify",
      surfaceText: "취소 처리와 청구 반영은 다른 단계일 수 있다.",
      statement: "취소 처리와 청구 반영은 다른 단계일 수 있다.", kind: "general",
      normalizedValueJson: "{}", qualifiers: { subject: "", scope: "", basis: "", note: "" },
      temporalRequirementJson: "null", evidenceUrl: "https://www.fss.or.kr/card", evidenceExcerpt: "취소 처리와 청구 반영은 다른 단계일 수 있다.",
    }] });
    expect(hasGeneratedFactualClaimInventoryResponse(response)).toBe(true);
    expect(parseGeneratedFactualClaimInventoryDrafts(response)).toEqual([expect.objectContaining({
      claimId: "claim-verify", origin: "generation", risk: "verify", planningClaimId: "",
      evidenceUrl: "https://www.fss.or.kr/card",
    })]);
    expect(hasGeneratedFactualClaimInventoryResponse("{}")).toBe(false);
  });
});
