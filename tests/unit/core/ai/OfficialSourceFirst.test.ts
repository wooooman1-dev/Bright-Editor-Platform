import { describe, expect, it } from "vitest";
import { runOfficialSourceFirstDiscovery } from "../../../../core/ai/ApprovalSourcePreflight";
import { resolveApprovalPolicySnapshot } from "../../../../core/approval";
import { createContentOpportunityCandidate, createContentOpportunityVerificationPlan, confirmContentOpportunity } from "../../../../core/content";
import type { AIProvider } from "../../../../core/ai/AIProvider";

const snapshot = resolveApprovalPolicySnapshot("adsense_approval", "wordpress_life_economy_v1")!;
const opportunity = confirmContentOpportunity(createContentOpportunityCandidate({
  sourceRequest: "예금자보호 제도 안내",
  selectionMode: "userSpecified",
  selectedTopic: "예금자보호 제도 안내",
  primaryKeyword: "예금자보호",
  secondaryKeywords: [],
  searchIntent: "공식 제도 확인",
  audience: "생활경제 독자",
  contentType: "article",
  contentAngle: "공식 기준 중심 안내",
  readerProblem: "공식 기준을 찾기 어렵다",
  expectedCoverage: ["제도"],
  selectionRationale: "official source first",
  opportunityEvidence: [{ source: "unknown", summary: "topic" }],
  confidence: 1,
  cautions: [],
  projectId: "project-1",
  verificationPlan: createContentOpportunityVerificationPlan([]),
}), { workspaceId: "workspace-1", projectId: "project-1", contentId: "content-1", confirmedAt: "2026-08-17T00:00:00.000Z" });

class Provider implements AIProvider {
  constructor(private readonly content: string) {}
  async generate() { return { content: this.content, model: "fixture" }; }
}

describe("AdSense Official Source First", () => {
  it("discovers and acquires only an authoritative source before Claims exist", async () => {
    const result = await runOfficialSourceFirstDiscovery({
      provider: new Provider(JSON.stringify({ sources: [{ url: "https://www.gov.kr/guide", title: "정부 공식 안내" }] })),
      snapshot,
      opportunity,
      fetcher: async () => new Response("<html><body>공식 예금자보호 제도 안내 본문</body></html>", { status: 200, headers: { "content-type": "text/html" } }),
    });
    expect(result.sourcePolicyCompliance).toBe("passed");
    expect(result.sources).toHaveLength(1);
    expect(result.claimSources).toEqual([]);
    expect(result.sources[0]?.url).toBe("https://www.gov.kr/guide");
    expect(result.sources[0]?.excerpt).toContain("공식 예금자보호");
  });

  it("blocks when no official source can be acquired", async () => {
    await expect(runOfficialSourceFirstDiscovery({
      provider: new Provider(JSON.stringify({ sources: [{ url: "https://example.com/blog", title: "일반 글" }] })),
      snapshot,
      opportunity,
      fetcher: async () => new Response("<html><body>일반 글</body></html>", { status: 200, headers: { "content-type": "text/html" } }),
    })).rejects.toThrow("No authoritative source");
  });

  it("rejects a dead official URL instead of falling back to a general page", async () => {
    await expect(runOfficialSourceFirstDiscovery({
      provider: new Provider(JSON.stringify({ sources: [{ url: "https://www.gov.kr/dead", title: "정부 안내" }] })),
      snapshot,
      opportunity,
      fetcher: async () => new Response("Not Found", { status: 404 }),
    })).rejects.toThrow("No authoritative source");
  });
});
