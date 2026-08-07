import { describe, expect, it, vi } from "vitest";
import { explicitPlanningFormat, extendPlanningSchemaWithVerificationClaims, planningOutputFormat } from "../../../../app/application/PlanningContracts";
import { OpenAIProvider } from "../../../../app/application/OpenAIProvider";
import { ContentPlanningStrategy, parsePlanningResult } from "../../../../app/application/ContentPlanningStrategy";

const candidate = { selectedTopic: "서울 청년 지원", primaryKeyword: "서울 청년 지원 조건", secondaryKeywords: [], searchIntent: "지원 조건 확인", audience: "청년", contentType: "guide", contentAngle: "조건 안내", readerProblem: "자격을 모름", expectedCoverage: ["신청 절차"], selectionRationale: "주제", opportunityEvidence: [], confidence: 0.5, cautions: [], verificationClaims: [{ field: "지원 금액", kind: "money", statement: "현재 지원 금액은 최대 500000원이다.", rawValue: "500000원", qualifiers: {}, temporalRequirement: { mode: "current" }, required: true }] };
const planning = { interpretedIntent: "지원 정보", domain: "생활경제", targetAudience: "청년", contentGoal: "조건 안내", recommendedPlatforms: [], suggestedTitleAngles: ["서울 청년 지원"], contentCluster: [], recommendationReason: "주제", confidence: 0.5, estimateDisclosure: "AI estimate", opportunityCandidates: [candidate] };

describe("explicit planning contract", () => {
  it("extends the complete planning schema without mutating the base", () => {
    const before = JSON.stringify(planningOutputFormat);
    const extended = extendPlanningSchemaWithVerificationClaims(planningOutputFormat);
    expect(JSON.stringify(planningOutputFormat)).toBe(before);
    expect(extended.schema.properties).toHaveProperty("interpretedIntent");
    expect(extended.schema.properties.opportunityCandidates.items.properties).toHaveProperty("verificationClaims");
    expect(extended.schema.properties.opportunityCandidates.items.required).toEqual(expect.arrayContaining([...planningOutputFormat.schema.properties.opportunityCandidates.items.required]));
    expect(extended.schema.properties.opportunityCandidates.items.required).toContain("verificationClaims");
    expect(Object.keys(extended.schema.properties.opportunityCandidates.items.properties)).toEqual([...Object.keys(planningOutputFormat.schema.properties.opportunityCandidates.items.properties), "verificationClaims"]);
    expect(extended.schema.properties.opportunityCandidates.items.properties.verificationClaims.items.required).toContain("temporalRequirement");
    expect(extended.schema.properties.opportunityCandidates.items.properties.verificationClaims.items.properties.temporalRequirement.properties.mode.enum).toEqual(["current", "asOf", "period", "notRequired", "unknown"]);
    expect(extended.schema.required).toEqual(planningOutputFormat.schema.required);
    expect(extended.schema.properties).toHaveProperty("recommendedPrimaryKeyword");
    expect(extended.schema.properties).toHaveProperty("keywordCandidates");
    expect(extended.schema.properties).toHaveProperty("recommendedContentType");
    expect(extended.schema.properties).toHaveProperty("relatedKeywords");
    expect(planningOutputFormat.schema.properties.opportunityCandidates.items.required).toEqual(["selectedTopic", "primaryKeyword", "searchIntent", "audience", "contentType", "contentAngle", "readerProblem", "selectionRationale"]);
    expect(planningOutputFormat.schema.additionalProperties).toBe(false);
    expect(planningOutputFormat.schema.properties.opportunityCandidates.items.additionalProperties).toBe(false);
  });

  it("parses explicit claims, temporal requirements, empty plans, and rejects malformed explicit responses", () => {
    const parsed = parsePlanningResult(JSON.stringify(planning), { projectId: "p", selectionMode: "automatic", explicitVerificationPlanningEnabled: true });
    expect(parsed.opportunityCandidates?.[0].verificationPlan?.mode).toBe("explicit");
    expect(parsed.opportunityCandidates?.[0].verificationPlan?.claims[0]).toMatchObject({ temporalRequirement: { mode: "current" } });
    expect(parsed.opportunityCandidates?.[0].verificationPlan?.claims[0]).not.toHaveProperty("status");
    expect(Object.isFrozen(parsed.opportunityCandidates?.[0].verificationPlan?.claims[0]?.temporalRequirement)).toBe(true);
    const empty = parsePlanningResult(JSON.stringify({ ...planning, opportunityCandidates: [{ ...candidate, verificationClaims: [] }] }), { projectId: "p", selectionMode: "automatic", explicitVerificationPlanningEnabled: true });
    expect(empty.opportunityCandidates?.[0].verificationPlan?.claims).toHaveLength(0);
    expect(() => parsePlanningResult(JSON.stringify({ ...planning, opportunityCandidates: [{ ...candidate, verificationClaims: undefined }] }), { projectId: "p", selectionMode: "automatic", explicitVerificationPlanningEnabled: true })).toThrow();
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
});
