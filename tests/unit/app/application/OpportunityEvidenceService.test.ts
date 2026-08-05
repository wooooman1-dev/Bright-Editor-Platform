import { describe, expect, it } from "vitest";
import { InMemoryPersistenceStore } from "../../../../core/data";
import { createContentOpportunityCandidate, hasCurrentContentOpportunityFingerprint } from "../../../../core/content";
import { createOpportunityEvidence } from "../../../../core/intelligence";
import { DurableDataSourceConnectionRepository, DurableOpportunityEvidenceRepository, DurableProjectDataSourceReferenceRepository } from "../../../../app/application/data-sources/DataSourceRepositories";
import { OpportunityEvidenceService } from "../../../../app/application/data-sources/OpportunityEvidenceService";
import type { UserData, UserProject } from "../../../../app/user-flow/user-data";

const project: UserProject = { id: "project-1", workspaceId: "workspace-1", name: "건강", description: "건강 관리", strategy: { primaryTopic: "건강", subtopics: ["장 건강", "혈당"], excludedTopics: [], defaultContentType: "guide", defaultPlatform: "tistory", targetLength: "long", targetAudience: "성인", tone: "친절", internalLinkPolicy: "public only", relatedPostPolicy: "public only", ctaPolicy: "optional", imageStrategy: "editorial", seoPolicy: "people first" }, createdAt: "2026-07-18T00:00:00.000Z", updatedAt: "2026-07-18T00:00:00.000Z" };
const data: UserData = { workspace: { id: "workspace-1", name: "Studio" }, brands: [], projects: [project], contents: [] };
const candidate = (topic: string) => createContentOpportunityCandidate({ sourceRequest: "오늘의 건강 글", selectionMode: "automatic", selectedTopic: topic, primaryKeyword: `${topic} 방법`, secondaryKeywords: [], searchIntent: `${topic} 실천 방법 탐색`, audience: "성인", contentType: "guide", contentAngle: "실천 안내", readerProblem: "기준 부족", expectedCoverage: [topic], selectionRationale: "콘텐츠 공백", opportunityEvidence: [{ source: "unknown", summary: "서버 판정 전" }], confidence: 0.8, cautions: [], projectId: project.id });

