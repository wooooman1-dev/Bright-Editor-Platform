import { describe, expect, it } from "vitest";

import { PersistentWordPressPublishingRecordRepository } from "../../../../../app/application/publishing/WordPressPublishingRecordRepository";
import type { UserData } from "../../../../../app/user-flow/user-data";
import {
  InMemoryPersistenceStore,
  SnapshotPersistenceStore,
  type PersistenceSnapshot,
  type PersistenceSnapshotDriver,
} from "../../../../../core/data";
import type { PublishingExecutionRecord } from "../../../../../core/publishing";

describe("persistent WordPress Publishing records", () => {
  it("claims atomically, preserves Tistory records, and restores the latest completion", async () => {
    const store = new InMemoryPersistenceStore();
    const legacy = { id: "tistory-1", contentId: "content-1", platformConnectionId: "tistory-1", status: "saved" as const, createdAt: "2026-07-29T00:00:00.000Z" };
    await store.set<UserData>("application", "user-data", data([legacy]));
    const repository = new PersistentWordPressPublishingRecordRepository(store);
    const initial = record();

    await expect(repository.claim(initial)).resolves.toMatchObject({ claimed: true });
    await expect(repository.claim(initial)).resolves.toMatchObject({ claimed: false, record: { status: "preparing" } });
    const verified = await repository.save({
      ...initial,
      status: "verified",
      stage: "complete",
      externalPostId: "501",
      verified: true,
      updatedAt: "2026-07-29T00:01:00.000Z",
    });

    expect(await repository.findByIdempotencyKey(initial.idempotencyKey)).toEqual(verified);
    expect((await store.get<UserData>("application", "user-data"))?.publishingRecords).toContainEqual(legacy);
  });

  it("does not let an older or non-terminal record overwrite a newer terminal Audit", async () => {
    const store = new InMemoryPersistenceStore();
    const repository = new PersistentWordPressPublishingRecordRepository(store);
    const verified = {
      ...record(),
      status: "verified" as const,
      stage: "complete",
      externalPostId: "501",
      verified: true,
      updatedAt: "2026-07-29T00:02:00.000Z",
    };
    await store.set<UserData>("application", "user-data", data([verified]));

    const saved = await repository.save({ ...record(), updatedAt: "2026-07-29T00:01:00.000Z" });

    expect(saved).toEqual(verified);
    expect(saved.externalPostId).toBe("501");
  });

  it("serializes two concurrent claims for the same Idempotency Key", async () => {
    const driver = new MemorySnapshotDriver();
    const store = new SnapshotPersistenceStore(driver);
    await store.set<UserData>("application", "user-data", data([]));
    const repository = new PersistentWordPressPublishingRecordRepository(store);

    const claims = await Promise.all([repository.claim(record()), repository.claim(record())]);

    expect(claims.filter((claim) => claim.claimed)).toHaveLength(1);
    expect(claims.filter((claim) => !claim.claimed)).toHaveLength(1);
    const persisted = await store.get<UserData>("application", "user-data");
    expect(persisted?.publishingRecords).toHaveLength(1);
    expect(persisted?.publishingRecords?.[0]).toMatchObject({ idempotencyKey: "publishing-key" });
  });
});

class MemorySnapshotDriver implements PersistenceSnapshotDriver {
  private snapshot: PersistenceSnapshot = Object.freeze({});

  async read(): Promise<PersistenceSnapshot> {
    return this.snapshot;
  }

  async write(snapshot: PersistenceSnapshot): Promise<void> {
    await Promise.resolve();
    this.snapshot = snapshot;
  }
}

function record(): PublishingExecutionRecord {
  return Object.freeze({
    schemaVersion: 1,
    id: "publishing-key",
    idempotencyKey: "publishing-key",
    workspaceId: "workspace-1",
    projectId: "project-1",
    contentId: "content-1",
    contentRevisionId: "rev-1",
    platformConnectionId: "wordpress-1",
    platform: "wordpress",
    workflow: "draft.create",
    status: "preparing",
    stage: "readiness",
    verified: false,
    uploadedMedia: Object.freeze([]),
    cleanupRequired: false,
    verificationChecks: Object.freeze([]),
    categoryIds: Object.freeze(["12"]),
    categoryNames: Object.freeze(["Household"]),
    localImageCount: 0,
    featuredImageAssigned: false,
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-29T00:00:00.000Z",
  });
}

function data(publishingRecords: UserData["publishingRecords"]): UserData {
  return {
    workspace: { id: "workspace-1", name: "Studio" },
    brands: [],
    projects: [],
    contents: [],
    publishingRecords,
  };
}
