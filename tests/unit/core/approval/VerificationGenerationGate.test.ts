import { describe, expect, it } from "vitest";
import type {
  VerificationClaimResult,
  VerificationClaimSpec,
  VerificationClaimStatus,
  VerificationSnapshot,
  VerificationSourceAssessment,
} from "../../../../core/approval/VerificationClaim";
import {
  sourceSnapshotFingerprint,
  verificationPlanFingerprint,
  verificationSnapshotFingerprint,
} from "../../../../core/approval/VerificationClaimFingerprint";
import { evaluateVerificationGenerationGate } from "../../../../core/approval/VerificationGenerationGate";

const claim = (claimId: string, required = true, field = "amount"): VerificationClaimSpec => ({
  claimId,
  field,
  kind: "money",
  statement: `${field} claim`,
  rawValue: "50만원",
  qualifiers: {},
  temporalRequirement: { mode: "current" },
  required,
});

const source = (
  claimId: string,
  sourceId: string,
  freshnessStatus: VerificationSourceAssessment["freshnessStatus"] = "fresh",
): VerificationSourceAssessment => ({
  sourceId,
  institutionGroupId: sourceId,
  canonicalUrl: `https://${sourceId}.example/claim`,
  role: sourceId === "primary" ? "primaryOfficial" : "officialCorroborating",
  authoritative: true,
  supports: true,
  normalizedValue: {
    kind: "money",
    value: { amount: 500_000, currency: "KRW", basis: "total" },
  },
  freshnessStatus,
  fresh: freshnessStatus === "fresh",
  diagnostics: [`claim:${claimId}`],
});

function plan(claims: readonly VerificationClaimSpec[]) {
  return Object.freeze({
    claims: Object.freeze([...claims]),
    fingerprint: verificationPlanFingerprint(claims),
  });
}

function result(
  claimId: string,
  status: VerificationClaimStatus,
  assessments: readonly VerificationSourceAssessment[] = [],
): VerificationClaimResult {
  return Object.freeze({
    claimId,
    status,
    ...(status === "verified"
      ? {
          normalizedValue: {
            kind: "money" as const,
            value: { amount: 500_000, currency: "KRW", basis: "total" as const },
          },
        }
      : {}),
    sourceAssessments: Object.freeze([...assessments]),
    independentInstitutionCount: assessments.filter((item) => item.fresh).length,
    authoritativeInstitutionCount: assessments.filter((item) => item.fresh && item.authoritative).length,
    primarySourceFound: assessments.some((item) => item.fresh && item.role === "primaryOfficial"),
    unresolvedConflict: status === "conflicted",
    freshnessPassed: status === "verified",
    diagnostics: Object.freeze([]),
  });
}

function snapshot(
  claims: readonly VerificationClaimSpec[],
  results: readonly VerificationClaimResult[],
): VerificationSnapshot {
  const assessments = results.flatMap((item) => item.sourceAssessments);
  const claimDefinitionFingerprint = verificationPlanFingerprint(claims);
  const sourceFingerprint = sourceSnapshotFingerprint(assessments);
  const verificationFingerprint = verificationSnapshotFingerprint({
    claimDefinitionFingerprint,
    sourceSnapshotFingerprint: sourceFingerprint,
    results,
  });
  return Object.freeze({
    verificationMode: "explicit",
    claimDefinitionFingerprint,
    sourceSnapshotFingerprint: sourceFingerprint,
    results: Object.freeze([...results]),
    overallStatus: results.every((item) => item.status === "verified") ? "verified" : "insufficient",
    createdAt: "2026-08-08T00:00:00.000Z",
    updatedAt: "2026-08-08T00:00:00.000Z",
    verificationSnapshotFingerprint: verificationFingerprint,
  });
}

