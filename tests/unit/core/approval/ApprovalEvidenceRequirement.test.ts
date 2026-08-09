import { describe, expect, it } from "vitest";

import {
  approvalEvidenceIsApplicable,
  isTimeSensitiveCriticalVerificationClaim,
  resolveApprovalEvidenceRequirement,
  resolveApprovalTemporalRequirement,
} from "../../../../core/approval";
import { createContentOpportunityVerificationPlan } from "../../../../core/content";

const claim = (risk: "verify" | "critical") => ({
  claimId: `claim-${risk}`,
  field: "rate",
  kind: "ratio" as const,
  statement: "상품 금리는 연 3%입니다.",
  rawValue: "3%",
  qualifiers: { subject: "금융 상품" },
  temporalRequirement: { mode: "current" as const },
  required: risk === "critical",
  risk,
});

describe("Approval Evidence requirement", () => {
  it("requires Evidence when Planning contains a CRITICAL Claim", () => {
    const opportunity = { verificationPlan: createContentOpportunityVerificationPlan([claim("critical")]) };

    expect(resolveApprovalEvidenceRequirement(opportunity)).toBe("required");
    expect(approvalEvidenceIsApplicable(opportunity)).toBe(true);
  });

  it("does not require mandatory Evidence for a VERIFY-only plan", () => {
    const opportunity = { verificationPlan: createContentOpportunityVerificationPlan([claim("verify")]) };

    expect(resolveApprovalEvidenceRequirement(opportunity)).toBe("not_required");
    expect(approvalEvidenceIsApplicable(opportunity)).toBe(false);
  });

  it("recognizes an explicit empty required-Evidence contract as not required", () => {
    const opportunity = {
      requiredEvidenceContract: {
        schemaVersion: 1 as const,
        contractId: "contract-1",
        policyId: "adsense_approval_mode",
        policyVersion: "1.0",
        profileId: "wordpress_life_economy_v1" as const,
        profileVersion: "1.0",
        explicitVerificationRequired: false,
        profileSourceRequirementApplicable: false,
        sourceRequirements: [],
        requiredClaims: [],
      },
    };

    expect(resolveApprovalEvidenceRequirement(opportunity)).toBe("not_required");
  });

  it("does not let a profile source-quality rule create mandatory Evidence", () => {
    const opportunity = {
      requiredEvidenceContract: {
        schemaVersion: 1 as const,
        contractId: "contract-profile-only",
        policyId: "adsense_approval_mode",
        policyVersion: "1.0",
        profileId: "wordpress_life_economy_v1" as const,
        profileVersion: "1.0",
        explicitVerificationRequired: false,
        profileSourceRequirementApplicable: true,
        sourceRequirements: ["official HTTPS source"],
        requiredClaims: [],
      },
    };

    expect(resolveApprovalEvidenceRequirement(opportunity)).toBe("not_required");
  });

  it("keeps legacy content without a Planning contract fail-closed", () => {
    expect(resolveApprovalEvidenceRequirement(undefined)).toBe("unknown");
    expect(resolveApprovalEvidenceRequirement({})).toBe("unknown");
    expect(approvalEvidenceIsApplicable(undefined)).toBe(true);
  });

  it("distinguishes time-sensitive and non-temporal CRITICAL Claims", () => {
    expect(isTimeSensitiveCriticalVerificationClaim(claim("critical"))).toBe(true);
    expect(isTimeSensitiveCriticalVerificationClaim({
      ...claim("critical"),
      temporalRequirement: { mode: "notRequired" },
    })).toBe(false);
  });

  it("resolves temporal applicability from the same canonical Planning contract", () => {
    expect(resolveApprovalTemporalRequirement({
      verificationPlan: createContentOpportunityVerificationPlan([claim("critical")]),
    })).toBe("required");
    expect(resolveApprovalTemporalRequirement({
      verificationPlan: createContentOpportunityVerificationPlan([{
        ...claim("critical"),
        temporalRequirement: { mode: "notRequired" },
      }]),
    })).toBe("not_required");
    expect(resolveApprovalTemporalRequirement({
      requiredEvidenceContract: {
        schemaVersion: 1,
        contractId: "contract-empty",
        policyId: "adsense_approval_mode",
        policyVersion: "1.0",
        profileId: "wordpress_life_economy_v1",
        profileVersion: "1.0",
        explicitVerificationRequired: false,
        profileSourceRequirementApplicable: false,
        sourceRequirements: [],
        requiredClaims: [],
      },
    })).toBe("not_required");
    expect(resolveApprovalTemporalRequirement(undefined)).toBe("unknown");
  });
});
