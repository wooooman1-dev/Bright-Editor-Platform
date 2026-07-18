import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(join(process.cwd(), "app/api/studio/route.ts"), "utf8");
const mergeSource = readFileSync(join(process.cwd(), "app/application/persistence/mergeUserDataSnapshot.ts"), "utf8");

describe("Studio full-state persistence", () => {
  it("uses one atomic store update instead of a stale get-then-set write", () => {
    expect(routeSource).toContain("studioStore.update<UserData>");
    expect(routeSource).toContain("mergeUserDataSnapshot(current, body)");
    expect(routeSource).not.toContain("preserveServerQuality");
  });

  it("persists long-running workflows through the change-aware merge path", () => {
    expect(routeSource).toContain("persistServerMutation(owned, next)");
    expect(routeSource).toContain("persistServerMutation(data, next)");
    expect(routeSource).toContain("persistServerMutation(data, persisted)");
    expect(routeSource).toContain("mergeServerMutationSnapshot(current, base, next)");
  });

  it("keeps media and workflow collections under explicit server ownership", () => {
    expect(mergeSource).toContain("mediaMetadata: frozenCopy(current.mediaMetadata ?? incoming.mediaMetadata)");
    expect(mergeSource).toContain("history: frozenCopy(current.history ?? incoming.history)");
    expect(mergeSource).toContain("qualityReports: frozenCopy(current.qualityReports ?? incoming.qualityReports)");
    expect(mergeSource).toContain("publishingRecords: frozenCopy(current.publishingRecords ?? incoming.publishingRecords)");
    expect(mergeSource).toContain("scheduledPublishing: frozenCopy(current.scheduledPublishing ?? incoming.scheduledPublishing)");
    expect(mergeSource).toContain("mergeChangedByKey(current.qualityReports, base.qualityReports, next.qualityReports");
  });
});
