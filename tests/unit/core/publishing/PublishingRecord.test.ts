import { describe, expect, it } from "vitest";

import { createDraftCreateIdempotencyKey } from "../../../../core/publishing";

describe("Draft Create Idempotency Key", () => {
  const identity = {
    workspaceId: "workspace-1",
    projectId: "project-1",
    contentId: "content-1",
    contentRevisionId: "rev-1",
    platformConnectionId: "wordpress-1",
  } as const;

  it("is deterministic and includes the draft.create workflow", () => {
    const first = createDraftCreateIdempotencyKey(identity);
    expect(createDraftCreateIdempotencyKey({ ...identity })).toBe(first);
    expect(first).toContain("draft.create");
  });

  it("changes for another Revision, Connection, or Content", () => {
    const original = createDraftCreateIdempotencyKey(identity);
    expect(createDraftCreateIdempotencyKey({ ...identity, contentRevisionId: "rev-2" })).not.toBe(original);
    expect(createDraftCreateIdempotencyKey({ ...identity, platformConnectionId: "wordpress-2" })).not.toBe(original);
    expect(createDraftCreateIdempotencyKey({ ...identity, contentId: "content-2" })).not.toBe(original);
  });
});
