import { describe, expect, it, vi } from "vitest";
import { approvalPolicyPromptContext, resolveApprovalPolicySnapshot } from "../../../../core/approval";
import { explicitPlanningFormat, extendPlanningSchemaWithVerificationClaims, planningOutputFormat } from "../../../../app/application/PlanningContracts";
import { OpenAIProvider } from "../../../../app/application/OpenAIProvider";
import { attachApprovalEvidenceContracts, ContentPlanningStrategy, parsePlanningResult } from "../../../../app/application/ContentPlanningStrategy";

const candidate = { selectedTopic: "서울 청년 지원", primaryKeyword: "서울 청년 지원 조건", secondaryKeywords: [], searchIntent: "지원 조건 확인", audience: "청년", contentType: "guide", contentAngle: "조건 안내", readerProblem: "자격을 모름", expectedCoverage: ["신청 절차"], selectionRationale: "주제", opportunityEvidence: [], confidence: 0.5, cautions: [], verificationClaims: [{ atomicity: "single_assertion", field: "지원 금액", kind: "money", statement: "현재 지원 금액은 최대 500000원이다.", rawValue: "500000원", qualifiers: {}, temporalRequirement: { mode: "current" }, required: true }] };
const planning = { interpretedIntent: "지원 정보", domain: "생활경제", targetAudience: "청년", contentGoal: "조건 안내", recommendedPlatforms: [], suggestedTitleAngles: ["서울 청년 지원"], contentCluster: [], recommendationReason: "주제", confidence: 0.5, estimateDisclosure: "AI estimate", opportunityCandidates: [candidate] };

