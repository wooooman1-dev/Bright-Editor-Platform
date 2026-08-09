import { describe, expect, it } from "vitest";

import { evaluateApprovalSourceRelevance } from "../../../../core/approval";
import { createContentOpportunityCandidate } from "../../../../core/content";

const opportunity = createContentOpportunityCandidate({
  sourceRequest: "savings early termination guidance",
  selectionMode: "userSpecified",
  selectedTopic: "Savings early termination decision criteria",
  primaryKeyword: "savings early termination",
  secondaryKeywords: ["interest loss", "alternative options"],
  searchIntent: "check savings early termination costs",
  audience: "general readers",
  contentType: "guide",
  contentAngle: "official savings guidance",
  readerProblem: "uncertain about early termination consequences",
  expectedCoverage: ["early termination interest", "product terms"],
  selectionRationale: "synthetic fixture",
  opportunityEvidence: [{ source: "unknown", summary: "synthetic" }],
  confidence: 1,
  cautions: [],
  projectId: "project-synthetic",
});

function page(title: string, text: string) {
  return {
    requestedUrl: "https://official.example/source",
    finalUrl: "https://official.example/source",
    status: 200,
    contentType: "text/html",
    title,
    publisher: "Official Institution",
    text,
    extractionStatus: "extracted" as const,
  };
}

describe("Approval source relevance", () => {
  it("rejects an official page whose subject is unrelated to the selected topic", () => {
    const result = evaluateApprovalSourceRelevance({
      profileId: "wordpress_life_economy_v1",
      opportunity,
      page: page("Public election asset disclosure", "Election candidate asset disclosure filing guidance."),
    });
    expect(result.status).toBe("rejected");
    expect(result.diagnosticCode).toBe("source_topic_relevance_unverified");
  });

  it("accepts a page with deterministic topic-scope signals", () => {
    const result = evaluateApprovalSourceRelevance({
      profileId: "wordpress_life_economy_v1",
      opportunity,
      page: page("Savings early termination guidance", "Savings early termination interest loss and product terms."),
    });
    expect(result.status).toBe("passed");
    expect(result.matchedSignals).toEqual(expect.arrayContaining(["topic:savings", "topic:early"]));
  });

  it("accepts a Claim-relevant official page when the page uses the Claim vocabulary", () => {
    const result = evaluateApprovalSourceRelevance({
      profileId: "wordpress_life_economy_v1",
      opportunity,
      page: page("Savings interest income tax withholding", "Official guidance on savings interest income tax withholding."),
      additionalScope: [
        "savings interest income tax",
        "interest income tax withholding",
      ],
    });
    expect(result.status).toBe("passed");
    expect(result.matchedSignals).toEqual(expect.arrayContaining(["claim:savings", "claim:interest"]));
  });

  it("rejects an official page when neither topic nor its claimed facts are supported", () => {
    const result = evaluateApprovalSourceRelevance({
      profileId: "wordpress_life_economy_v1",
      opportunity,
      page: page("Public election asset disclosure", "Election candidate asset disclosure filing guidance."),
      additionalScope: ["savings interest income tax", "interest income tax withholding"],
    });
    expect(result.status).toBe("rejected");
    expect(result.diagnosticCode).toBe("source_topic_relevance_unverified");
  });
});