describe("Verification Generation Gate", () => {
  it("allows an explicit empty plan with an intact empty Snapshot", () => {
    const currentPlan = plan([]);
    expect(evaluateVerificationGenerationGate({
      plan: currentPlan,
      snapshot: snapshot([], []),
    }).ready).toBe(true);
  });

  it("allows a required verified Claim and exposes only its fresh supporting sources", () => {
    const required = claim("required");
    const assessments = [source("required", "primary"), source("required", "official")];
    const gate = evaluateVerificationGenerationGate({
      plan: plan([required]),
      snapshot: snapshot([required], [result("required", "verified", assessments)]),
    });
    expect(gate.ready).toBe(true);
    expect(gate.verifiedClaimIds).toEqual(["required"]);
    expect(gate.verifiedCanonicalUrls).toEqual([
      "https://primary.example/claim",
      "https://official.example/claim",
    ]);
  });

  it.each(["insufficient", "stale", "conflicted", "planned"] as const)(
    "blocks a required %s Claim",
    (status) => {
      const required = claim("required");
      const gate = evaluateVerificationGenerationGate({
        plan: plan([required]),
        snapshot: snapshot([required], [result("required", status)]),
      });
      expect(gate.ready).toBe(false);
      expect(gate.blockingClaimIds).toEqual(["required"]);
    },
  );

  it("blocks a missing required Claim result", () => {
    const required = claim("required");
    const gate = evaluateVerificationGenerationGate({
      plan: plan([required]),
      snapshot: snapshot([required], []),
    });
    expect(gate.ready).toBe(false);
    expect(gate.blockingClaimIds).toEqual(["required"]);
  });

  it("allows an unverified optional Claim without trusting its sources", () => {
    const optional = claim("optional", false);
    const gate = evaluateVerificationGenerationGate({
      plan: plan([optional]),
      snapshot: snapshot([optional], [result("optional", "insufficient")]),
    });
    expect(gate.ready).toBe(true);
    expect(gate.verifiedClaimIds).toEqual([]);
    expect(gate.verifiedCanonicalUrls).toEqual([]);
  });

  it("blocks when the stored plan fingerprint is not self-consistent", () => {
    const required = claim("required");
    const currentPlan = { ...plan([required]), fingerprint: "tampered" };
    const gate = evaluateVerificationGenerationGate({
      plan: currentPlan,
      snapshot: snapshot([required], []),
    });
    expect(gate.ready).toBe(false);
    expect(gate.diagnostics).toContain("verification_plan_fingerprint_mismatch");
  });

  it("blocks when the Snapshot Claim-definition fingerprint differs from the plan", () => {
    const required = claim("required");
    const currentPlan = plan([required]);
    const currentSnapshot = snapshot([required], []);
    const tampered = {
      ...currentSnapshot,
      claimDefinitionFingerprint: "other-plan",
      verificationSnapshotFingerprint: verificationSnapshotFingerprint({
        claimDefinitionFingerprint: "other-plan",
        sourceSnapshotFingerprint: currentSnapshot.sourceSnapshotFingerprint,
        results: currentSnapshot.results,
      }),
    } as VerificationSnapshot;
    const gate = evaluateVerificationGenerationGate({ plan: currentPlan, snapshot: tampered });
    expect(gate.ready).toBe(false);
    expect(gate.diagnostics).toContain("verification_claim_definition_fingerprint_mismatch");
  });

  it("blocks a Snapshot whose fingerprint does not match its current contents", () => {
    const required = claim("required");
    const currentSnapshot = snapshot([required], []);
    const gate = evaluateVerificationGenerationGate({
      plan: plan([required]),
      snapshot: { ...currentSnapshot, verificationSnapshotFingerprint: "tampered" },
    });
    expect(gate.ready).toBe(false);
    expect(gate.diagnostics).toContain("verification_snapshot_fingerprint_mismatch");
  });

  it("keeps same-field Claims independent by claimId", () => {
    const verified = claim("claim-a", true, "amount");
    const missing = claim("claim-b", true, "amount");
    const assessments = [source("claim-a", "primary")];
    const gate = evaluateVerificationGenerationGate({
      plan: plan([verified, missing]),
      snapshot: snapshot(
        [verified, missing],
        [result("claim-a", "verified", assessments)],
      ),
    });
    expect(gate.ready).toBe(false);
    expect(gate.verifiedClaimIds).toEqual(["claim-a"]);
    expect(gate.blockingClaimIds).toEqual(["claim-b"]);
  });

  it("excludes stale assessments when a verified Claim also has fresh evidence", () => {
    const required = claim("required");
    const fresh = source("required", "primary");
    const stale = source("required", "old", "stale");
    const gate = evaluateVerificationGenerationGate({
      plan: plan([required]),
      snapshot: snapshot([required], [result("required", "verified", [fresh, stale])]),
    });
    expect(gate.ready).toBe(true);
    expect(gate.verifiedCanonicalUrls).toEqual(["https://primary.example/claim"]);
  });

  it("does not trust an unknown-freshness assessment even if a malformed Snapshot labels the Claim verified", () => {
    const required = claim("required");
    const unknown = source("required", "primary", "unknown");
    const gate = evaluateVerificationGenerationGate({
      plan: plan([required]),
      snapshot: snapshot([required], [result("required", "verified", [unknown])]),
    });
    expect(gate.ready).toBe(false);
    expect(gate.blockingClaimIds).toEqual(["required"]);
    expect(gate.diagnostics).toContain("verification_verified_claim_missing_generation_source:required");
  });
});