describe("server-owned Opportunity Evidence classification", () => {
  it("allows all three candidates to be blog-growth recommendations without forced type balancing", async () => {
    const store = new InMemoryPersistenceStore(), service = new OpportunityEvidenceService(new DurableDataSourceConnectionRepository(store), new DurableProjectDataSourceReferenceRepository(store), new DurableOpportunityEvidenceRepository(store));
    const bundle = await service.buildPlanningBundle(data, project);
    const values = service.classifyCandidates([candidate("장 건강"), candidate("혈당 건강"), candidate("수면 건강")], bundle, data, project);
    expect(values).toHaveLength(3);
    expect(values.every((value) => value.recommendationType === "blogGrowth")).toBe(true);
    expect(values.every((value) => value.marketEvidenceStatus === "unavailable")).toBe(true);
    expect(values.every(hasCurrentContentOpportunityFingerprint)).toBe(true);
    expect(values.every((value) => value.limitations.some((limitation) => limitation.includes("external market demand")))).toBe(true);
  });

  it("uses only a Project-referenced connection and produces comprehensive when external and internal Evidence both match", async () => {
    const store = new InMemoryPersistenceStore(), connections = new DurableDataSourceConnectionRepository(store), references = new DurableProjectDataSourceReferenceRepository(store), evidence = new DurableOpportunityEvidenceRepository(store), service = new OpportunityEvidenceService(connections, references, evidence);
    await connections.save({ id: "gsc-1", workspaceId: "workspace-1", provider: "googleSearchConsole", displayName: "GSC", status: "ready", resourceConfiguration: { siteProperty: "sc-domain:example.com" }, enabled: true, lastSuccessfulSyncAt: new Date().toISOString(), createdAt: "now", updatedAt: "now", version: 1 });
    await references.save({ workspaceId: "workspace-1", projectId: "project-1", connectionId: "gsc-1", enabled: true, updatedAt: "now" });
    await evidence.saveMany([createOpportunityEvidence({ workspaceId: "workspace-1", connectionId: "gsc-1", projectId: null, provider: "googleSearchConsole", evidenceType: "searchPerformance", metric: "clicks", keyword: "장 건강 방법", observedAt: new Date().toISOString(), syncedAt: new Date().toISOString(), freshness: "fresh", verified: true, value: 10, unit: "clicks", confidence: 1, limitations: ["site performance"], sourceReference: "snapshot:1", resourceScope: "query" })]);
    const withPublished: UserData = { ...data, contents: [{ id: "published-1", workspaceId: "workspace-1", projectId: "project-1", title: "장 건강 기초", body: "", status: "draft_saved", primaryKeyword: "장 건강", publishedUrl: "https://example.com/gut", updatedAt: "now" }] };
    const bundle = await service.buildPlanningBundle(withPublished, project);
    expect(service.classifyCandidates([candidate("장 건강")], bundle, withPublished, project)[0].recommendationType).toBe("comprehensive");
  });

  it("includes latest GSC and NAVER Evidence from Connections owned by the current Project without literal Project-name overlap", async () => {
    const financeProject: UserProject = {
      ...project,
      id: "project-finance",
      name: "밝은재테크",
      description: "생활경제·재테크 콘텐츠 운영",
      strategy: { ...project.strategy!, primaryTopic: "밝은재테크", subtopics: ["생활경제·재테크 콘텐츠 운영"] },
    };
    const financeData: UserData = { ...data, projects: [financeProject] };
    const store = new InMemoryPersistenceStore();
    const connections = new DurableDataSourceConnectionRepository(store);
    const references = new DurableProjectDataSourceReferenceRepository(store);
    const evidence = new DurableOpportunityEvidenceRepository(store);
    const service = new OpportunityEvidenceService(connections, references, evidence);
    await connections.save({ id: "gsc-finance", workspaceId: "workspace-1", provider: "googleSearchConsole", displayName: "GSC", status: "ready", resourceConfiguration: { siteProperty: "sc-domain:finance.example" }, enabled: true, lastSuccessfulSyncAt: "2026-08-05T00:00:00.000Z", createdAt: "now", updatedAt: "now", version: 1 });
    await connections.save({ id: "naver-finance", workspaceId: "workspace-1", provider: "naverSearchTrend", displayName: "NAVER", status: "ready", resourceConfiguration: { keywords: ["예금"] }, enabled: true, lastSuccessfulSyncAt: "2026-08-05T00:01:00.000Z", createdAt: "now", updatedAt: "now", version: 1 });
    await references.save({ workspaceId: "workspace-1", projectId: financeProject.id, connectionId: "gsc-finance", enabled: true, updatedAt: "2026-08-05T00:00:00.000Z" });
    await references.save({ workspaceId: "workspace-1", projectId: financeProject.id, connectionId: "naver-finance", enabled: true, updatedAt: "2026-08-05T00:01:00.000Z" });
    const gsc = createOpportunityEvidence({ workspaceId: "workspace-1", connectionId: "gsc-finance", projectId: null, provider: "googleSearchConsole", evidenceType: "searchPerformance", metric: "impressions", keyword: "휴면예금", observedAt: "2026-08-05", syncedAt: new Date().toISOString(), freshness: "fresh", verified: true, value: 12, unit: "siteImpressions", confidence: 1, limitations: ["Search Console impressions are site performance, not total market demand."], sourceReference: "snapshot-gsc-latest:row-0:impressions", resourceScope: "query" });
    const naver = createOpportunityEvidence({ workspaceId: "workspace-1", connectionId: "naver-finance", projectId: null, provider: "naverSearchTrend", evidenceType: "relativeTrend", metric: "searchTrendRatio", keyword: "예금", observedAt: "2026-08-05", syncedAt: new Date().toISOString(), freshness: "fresh", verified: true, value: 65.2, relativeValue: 65.2, unit: "relativeRatio", confidence: 1, limitations: ["NAVER ratio is relative and is not absolute search volume."], sourceReference: "snapshot-naver-latest:row-0", resourceScope: "query" });
    await evidence.saveMany([gsc, naver]);

    const bundle = await service.buildPlanningBundle(financeData, financeProject);

    expect(bundle).toEqual(expect.arrayContaining([
      expect.objectContaining({ evidenceId: gsc.evidenceId, connectionId: "gsc-finance" }),
      expect.objectContaining({ evidenceId: naver.evidenceId, connectionId: "naver-finance" }),
    ]));
  });

  it("excludes Evidence from another Workspace from the Planning bundle", async () => {
    const store = new InMemoryPersistenceStore();
    const connections = new DurableDataSourceConnectionRepository(store);
    const references = new DurableProjectDataSourceReferenceRepository(store);
    const evidence = new DurableOpportunityEvidenceRepository(store);
    const service = new OpportunityEvidenceService(connections, references, evidence);
    await connections.save({ id: "foreign", workspaceId: "workspace-2", provider: "naverSearchTrend", displayName: "Foreign NAVER", status: "ready", resourceConfiguration: { keywords: ["장 건강"] }, enabled: true, createdAt: "now", updatedAt: "now", version: 1 });
    await references.save({ workspaceId: "workspace-2", projectId: project.id, connectionId: "foreign", enabled: true, updatedAt: "now" });
    const foreign = createOpportunityEvidence({ workspaceId: "workspace-2", connectionId: "foreign", projectId: null, provider: "naverSearchTrend", evidenceType: "relativeTrend", keyword: "장 건강", observedAt: "2026-08-05", syncedAt: new Date().toISOString(), freshness: "fresh", verified: true, value: 50, unit: "relativeRatio", confidence: 1, limitations: [], sourceReference: "snapshot-foreign", resourceScope: "query" });
    await evidence.saveMany([foreign]);

    const bundle = await service.buildPlanningBundle(data, project);

    expect(bundle.some((value) => value.evidenceId === foreign.evidenceId)).toBe(false);
  });

  it("excludes Evidence owned by another Project in the same Workspace", async () => {
    const otherProject: UserProject = { ...project, id: "project-2", name: "다른 Project" };
    const store = new InMemoryPersistenceStore();
    const connections = new DurableDataSourceConnectionRepository(store);
    const references = new DurableProjectDataSourceReferenceRepository(store);
    const evidence = new DurableOpportunityEvidenceRepository(store);
    const service = new OpportunityEvidenceService(connections, references, evidence);
    await connections.save({ id: "naver-other", workspaceId: "workspace-1", provider: "naverSearchTrend", displayName: "NAVER", status: "ready", resourceConfiguration: { keywords: ["장 건강"] }, enabled: true, createdAt: "now", updatedAt: "now", version: 1 });
    await references.save({ workspaceId: "workspace-1", projectId: otherProject.id, connectionId: "naver-other", enabled: true, updatedAt: "now" });
    const otherEvidence = createOpportunityEvidence({ workspaceId: "workspace-1", connectionId: "naver-other", projectId: null, provider: "naverSearchTrend", evidenceType: "relativeTrend", keyword: "장 건강", observedAt: "2026-08-05", syncedAt: new Date().toISOString(), freshness: "fresh", verified: true, value: 50, unit: "relativeRatio", confidence: 1, limitations: [], sourceReference: "snapshot-other", resourceScope: "query" });
    await evidence.saveMany([otherEvidence]);

    const bundle = await service.buildPlanningBundle({ ...data, projects: [project, otherProject] }, project);

    expect(bundle.some((value) => value.evidenceId === otherEvidence.evidenceId)).toBe(false);
  });

  it("keeps GSC-only Evidence as site search performance rather than market search demand", async () => {
    const store = new InMemoryPersistenceStore();
    const connections = new DurableDataSourceConnectionRepository(store);
    const references = new DurableProjectDataSourceReferenceRepository(store);
    const evidence = new DurableOpportunityEvidenceRepository(store);
    const service = new OpportunityEvidenceService(connections, references, evidence);
    await connections.save({ id: "gsc-only", workspaceId: "workspace-1", provider: "googleSearchConsole", displayName: "GSC", status: "ready", resourceConfiguration: { siteProperty: "sc-domain:example.com" }, enabled: true, createdAt: "now", updatedAt: "now", version: 1 });
    await references.save({ workspaceId: "workspace-1", projectId: project.id, connectionId: "gsc-only", enabled: true, updatedAt: "now" });
    await evidence.saveMany([createOpportunityEvidence({ workspaceId: "workspace-1", connectionId: "gsc-only", projectId: null, provider: "googleSearchConsole", evidenceType: "searchPerformance", metric: "impressions", keyword: "장 건강", observedAt: "2026-08-05", syncedAt: new Date().toISOString(), freshness: "fresh", verified: true, value: 120, unit: "siteImpressions", confidence: 1, limitations: ["Search Console impressions are site performance, not total market demand."], sourceReference: "snapshot-gsc:row-0:impressions", resourceScope: "query" })]);

    const classified = service.classifyCandidates([candidate("장 건강")], await service.buildPlanningBundle(data, project), data, project)[0];
    const gscEvidence = classified.opportunityEvidence.find((value) => value.provider === "googleSearchConsole");

    expect(gscEvidence).toMatchObject({ evidenceType: "searchPerformance", metric: "impressions" });
    expect(gscEvidence?.evidenceType).not.toBe("searchDemand");
    expect(gscEvidence?.limitation).toContain("not total market demand");
  });

  it("uses fresh NAVER relative trend Evidence without falling back to unavailable or zero confidence", async () => {
    const store = new InMemoryPersistenceStore();
    const connections = new DurableDataSourceConnectionRepository(store);
    const references = new DurableProjectDataSourceReferenceRepository(store);
    const evidence = new DurableOpportunityEvidenceRepository(store);
    const service = new OpportunityEvidenceService(connections, references, evidence);
    await connections.save({ id: "naver-current", workspaceId: "workspace-1", provider: "naverSearchTrend", displayName: "NAVER", status: "ready", resourceConfiguration: { keywords: ["장 건강"] }, enabled: true, createdAt: "now", updatedAt: "now", version: 1 });
    await references.save({ workspaceId: "workspace-1", projectId: project.id, connectionId: "naver-current", enabled: true, updatedAt: "now" });
    await evidence.saveMany([createOpportunityEvidence({ workspaceId: "workspace-1", connectionId: "naver-current", projectId: null, provider: "naverSearchTrend", evidenceType: "relativeTrend", metric: "searchTrendRatio", keyword: "장 건강", observedAt: "2026-08-05", syncedAt: new Date().toISOString(), freshness: "fresh", verified: true, value: 72, relativeValue: 72, unit: "relativeRatio", confidence: 1, limitations: ["NAVER ratio is relative and is not absolute search volume."], sourceReference: "snapshot-naver:row-0", resourceScope: "query" })]);

    const classified = service.classifyCandidates([candidate("장 건강")], await service.buildPlanningBundle(data, project), data, project)[0];

    expect(classified).toMatchObject({ freshness: "fresh", marketEvidenceStatus: "verified" });
    expect(classified.confidence).toBeGreaterThan(0);
    expect(classified.limitations).not.toContain("외부 시장 데이터가 확인되지 않았습니다. 검색 수요는 검증되지 않았습니다.");
    expect(classified.opportunityEvidence.find((value) => value.provider === "naverSearchTrend")).toMatchObject({ evidenceType: "relativeTrend" });
  });

  it("rejects Evidence IDs from another Workspace", async () => {
    const store = new InMemoryPersistenceStore(), evidence = new DurableOpportunityEvidenceRepository(store), service = new OpportunityEvidenceService(new DurableDataSourceConnectionRepository(store), new DurableProjectDataSourceReferenceRepository(store), evidence);
    const foreign = createOpportunityEvidence({ workspaceId: "workspace-2", projectId: "project-2", provider: "brightStudio", evidenceType: "contentGap", observedAt: "now", syncedAt: "now", freshness: "fresh", verified: true, confidence: 1, limitations: [], sourceReference: "foreign", resourceScope: "project" });
    await evidence.saveMany([foreign]);
    await expect(service.assertWorkspaceEvidenceIds("workspace-1", [foreign.evidenceId])).rejects.toThrow("cross-Workspace");
  });

  it("rejects Evidence IDs bound to another Project in the same Workspace", async () => {
    const store = new InMemoryPersistenceStore(), evidence = new DurableOpportunityEvidenceRepository(store), service = new OpportunityEvidenceService(new DurableDataSourceConnectionRepository(store), new DurableProjectDataSourceReferenceRepository(store), evidence);
    const foreign = createOpportunityEvidence({ workspaceId: "workspace-1", projectId: "project-2", provider: "brightStudio", evidenceType: "contentGap", observedAt: "now", syncedAt: "now", freshness: "fresh", verified: true, confidence: 1, limitations: [], sourceReference: "foreign-project", resourceScope: "project" });
    await evidence.saveMany([foreign]);
    await expect(service.assertOpportunityEvidenceBindings("workspace-1", [{ projectId: "project-1", evidenceIds: [foreign.evidenceId] }]))
      .rejects.toThrow("cross-Project");
  });
});
