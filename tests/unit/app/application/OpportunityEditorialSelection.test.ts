import { describe, expect, it } from "vitest";

import { OpportunityEvidenceService } from "../../../../app/application/data-sources/OpportunityEvidenceService";
import { DurableDataSourceConnectionRepository, DurableOpportunityEvidenceRepository, DurableProjectDataSourceReferenceRepository } from "../../../../app/application/data-sources/DataSourceRepositories";
import type { UserData, UserProject } from "../../../../app/user-flow/user-data";
import { createContentOpportunityCandidate, type ContentOpportunityDraft } from "../../../../core/content";
import { InMemoryPersistenceStore } from "../../../../core/data";
import { createOpportunityEvidence } from "../../../../core/intelligence";

const project: UserProject = {
  id: "project-health",
  workspaceId: "workspace-1",
  name: "Health",
  description: "Practical health information",
  strategy: {
    primaryTopic: "health",
    subtopics: ["screening", "daily care"],
    excludedTopics: [],
    defaultContentType: "guide",
    defaultPlatform: "wordpress",
    targetAudience: "adults",
    tone: "clear",
    internalLinkPolicy: "public only",
    relatedPostPolicy: "public only",
    ctaPolicy: "optional",
    imageStrategy: "editorial",
    seoPolicy: "people first",
  },
  createdAt: "2026-08-09T00:00:00.000Z",
  updatedAt: "2026-08-09T00:00:00.000Z",
};
const data: UserData = { workspace: { id: "workspace-1", name: "Studio" }, brands: [], projects: [project], contents: [] };

function service(): OpportunityEvidenceService {
  const store = new InMemoryPersistenceStore();
  return new OpportunityEvidenceService(
    new DurableDataSourceConnectionRepository(store),
    new DurableProjectDataSourceReferenceRepository(store),
    new DurableOpportunityEvidenceRepository(store),
  );
}

function candidate(overrides: Partial<ContentOpportunityDraft>): ReturnType<typeof createContentOpportunityCandidate> {
  return createContentOpportunityCandidate({
    sourceRequest: "Choose a health topic",
    selectionMode: "automatic",
    selectedTopic: "health screening result check",
    primaryKeyword: "health screening result check",
    secondaryKeywords: [],
    searchIntent: "how to check a missing screening result",
    audience: "adults",
    contentType: "guide",
    contentAngle: "steps to check the result status before contacting support",
    readerProblem: "a result is missing and the reader does not know what to check first",
    expectedCoverage: ["result status", "missing item check", "support preparation"],
    selectionRationale: "solves a concrete reader problem",
    opportunityEvidence: [{ source: "unknown", summary: "server classification pending" }],
    confidence: 0.8,
    cautions: [],
    projectId: project.id,
    ...overrides,
  });
}

const internalGap = createOpportunityEvidence({
  workspaceId: "workspace-1",
  projectId: project.id,
  provider: "brightStudio",
  evidenceType: "contentGap",
  topic: "health",
  observedAt: "2026-08-09",
  syncedAt: "2026-08-09",
  freshness: "fresh",
  verified: true,
  value: 1,
  unit: "gap",
  confidence: 0.8,
  limitations: ["Internal growth Evidence is not market demand."],
  sourceReference: "project:health:gap",
  resourceScope: "project",
});

describe("editorial-first Content Opportunity selection", () => {
  it("does not select a low-helpfulness rare keyword merely because market Evidence exists", () => {
    const rare = candidate({
      selectedTopic: "rare health keyword",
      primaryKeyword: "rare health keyword",
      searchIntent: "low competition keyword",
      readerProblem: "search volume and scarcity opportunity",
      contentAngle: "SEO opportunity",
      expectedCoverage: [],
      selectionRationale: "rare keyword with low competition",
    });
    const market = createOpportunityEvidence({
      workspaceId: "workspace-1",
      projectId: null,
      provider: "naverSearchTrend",
      evidenceType: "relativeTrend",
      keyword: "rare health keyword",
      observedAt: "2026-08-09",
      syncedAt: "2026-08-09",
      freshness: "fresh",
      verified: true,
      value: 80,
      unit: "relativeRatio",
      confidence: 1,
      limitations: ["Relative trend only."],
      sourceReference: "snapshot:rare",
      resourceScope: "query",
    });

    expect(service().classifyCandidates([rare], [internalGap, market], data, project)).toEqual([]);
  });

  it("sorts a concrete problem-solving topic ahead of a broader comprehensive opportunity", () => {
    const useful = candidate({});
    const broad = candidate({
      selectedTopic: "health trend pulse",
      primaryKeyword: "health trend pulse",
      searchIntent: "how to browse health information trends",
      readerProblem: "health information is needed",
      contentAngle: "trend overview",
      expectedCoverage: ["trend"],
      selectionRationale: "market interest",
    });
    const external = createOpportunityEvidence({
      workspaceId: "workspace-1",
      projectId: null,
      provider: "naverSearchTrend",
      evidenceType: "relativeTrend",
      keyword: "trend pulse",
      observedAt: "2026-08-09",
      syncedAt: "2026-08-09",
      freshness: "fresh",
      verified: true,
      value: 70,
      unit: "relativeRatio",
      confidence: 1,
      limitations: ["Relative trend only."],
      sourceReference: "snapshot:broad",
      resourceScope: "query",
    });

    const classified = service().classifyCandidates([broad, useful], [internalGap, external], data, project);

    expect(classified.map((value) => value.selectedTopic)).toEqual(["health screening result check", "health trend pulse"]);
    expect(classified[0]?.recommendationType).toBe("blogGrowth");
    expect(classified[1]?.recommendationType).toBe("comprehensive");
  });

  it("applies reusable Project exclusions without a platform-specific exception", () => {
    const excludedProject: UserProject = {
      ...project,
      strategy: { ...project.strategy!, excludedTopics: ["investment recommendation"] },
    };
    const excluded = candidate({
      selectedTopic: "health investment recommendation check",
      primaryKeyword: "health investment recommendation",
      searchIntent: "how to check a health investment recommendation",
      readerProblem: "the reader cannot judge an investment recommendation",
    });

    expect(service().classifyCandidates([excluded], [internalGap], { ...data, projects: [excludedProject] }, excludedProject)).toEqual([]);
  });
});
