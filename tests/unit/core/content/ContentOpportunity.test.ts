import { describe, expect, it } from "vitest";

import {
  applyContentDepthPolicy,
  assertConfirmedContentOpportunity,
  confirmContentOpportunity,
  createContentOpportunityCandidate,
  createContentOpportunityVerificationPlan,
  detectContentOpportunitySelectionMode,
  hasSelfConsistentVerificationPlan,
  hasCurrentContentOpportunityFingerprint,
  resolveContentOpportunityVerificationMode,
} from "../../../../core/content";

const candidate = () => createContentOpportunityCandidate({
  sourceRequest: "기존 글과 겹치지 않는 건강 글을 골라줘",
  selectionMode: "automatic",
  selectedTopic: "장 건강 관리",
  primaryKeyword: "장 건강 관리 방법",
  secondaryKeywords: ["장 건강에 좋은 음식", "유산균", "식이섬유"],
  searchIntent: "장 건강을 개선하는 실천 방법 탐색",
  audience: "건강 관리에 관심 있는 일반 성인",
  contentType: "guide",
  contentAngle: "음식과 생활습관을 함께 설명",
  readerProblem: "장 건강을 어떻게 관리해야 하는지 모름",
  expectedCoverage: ["장내 환경", "유산균", "식이섬유", "생활습관"],
  selectionRationale: "프로젝트에서 아직 다루지 않은 콘텐츠 공백",
  opportunityEvidence: [{ source: "inferred", summary: "기존 콘텐츠 제목과 키워드의 공백을 추론" }],
  confidence: 0.82,
  cautions: ["외부 검색량 공급원 없음"],
  projectId: "project-1",
});

