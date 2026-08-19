import { describe, expect, it } from "vitest";
import type {
  VerificationClaimResult,
  VerificationClaimSpec,
  VerificationSnapshot,
  VerificationSourceAssessment,
} from "../../../../core/approval/VerificationClaim";
import {
  sourceSnapshotFingerprint,
  verificationPlanFingerprint,
  verificationSnapshotFingerprint,
} from "../../../../core/approval/VerificationClaimFingerprint";
import type { AIWebSource } from "../../../../core/ai/AIProvider";
import { requireExplicitVerificationGenerationBundle } from "../../../../core/ai/VerificationGenerationBundle";

const claim = (
  claimId: string,
  required = true,
  field = claimId,
): VerificationClaimSpec => ({
  claimId,
  field,
  kind: "money",
  statement: `${claimId} claim`,
  rawValue: "50만원",
  qualifiers: {},
  temporalRequirement: { mode: "current" },
  required,
});

const assessment = (
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

const completeAssessments = (claimId: string): readonly VerificationSourceAssessment[] => Object.freeze([
  assessment(claimId, "primary"),
  assessment(claimId, "official-a"),
  assessment(claimId, "official-b"),
]);

function plan(claims: readonly VerificationClaimSpec[]) {
  return Object.freeze({
    claims: Object.freeze([...claims]),
    fingerprint: verificationPlanFingerprint(claims),
  });
}

function verifiedResult(
  claimId: string,
  assessments: readonly VerificationSourceAssessment[],
): VerificationClaimResult {
  return Object.freeze({
    claimId,
    status: "verified",
    normalizedValue: {
      kind: "money" as const,
      value: { amount: 500_000, currency: "KRW", basis: "total" as const },
    },
    sourceAssessments: Object.freeze([...assessments]),
    independentInstitutionCount: assessments.filter((item) => item.fresh).length,
    authoritativeInstitutionCount: assessments.filter((item) => item.fresh && item.authoritative).length,
    primarySourceFound: assessments.some((item) => item.fresh && item.role === "primaryOfficial"),
    unresolvedConflict: false,
    freshnessPassed: true,
    diagnostics: Object.freeze([]),
  });
}

function insufficientResult(claimId: string): VerificationClaimResult {
  return Object.freeze({
    claimId,
    status: "insufficient",
    sourceAssessments: Object.freeze([]),
    independentInstitutionCount: 0,
    authoritativeInstitutionCount: 0,
    primarySourceFound: false,
    unresolvedConflict: false,
    freshnessPassed: false,
    diagnostics: Object.freeze(["freshness_unknown"]),
  });
}

function snapshot(
  claims: readonly VerificationClaimSpec[],
  results: readonly VerificationClaimResult[],
): VerificationSnapshot {
  const allAssessments = results.flatMap((item) => item.sourceAssessments);
  const claimDefinitionFingerprint = verificationPlanFingerprint(claims);
  const sourceFingerprint = sourceSnapshotFingerprint(allAssessments);
  return Object.freeze({
    verificationMode: "explicit",
    claimDefinitionFingerprint,
    sourceSnapshotFingerprint: sourceFingerprint,
    results: Object.freeze([...results]),
    overallStatus: results.every((item) => item.status === "verified")
      ? "verified"
      : "insufficient",
    createdAt: "2026-08-08T00:00:00.000Z",
    updatedAt: "2026-08-08T00:00:00.000Z",
    verificationSnapshotFingerprint: verificationSnapshotFingerprint({
      claimDefinitionFingerprint,
      sourceSnapshotFingerprint: sourceFingerprint,
      results,
    }),
  });
}

const webSource = (sourceId: string): AIWebSource => ({
  url: `https://${sourceId}.example/claim`,
  title: sourceId,
  excerpt: `${sourceId} evidence`,
  provenance: "citation",
});

const claimSource = (
  sourceId: string,
  spec: VerificationClaimSpec,
  includeCanonical = true,
) => ({
  url: `https://${sourceId}.example/claim`,
  claims: Object.freeze([{
    field: spec.field,
    value: "50만원",
    evidenceExcerpt: "지원 금액 50만원의 적용 기간은 2026-01-01부터 2026-12-31까지입니다.",
  }]),
  ...(includeCanonical
    ? {
        verificationClaims: Object.freeze([Object.freeze({
          claimId: spec.claimId,
          field: spec.field,
          kind: spec.kind,
          statement: spec.statement,
          required: spec.required,
          normalizedValue: {
            kind: "money" as const,
            value: {
              amount: 500_000,
              currency: "KRW",
              basis: "total" as const,
            },
          },
          qualifiers: spec.qualifiers,
          temporalRequirement: spec.temporalRequirement,
          source: Object.freeze({
            sourceId,
            canonicalUrl: `https://${sourceId}.example/claim`,
            role: sourceId === "primary"
              ? "primaryOfficial" as const
              : "officialCorroborating" as const,
            authoritative: true,
            evidenceExcerpt: "지원 금액 50만원의 적용 기간은 2026-01-01부터 2026-12-31까지입니다.",
          }),
        })]),
      }
    : {}),
});

describe("Verification Generation bundle", () => {
  /**
   * D-045: 번들은 검증 결과로 출처를 걸러내지 않는다. 인정 범위 안에서 열린
   * 출처를 그대로 넘기고, 어떤 Claim 에 붙는지만 기록한다.
   */
  it("passes every in-scope source through and attributes it to its Claim", () => {
    const required = claim("required");
    const optional = claim("optional", false);
    const fresh = completeAssessments("required");
    const stale = assessment("required", "stale", "stale");
    const currentPlan = plan([required, optional]);
    const currentSnapshot = snapshot(
      [required, optional],
      [verifiedResult("required", [...fresh, stale]), insufficientResult("optional")],
    );

    const bundle = requireExplicitVerificationGenerationBundle({
      plan: currentPlan,
      snapshot: currentSnapshot,
      sources: [
        webSource("primary"),
        webSource("official-a"),
        webSource("official-b"),
        webSource("stale"),
        webSource("optional"),
        webSource("rejected"),
      ],
      claimSources: [
        claimSource("primary", required),
        claimSource("official-a", required),
        claimSource("official-b", required),
        claimSource("stale", required),
        claimSource("optional", optional),
      ],
    });

    expect(bundle.gate.ready).toBe(true);
    expect(bundle.sources.map((source) => source.url)).toEqual([
      "https://primary.example/claim",
      "https://official-a.example/claim",
      "https://official-b.example/claim",
      "https://stale.example/claim",
      "https://optional.example/claim",
      "https://rejected.example/claim",
    ]);
    expect(bundle.claimSources.map((source) => source.url)).toEqual([
      "https://primary.example/claim",
      "https://official-a.example/claim",
      "https://official-b.example/claim",
      "https://stale.example/claim",
      "https://optional.example/claim",
    ]);
  });

  it("allows an intact explicit empty plan without adding evidence", () => {
    const currentPlan = plan([]);
    const bundle = requireExplicitVerificationGenerationBundle({
      plan: currentPlan,
      snapshot: snapshot([], []),
      sources: [],
      claimSources: [],
    });
    expect(bundle.gate.ready).toBe(true);
    expect(bundle.sources).toEqual([]);
    expect(bundle.claimSources).toEqual([]);
    expect(bundle.verificationClaims).toEqual([]);
  });

  /**
   * D-045: 근거가 부족하다는 이유로 생성을 막지 않는다. 번들은 판정이 아니라
   * 귀속이다 — 인정 범위 안에서 열린 출처와 그 출처가 붙는 Claim 을 그대로
   * 넘기고, 무엇을 쓸지는 생성 지시가 정한다.
   */
  it("hands the manuscript through even when a required Claim has no attached source", () => {
    const spec = claim("required");
    expect(() => requireExplicitVerificationGenerationBundle({
      plan: plan([spec]),
      snapshot: snapshot([spec], [insufficientResult("required")]),
      sources: [],
      claimSources: [],
    })).not.toThrow();
  });

  it("keeps an in-scope source whose projection carries only the legacy field/value shape", () => {
    const spec = claim("required");
    const bundle = requireExplicitVerificationGenerationBundle({
      plan: plan([spec]),
      snapshot: snapshot([spec], [insufficientResult("required")]),
      sources: [webSource("official")],
      claimSources: [claimSource("official", spec, false)],
    });
    expect(bundle.sources).toHaveLength(1);
    expect(bundle.gate.ready).toBe(true);
  });

});