describe("explicit planning contract", () => {
  it("extends the complete planning schema without mutating the base and satisfies strict required fields", () => {
    const before = JSON.stringify(planningOutputFormat);
    const extended = extendPlanningSchemaWithVerificationClaims(planningOutputFormat);
    expect(JSON.stringify(planningOutputFormat)).toBe(before);
    expect(extended.schema.properties).toHaveProperty("interpretedIntent");
    expect(extended.schema.properties.opportunityCandidates.items.properties).toHaveProperty("verificationClaims");
    expect(extended.schema.required).toEqual(Object.keys(extended.schema.properties));
    expect(extended.schema.properties.opportunityCandidates.items.required)
      .toEqual(Object.keys(extended.schema.properties.opportunityCandidates.items.properties));
    expect(extended.schema.properties.opportunityCandidates.items.properties.verificationClaims.items.required)
      .toEqual(["atomicity", "field", "kind", "statement", "rawValue", "qualifiers", "temporalRequirement", "required", "risk", "policyId"]);
    expect(extended.schema.properties.opportunityCandidates.items.properties.verificationClaims.items.properties.qualifiers.required)
      .toEqual(["subject", "scope", "basis", "note"]);
    expect(extended.schema.properties.opportunityCandidates.items.properties.verificationClaims.items.properties.temporalRequirement.required)
      .toEqual(["mode", "date", "start", "end"]);
    expect(extended.schema.properties.opportunityCandidates.items.properties.verificationClaims.items.properties.temporalRequirement.properties.mode.enum).toEqual(["current", "asOf", "period", "notRequired", "unknown"]);
    expect(Object.keys(extended.schema.properties.opportunityCandidates.items.properties)).toEqual([...Object.keys(planningOutputFormat.schema.properties.opportunityCandidates.items.properties), "verificationClaims"]);
    expect(extended.schema.properties).toHaveProperty("recommendedPrimaryKeyword");
    expect(extended.schema.properties).toHaveProperty("keywordCandidates");
    expect(extended.schema.properties).toHaveProperty("recommendedContentType");
    expect(extended.schema.properties).toHaveProperty("relatedKeywords");
    expect(planningOutputFormat.schema.properties.opportunityCandidates.items.required).toEqual(["selectedTopic", "primaryKeyword", "searchIntent", "audience", "contentType", "contentAngle", "readerProblem", "selectionRationale"]);
    expect(planningOutputFormat.schema.additionalProperties).toBe(false);
    expect(planningOutputFormat.schema.properties.opportunityCandidates.items.additionalProperties).toBe(false);
  });

  it("keeps a critical claim kind critical even when planning answers verify", () => {
    const eligibility = { ...candidate.verificationClaims[0], field: "청약통장 가입기간의 청약 적용", kind: "eligibility", statement: "청약통장 가입기간은 일부 주택 청약에서 자격 판단 요소로 활용될 수 있다.", rawValue: "", risk: "verify", required: false };
    const parsed = parsePlanningResult(JSON.stringify({ ...planning, opportunityCandidates: [{ ...candidate, verificationClaims: [eligibility] }] }), { projectId: "p", selectionMode: "automatic", explicitVerificationPlanningEnabled: true });
    expect(parsed.opportunityCandidates?.[0].verificationPlan?.claims[0]).toMatchObject({ risk: "critical", required: true });
  });

  it("leaves a claim kind that is not critical by nature at the risk planning chose", () => {
    const general = { ...candidate.verificationClaims[0], field: "청약 안내 확인 경로", kind: "general", statement: "청약 관련 조건은 모집공고에서 확인할 수 있다.", rawValue: "", risk: "verify", required: false };
    const parsed = parsePlanningResult(JSON.stringify({ ...planning, opportunityCandidates: [{ ...candidate, verificationClaims: [general] }] }), { projectId: "p", selectionMode: "automatic", explicitVerificationPlanningEnabled: true });
    expect(parsed.opportunityCandidates?.[0].verificationPlan?.claims[0]).toMatchObject({ risk: "verify", required: false });
  });

  it("parses explicit claims, temporal requirements, empty plans, and rejects malformed explicit responses", () => {
    const parsed = parsePlanningResult(JSON.stringify(planning), { projectId: "p", selectionMode: "automatic", explicitVerificationPlanningEnabled: true });
    expect(parsed.opportunityCandidates?.[0].verificationPlan?.mode).toBe("explicit");
    expect(parsed.opportunityCandidates?.[0].verificationPlan?.claims[0]).toMatchObject({ temporalRequirement: { mode: "current" } });
    expect(parsed.opportunityCandidates?.[0].verificationPlan?.claims[0]).not.toHaveProperty("status");
    expect(Object.isFrozen(parsed.opportunityCandidates?.[0].verificationPlan?.claims[0]?.temporalRequirement)).toBe(true);
    const empty = parsePlanningResult(JSON.stringify({ ...planning, opportunityCandidates: [{ ...candidate, verificationClaims: [] }] }), { projectId: "p", selectionMode: "automatic", explicitVerificationPlanningEnabled: true });
    expect(empty.opportunityCandidates?.[0].verificationPlan).toMatchObject({ mode: "explicit", claims: [] });
    expect(empty.opportunityCandidates?.[0].verificationPlan?.fingerprint).toMatch(/^vfp-/);
    expect(() => parsePlanningResult(JSON.stringify({ ...planning, opportunityCandidates: [{ ...candidate, verificationClaims: undefined }] }), { projectId: "p", selectionMode: "automatic", explicitVerificationPlanningEnabled: true })).toThrow();
    expect(() => parsePlanningResult(JSON.stringify({ ...planning, opportunityCandidates: [{ ...candidate, verificationClaims: [{ ...candidate.verificationClaims[0], atomicity: undefined }] }] }), { projectId: "p", selectionMode: "automatic", explicitVerificationPlanningEnabled: true })).toThrow("atomicity");
    expect(() => parsePlanningResult(JSON.stringify({ ...planning, opportunityCandidates: [{ ...candidate, verificationClaims: [{ ...candidate.verificationClaims[0], kind: "bad" }] }] }), { projectId: "p", selectionMode: "automatic", explicitVerificationPlanningEnabled: true })).toThrow();
    expect(() => parsePlanningResult(JSON.stringify({ ...planning, opportunityCandidates: [{ ...candidate, verificationClaims: [{ ...candidate.verificationClaims[0], temporalRequirement: undefined }] }] }), { projectId: "p", selectionMode: "automatic", explicitVerificationPlanningEnabled: true })).toThrow("temporalRequirement");
    expect(() => parsePlanningResult(JSON.stringify({ ...planning, opportunityCandidates: [{ ...candidate, verificationClaims: [{ ...candidate.verificationClaims[0], temporalRequirement: { mode: "asOf", date: "2026-02-30" } }] }] }), { projectId: "p", selectionMode: "automatic", explicitVerificationPlanningEnabled: true })).toThrow();
    const historical = parsePlanningResult(JSON.stringify({ ...planning, opportunityCandidates: [{ ...candidate, verificationClaims: [{ ...candidate.verificationClaims[0], temporalRequirement: { mode: "asOf", date: "2023-12-31" } }] }] }), { projectId: "p", selectionMode: "automatic", explicitVerificationPlanningEnabled: true });
    expect(historical.opportunityCandidates?.[0].verificationPlan?.claims[0]?.temporalRequirement).toEqual({ mode: "asOf", date: "2023-12-31" });
    const reordered = { ...planning, opportunityCandidates: [{ ...candidate, verificationClaims: [{ ...candidate.verificationClaims[0], statement: "현재   지원 금액은 최대 500000원이다." }] }] };
    expect(parsePlanningResult(JSON.stringify(reordered), { projectId: "p", selectionMode: "automatic", explicitVerificationPlanningEnabled: true }).opportunityCandidates?.[0].verificationPlan?.claims[0].claimId).toBe(parsed.opportunityCandidates?.[0].verificationPlan?.claims[0].claimId);
    expect(parsePlanningResult(JSON.stringify({ ...planning, opportunityCandidates: [{ ...candidate, verificationClaims: [{ ...candidate.verificationClaims[0], field: " 지원 금액 ", statement: " 현재   지원 금액은 최대 500000원이다. ", rawValue: " 500000원 ", policyId: " policy ", qualifiers: { scope: " 서울 " } }] }] }), { projectId: "p", selectionMode: "automatic", explicitVerificationPlanningEnabled: true }).opportunityCandidates?.[0].verificationPlan?.claims[0].claimId).toBe(parsePlanningResult(JSON.stringify({ ...planning, opportunityCandidates: [{ ...candidate, verificationClaims: [{ ...candidate.verificationClaims[0], qualifiers: { scope: "서울" }, policyId: "policy" }] }] }), { projectId: "p", selectionMode: "automatic", explicitVerificationPlanningEnabled: true }).opportunityCandidates?.[0].verificationPlan?.claims[0].claimId);
    expect(parsePlanningResult(JSON.stringify({ ...planning, opportunityCandidates: [{ ...candidate, verificationClaims: [{ ...candidate.verificationClaims[0], rawValue: "different" }] }] }), { projectId: "p", selectionMode: "automatic", explicitVerificationPlanningEnabled: true }).opportunityCandidates?.[0].verificationPlan?.claims[0].claimId).not.toBe(parsed.opportunityCandidates?.[0].verificationPlan?.claims[0].claimId);
    expect(parsePlanningResult(JSON.stringify({ ...planning, opportunityCandidates: [{ ...candidate, verificationClaims: [{ ...candidate.verificationClaims[0], temporalRequirement: { mode: "unknown" } }] }] }), { projectId: "p", selectionMode: "automatic", explicitVerificationPlanningEnabled: true }).opportunityCandidates?.[0].verificationPlan?.claims[0].claimId).not.toBe(parsed.opportunityCandidates?.[0].verificationPlan?.claims[0].claimId);
    expect(() => parsePlanningResult(JSON.stringify({ ...planning, opportunityCandidates: [{ ...candidate, verificationClaims: [candidate.verificationClaims[0], candidate.verificationClaims[0]] }] }), { projectId: "p", selectionMode: "automatic", explicitVerificationPlanningEnabled: true })).toThrow("Duplicate verification claim");
    expect(parsePlanningResult(JSON.stringify(planning), { projectId: "p", selectionMode: "automatic", explicitVerificationPlanningEnabled: false }).opportunityCandidates?.[0].verificationPlan).toBeUndefined();
    expect(parsePlanningResult(JSON.stringify(planning), { projectId: "p", selectionMode: "automatic", explicitVerificationPlanningEnabled: false }).opportunityCandidates?.[0].fingerprint).toBe(parsePlanningResult(JSON.stringify(planning), { projectId: "p", selectionMode: "automatic", explicitVerificationPlanningEnabled: true }).opportunityCandidates?.[0].fingerprint);
  });

  it("selects explicit and legacy formats from metadata with one provider call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ output_text: JSON.stringify(planning) }), { status: 200 }));
    await new OpenAIProvider("sk-test", "gpt-test").generate({ instruction: "plan", metadata: { task: "content-planning", explicitVerificationPlanning: "1" } });
    const explicitBody = JSON.parse(new TextDecoder().decode(fetchSpy.mock.calls[0]?.[1]?.body as Uint8Array));
    expect(explicitBody.text.format).toEqual(explicitPlanningFormat);
    await new OpenAIProvider("sk-test", "gpt-test").generate({ instruction: "plan", metadata: { task: "content-planning" } });
    const legacyBody = JSON.parse(new TextDecoder().decode(fetchSpy.mock.calls[1]?.[1]?.body as Uint8Array));
    expect(legacyBody.text).toBeUndefined();
    await new OpenAIProvider("sk-test", "gpt-test").generate({ instruction: "plan", metadata: { task: "content-planning", explicitVerificationPlanning: "0" } });
    expect(JSON.parse(new TextDecoder().decode(fetchSpy.mock.calls[2]?.[1]?.body as Uint8Array)).text).toBeUndefined();
    await new OpenAIProvider("sk-test", "gpt-test").generate({ instruction: "plan", metadata: { task: "content-planning", explicitVerificationPlanning: "false" } });
    expect(JSON.parse(new TextDecoder().decode(fetchSpy.mock.calls[3]?.[1]?.body as Uint8Array)).text).toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    fetchSpy.mockRestore();
  });

  it("uses the same flag for the Planning prompt and provider metadata", async () => {
    const generate = vi.fn(async (request: { instruction: string; metadata?: Readonly<Record<string, string>> }) => { void request; return { content: JSON.stringify(planning), diagnostics: {} }; });
    const strategy = new ContentPlanningStrategy({ generate } as never);
    await strategy.analyze("서울 청년 지원", undefined, { projectId: "p", selectionMode: "automatic", explicitVerificationPlanningEnabled: true });
    expect(generate.mock.calls[0]?.[0].instruction).toContain("Verification claims rule");
    expect(generate.mock.calls[0]?.[0].instruction).toContain("temporalRequirement");
    expect(generate.mock.calls[0]?.[0].metadata?.explicitVerificationPlanning).toBe("1");
    generate.mockClear();
    await strategy.analyze("서울 청년 지원", undefined, { projectId: "p", selectionMode: "automatic", explicitVerificationPlanningEnabled: false });
    expect(generate.mock.calls[0]?.[0].instruction).not.toContain("Verification claims rule");
    expect(generate.mock.calls[0]?.[0].metadata).not.toHaveProperty("explicitVerificationPlanning");
  });

  it("forces explicit verification Planning when canonical approval context is present", async () => {
    const generate = vi.fn(async (request: { instruction: string; metadata?: Readonly<Record<string, string>> }) => { void request; return { content: JSON.stringify(planning), diagnostics: {} }; });
    const strategy = new ContentPlanningStrategy({ generate } as never);
    const approvalPolicy = approvalPolicyPromptContext(resolveApprovalPolicySnapshot("adsense_approval", "wordpress_life_economy_v1")!);
    const projectContext = JSON.stringify({ projectStrategy: { approvalPolicy } });

    const result = await strategy.analyze("서울 청년 지원", undefined, {
      projectId: "p",
      selectionMode: "automatic",
      projectContext,
      explicitVerificationPlanningEnabled: false,
    });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0]?.[0].instruction).toContain("Verification claims rule");
    expect(generate.mock.calls[0]?.[0].instruction).toContain("Approval evidence policy is risk-based");
    expect(generate.mock.calls[0]?.[0].instruction).toContain("explicit empty array is a valid completed N/A state");
    expect(generate.mock.calls[0]?.[0].metadata?.explicitVerificationPlanning).toBe("1");
    expect(result.opportunityCandidates?.[0].verificationPlan?.mode).toBe("explicit");
    expect(result.opportunityCandidates?.[0].requiredEvidenceContract).toMatchObject({
      profileSourceRequirementApplicable: true,
      explicitVerificationRequired: true,
      policyId: "adsense_approval_mode",
      profileId: "wordpress_life_economy_v1",
    });
    expect(result.opportunityCandidates?.[0].requiredEvidenceContract?.contractId).toMatch(/^approval-evidence-contract-/);
  });

  it("preserves a topic-specific factual Claim for an approval-profile loan comparison", () => {
    const loanPlanning = {
      ...planning,
      opportunityCandidates: [{
        ...candidate,
        selectedTopic: "대출 상환 방식 비교 방법: 월 납입액·총이자·상환 여력을 기준으로 고르기",
        primaryKeyword: "대출 상환 방식 비교 방법",
        searchIntent: "대출 상환 방식별 월 납입액과 총이자를 비교해 선택하는 방법",
        readerProblem: "상환 방식에 따라 달라지는 월 부담과 총이자를 비교하기 어려움",
        verificationClaims: [{
          atomicity: "single_assertion",
          field: "repaymentMethodDefinition",
          kind: "general",
          statement: "원금균등상환은 매월 같은 원금과 남은 원금에 대한 이자를 함께 갚는 방식이다.",
          rawValue: "원금균등상환",
          qualifiers: { subject: "대출 상환 방식", scope: "일반 금융 정보", basis: "공식 금융기관 안내", note: "상환 방식 비교 기준" },
          temporalRequirement: { mode: "notRequired" },
          required: true,
        }],
      }],
    };
    const parsed = parsePlanningResult(JSON.stringify(loanPlanning), {
      projectId: "loan-project",
      selectionMode: "automatic",
      explicitVerificationPlanningEnabled: true,
      projectContext: approvalPolicyPromptContext(resolveApprovalPolicySnapshot("adsense_approval", "wordpress_life_economy_v1")!),
      sourceRequest: "대출 상환 방식 비교 방법",
    });
    const snapshot = resolveApprovalPolicySnapshot("adsense_approval", "wordpress_life_economy_v1")!;
    const planned = attachApprovalEvidenceContracts(parsed, snapshot).opportunityCandidates![0]!;

    expect(planned.verificationPlan?.claims).toHaveLength(1);
    expect(planned.verificationPlan?.claims[0]).toMatchObject({
      field: "repaymentMethodDefinition",
      kind: "general",
      required: true,
    });
    expect(planned.requiredEvidenceContract).toMatchObject({
      profileSourceRequirementApplicable: true,
      requiredClaims: [{ field: "repaymentMethodDefinition" }],
    });
    expect(planned.requiredEvidenceContract?.requiredClaims[0]).toMatchObject({
      claimId: planned.verificationPlan?.claims[0]?.claimId,
      statement: "원금균등상환은 매월 같은 원금과 남은 원금에 대한 이자를 함께 갚는 방식이다.",
    });
  });
});