describe("Content Opportunity contract", () => {
  const verificationClaim = () => ({
    claimId: "claim-1", field: "amount", kind: "money" as const, statement: "현재 지원금", rawValue: "100만원",
    qualifiers: { subject: "가구" }, temporalRequirement: { mode: "current" as const }, required: true,
  });

  it("keeps absent plans legacy without creating claims", () => {
    const value = candidate();
    expect(resolveContentOpportunityVerificationMode(value)).toBe("legacy");
    expect(value).not.toHaveProperty("verificationPlan");
  });

  it("creates and preserves an explicit empty plan", () => {
    const plan = createContentOpportunityVerificationPlan([]);
    const value = createContentOpportunityCandidate({ ...candidate(), verificationPlan: plan });
    expect(plan.mode).toBe("explicit");
    expect(plan.schemaVersion).toBe(1);
    expect(plan.claims).toEqual([]);
    expect(resolveContentOpportunityVerificationMode(value)).toBe("explicit");
    expect(value.verificationPlan).toEqual(plan);
    expect(value.version).toBe(1);
  });

  it("rejects duplicate claims and invalid plan fingerprints", () => {
    expect(() => createContentOpportunityVerificationPlan([verificationClaim(), verificationClaim()])).toThrow("Duplicate verification Claim ID");
    const plan = createContentOpportunityVerificationPlan([verificationClaim()]);
    expect(hasSelfConsistentVerificationPlan({ ...plan, fingerprint: "vfp-invalid" })).toBe(false);
  });

  it("freezes copied claims, nested qualifiers, and temporal requirements", () => {
    const claims = [verificationClaim()];
    const plan = createContentOpportunityVerificationPlan(claims);
    claims[0]!.qualifiers.subject = "변경";
    expect(plan.claims[0]!.qualifiers.subject).toBe("가구");
    expect(plan.claims[0]!.temporalRequirement).toEqual({ mode: "current" });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.claims)).toBe(true);
    expect(Object.isFrozen(plan.claims[0])).toBe(true);
    expect(Object.isFrozen(plan.claims[0]!.qualifiers)).toBe(true);
    expect(Object.isFrozen(plan.claims[0]!.temporalRequirement)).toBe(true);
  });

  it("changes only the plan fingerprint when plan claims or temporal intent change", () => {
    const withoutPlan = candidate();
    const withPlan = createContentOpportunityCandidate({ ...withoutPlan, verificationPlan: createContentOpportunityVerificationPlan([verificationClaim()]) });
    const changedPlan = createContentOpportunityCandidate({ ...withoutPlan, verificationPlan: createContentOpportunityVerificationPlan([{ ...verificationClaim(), rawValue: "200만원" }]) });
    const changedTemporal = createContentOpportunityCandidate({ ...withoutPlan, verificationPlan: createContentOpportunityVerificationPlan([{ ...verificationClaim(), temporalRequirement: { mode: "unknown" } }]) });
    expect(withPlan.fingerprint).toBe(withoutPlan.fingerprint);
    expect(withPlan.fingerprint).toBe(changedTemporal.fingerprint);
    expect(withPlan.verificationPlan?.fingerprint).not.toBe(changedPlan.verificationPlan?.fingerprint);
    expect(withPlan.verificationPlan?.fingerprint).not.toBe(changedTemporal.verificationPlan?.fingerprint);
  });

  it("preserves the plan when the opportunity is confirmed", () => {
    const value = createContentOpportunityCandidate({ ...candidate(), verificationPlan: createContentOpportunityVerificationPlan([verificationClaim()]) });
    const confirmed = confirmContentOpportunity(value, { workspaceId: "workspace-1", projectId: "project-1", contentId: "content-1", confirmedAt: "2026-08-01T00:00:00.000Z" });
    expect(confirmed.verificationPlan).toEqual(value.verificationPlan);
    expect(confirmed.fingerprint).toBe(value.fingerprint);
  });
  it("creates the same identity and fingerprint for the same planning input", () => {
    expect(candidate()).toEqual(candidate());
  });

  it("rebuilds a valid fingerprint after server classification fields and Evidence are attached", () => {
    const classified = createContentOpportunityCandidate({
      ...candidate(),
      recommendationType: "blogGrowth",
      evidenceIds: ["evidence-b", "evidence-a"],
      opportunityEvidence: [
        { source: "inferred", summary: "두 번째 근거", evidenceId: "evidence-b" },
        { source: "inferred", summary: "첫 번째 근거", evidenceId: "evidence-a" },
      ],
      marketEvidenceStatus: "unavailable",
      internalGrowthEvidenceStatus: "verified",
      freshness: "fresh",
      limitations: ["외부 검색 수요 미검증"],
      classificationVersion: 1,
    });
    expect(hasCurrentContentOpportunityFingerprint(classified)).toBe(true);
    expect(classified.fingerprint).not.toBe(candidate().fingerprint);
  });

  it("produces the same canonical fingerprint regardless of Evidence array order", () => {
    const evidence = [
      { source: "inferred" as const, summary: "첫 번째 근거", evidenceId: "evidence-a" },
      { source: "inferred" as const, summary: "두 번째 근거", evidenceId: "evidence-b" },
    ];
    const left = createContentOpportunityCandidate({ ...candidate(), opportunityEvidence: evidence, evidenceIds: ["evidence-b", "evidence-a"] });
    const right = createContentOpportunityCandidate({ ...candidate(), opportunityEvidence: [...evidence].reverse(), evidenceIds: ["evidence-a", "evidence-b"] });
    expect(left.fingerprint).toBe(right.fingerprint);
    expect(left.opportunityId).toBe(right.opportunityId);
  });

  it("binds the complete opportunity to one Workspace, Project, and Content", () => {
    const confirmed = confirmContentOpportunity(candidate(), { workspaceId: "workspace-1", projectId: "project-1", contentId: "content-1", confirmedAt: "2026-07-18T00:00:00.000Z" });
    expect(assertConfirmedContentOpportunity(confirmed, {
      workspaceId: "workspace-1", projectId: "project-1", contentId: "content-1",
      opportunityId: confirmed.opportunityId, opportunityVersion: confirmed.version, opportunityFingerprint: confirmed.fingerprint,
      primaryKeyword: confirmed.primaryKeyword, selectedTopic: confirmed.selectedTopic, searchIntent: confirmed.searchIntent, secondaryKeywords: confirmed.secondaryKeywords,
    })).toBe(confirmed);
  });

  it("rejects stale or cross-content opportunity bindings", () => {
    const confirmed = confirmContentOpportunity(candidate(), { workspaceId: "workspace-1", projectId: "project-1", contentId: "content-1", confirmedAt: "2026-07-18T00:00:00.000Z" });
    expect(() => assertConfirmedContentOpportunity(confirmed, {
      workspaceId: "workspace-1", projectId: "project-1", contentId: "content-2",
      opportunityId: confirmed.opportunityId, opportunityVersion: confirmed.version, opportunityFingerprint: confirmed.fingerprint,
      primaryKeyword: confirmed.primaryKeyword, selectedTopic: confirmed.selectedTopic, searchIntent: confirmed.searchIntent, secondaryKeywords: confirmed.secondaryKeywords,
    })).toThrow("현재 원고와 일치하지 않습니다");
  });

  it("does not allow a user-specified topic to be paired with another search intent", () => {
    expect(() => createContentOpportunityCandidate({ ...candidate(), selectionMode: "userSpecified", selectedTopic: "만성 염증 관리", primaryKeyword: "장 건강 관리 방법" }))
      .toThrow("같은 검색 의도");
  });

  it("distinguishes delegated topic selection from an explicit topic", () => {
    expect(detectContentOpportunitySelectionMode("기존에 작성하지 않은 주제를 AI가 골라줘")).toBe("automatic");
    expect(detectContentOpportunitySelectionMode("만성 염증 관리 글을 작성해 줘")).toBe("userSpecified");
  });

  it("reclassifies depth without replacing the Planning provider's concrete information contract", () => {
    const source = candidate();
    const planned = createContentOpportunityCandidate({
      ...source,
      qualityTarget: {
        ...source.qualityTarget,
        coreQuestions: ["복용 중인 약과 검사 결과를 함께 해석해야 하는 이유는 무엇인가"],
        requiredContentElements: ["처방약·일반의약품·건강기능식품을 의료진에게 알리는 방법"],
        decisionCriteria: ["복용 지속 여부는 처방 의료진의 지시로 판단"],
        examplesNeeded: ["복용 목록을 진료 전에 정리하는 사례"],
        warningsOrExceptions: ["약과 보충제를 임의로 중단하지 않음"],
        actionableNextSteps: ["제품명·성분·복용 시각을 기록해 상담 때 제시"],
      },
    });

    const classified = applyContentDepthPolicy(planned, { domain: "health" });

    expect(classified.qualityTarget).toMatchObject({
      coreQuestions: planned.qualityTarget.coreQuestions,
      requiredContentElements: planned.qualityTarget.requiredContentElements,
      decisionCriteria: planned.qualityTarget.decisionCriteria,
      examplesNeeded: planned.qualityTarget.examplesNeeded,
      warningsOrExceptions: planned.qualityTarget.warningsOrExceptions,
      actionableNextSteps: planned.qualityTarget.actionableNextSteps,
    });
    expect(classified.qualityTarget.requiredContentElements).not.toContain("복잡한 원인과 관계");
  });

  it("normalizes a legacy candidate whose quality target is missing before depth classification", () => {
    const legacy = {
      ...candidate(),
      qualityTarget: undefined,
    } as unknown as ReturnType<typeof candidate>;

    const classified = applyContentDepthPolicy(legacy, { domain: "health" });

    expect(classified.qualityTarget.contentDepth).toBe("deep");
    expect(classified.qualityTarget.coreQuestions.length).toBeGreaterThan(0);
    expect(classified.qualityTarget.requiredContentElements.length).toBeGreaterThan(0);
  });

  it("does not throw while checking a self-consistent legacy fingerprint with no quality target", () => {
    const legacy = {
      ...candidate(),
      qualityTarget: undefined,
      fingerprint: "fp-1234abcd",
      opportunityId: "opportunity-1234abcd",
    } as unknown as ReturnType<typeof candidate>;

    expect(() => confirmContentOpportunity(legacy, {
      workspaceId: "workspace-1",
      projectId: "project-1",
      contentId: "content-legacy",
      confirmedAt: "2026-07-28T00:00:00.000Z",
    })).not.toThrow();
  });
});
