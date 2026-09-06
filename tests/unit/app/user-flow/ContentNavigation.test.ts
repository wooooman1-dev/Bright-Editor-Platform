import { describe, expect, it } from "vitest";

import { canReopenPlanningCandidates, resolveContentOpenDestination } from "../../../../app/user-flow/content-navigation";

describe("content editor re-entry", () => {
  it("opens the editor whenever a generated document exists, even if planning failed", () => {
    expect(resolveContentOpenDestination({
      document: { id: "document-1" } as never,
      planningWorkflow: { status: "failed" } as never,
    })).toBe("editor");
  });

  it("opens the editor for a quality-revision draft with a generated document", () => {
    expect(resolveContentOpenDestination({
      document: { id: "document-1" } as never,
      planningWorkflow: { status: "generating" } as never,
    })).toBe("editor");
  });

  it("resumes planning only when no document exists and the workflow is still active", () => {
    expect(resolveContentOpenDestination({
      planningWorkflow: { status: "failed" } as never,
    })).toBe("planning");
  });

  it.each(["generated", "cancelled"] as const)("does not resume planning for %s without a document", (status) => {
    expect(resolveContentOpenDestination({
      planningWorkflow: { status } as never,
    })).toBe("editor");
  });
});

describe("returning to the stored topic candidates", () => {
  it("offers the route after generation, because generation does not consume the candidates", () => {
    expect(canReopenPlanningCandidates({
      planning: { opportunityCandidates: [{ opportunityId: "opportunity-1" }] } as never,
    })).toBe(true);
  });

  it("offers no route when the Content was created without Planning", () => {
    expect(canReopenPlanningCandidates({})).toBe(false);
    expect(canReopenPlanningCandidates({ planning: {} as never })).toBe(false);
    expect(canReopenPlanningCandidates({ planning: { opportunityCandidates: [] } as never })).toBe(false);
  });
});
