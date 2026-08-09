import { describe, expect, it } from "vitest";

import {
  canonicalEvidenceAnchorText,
  evidenceAnchorContains,
  evaluateVerificationClaimEvidenceMatch,
  stripEvidenceAnnotations,
  type VerificationClaimSpec,
} from "../../../../core/approval";

/**
 * Reproduces the 고용보험법 제40조 page shape that broke manuscript generation:
 * a revision-history annotation sits between the intro clause and item 1, so a
 * verbatim quote spanning both is not a raw substring of the page.
 */
const statutePageText = [
  "조문정보 검색 고용보험법 [시행 2026. 5. 12.]",
  "제40조(구직급여의 수급 요건) ①구직급여는 이직한 근로자인 피보험자가 다음 각 호의 요건을 모두 갖춘 경우에 지급한다.",
  "<개정 2019. 1. 15., 2019. 8. 27., 2020. 5. 26.>",
  "1. 기준기간 동안의 피보험 단위기간이 합산하여 180일 이상일 것",
  "2. 근로의 의사와 능력이 있음에도 불구하고 취업하지 못한 상태에 있을 것",
].join(" ");

const statuteExcerpt = "제40조(구직급여의 수급 요건) ①구직급여는 이직한 근로자인 피보험자가 다음 각 호의 요건을 모두 갖춘 경우에 지급한다. 1. 기준기간 동안의 피보험 단위기간이 합산하여 180일 이상일 것";

const eligibilityClaim: VerificationClaimSpec = {
  claimId: "verification-claim-c883f608",
  field: "수급자격 판단 요소",
  kind: "eligibility",
  statement: "구직급여 수급자격은 이직 사유와 고용보험 피보험 단위기간을 포함한 법정 요건에 따라 판단된다.",
  qualifiers: {
    subject: "구직급여 수급자격",
    scope: "대한민국 고용보험 제도",
    basis: "고용보험 관련 법령 및 공식 안내",
  },
  temporalRequirement: { mode: "current" },
  required: true,
  risk: "critical",
};

describe("canonical Approval Evidence anchor text", () => {
  it("removes statute revision annotations from either side of the comparison", () => {
    expect(stripEvidenceAnnotations("본문 <개정 2019. 1. 15., 2019. 8. 27.> 다음").replace(/\s+/gu, " "))
      .toBe("본문 다음");
    expect(canonicalEvidenceAnchorText("가. <신설 2021. 1. 5.> 나."))
      .toBe(canonicalEvidenceAnchorText("가. 나."));
  });

  it("matches a verbatim quote that omits an inline revision annotation", () => {
    expect(evidenceAnchorContains(statutePageText, statuteExcerpt)).toBe(true);
  });

  it("matches a verbatim quote that carries the revision annotation across", () => {
    expect(evidenceAnchorContains(
      statutePageText,
      "①구직급여는 이직한 근로자인 피보험자가 다음 각 호의 요건을 모두 갖춘 경우에 지급한다. <개정 2019. 1. 15., 2019. 8. 27., 2020. 5. 26.> 1. 기준기간 동안의",
    )).toBe(true);
  });

  it("still rejects a passage stitched from non-adjacent parts of the page", () => {
    expect(evidenceAnchorContains(
      statutePageText,
      "제40조(구직급여의 수급 요건) ①구직급여는 이직한 근로자인 피보험자가 2. 근로의 의사와 능력이 있음에도 불구하고 취업하지 못한 상태에 있을 것",
    )).toBe(false);
  });

  it("never matches a candidate that canonicalizes below the required length", () => {
    expect(evidenceAnchorContains(statutePageText, "「」()")).toBe(false);
    expect(evidenceAnchorContains(statutePageText, "제40조", 20)).toBe(false);
  });
});

describe("Source Preflight and Claim evidence gates agree", () => {
  it("binds the Claim whose excerpt already satisfied the source anchor gate", () => {
    // The source-level gate admits this page as the Claim's official source.
    expect(evidenceAnchorContains(statutePageText, statuteExcerpt, 20)).toBe(true);

    // The Claim-level gate must not then reject the identical excerpt, which
    // previously ended the run at coverage_incomplete with no usable reason.
    const result = evaluateVerificationClaimEvidenceMatch({
      spec: eligibilityClaim,
      submittedValue: "피보험 단위기간이 합산하여 180일 이상일 것",
      evidenceExcerpt: statuteExcerpt,
      pageText: statutePageText,
      normalizedValuePresent: true,
      normalizedValueMatchesPlanned: true,
    });

    expect(result.diagnostics).not.toContain("claim_evidence_excerpt_not_found");
    expect(result.matched).toBe(true);
  });

  it("keeps reporting a Claim excerpt that is genuinely absent from the page", () => {
    const result = evaluateVerificationClaimEvidenceMatch({
      spec: eligibilityClaim,
      submittedValue: "피보험 단위기간이 합산하여 180일 이상일 것",
      evidenceExcerpt: "제40조에 따라 수급자격은 신청과 동시에 확정된다.",
      pageText: statutePageText,
      normalizedValuePresent: true,
      normalizedValueMatchesPlanned: true,
    });

    expect(result.matched).toBe(false);
    expect(result.diagnostics).toContain("claim_evidence_excerpt_not_found");
  });
});
