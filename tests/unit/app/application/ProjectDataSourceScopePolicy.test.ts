import { describe, expect, it } from "vitest";
import { InMemoryPersistenceStore } from "../../../../core/data";
import type { ProjectDataSourceReference } from "../../../../core/intelligence";
import { DurableProjectDataSourceReferenceRepository } from "../../../../app/application/data-sources/DataSourceRepositories";
import {
  canonicalProjectReference,
  projectDataSourceScopeConflict,
  projectScopedReferences,
} from "../../../../app/application/data-sources/ProjectDataSourceScopePolicy";

const reference = (projectId: string, updatedAt: string): ProjectDataSourceReference => Object.freeze({
  workspaceId: "workspace-1",
  projectId,
  connectionId: "connection-health",
  enabled: true,
  updatedAt,
});

describe("Project Data Source scope policy", () => {
  it("uses the oldest active reference as the canonical Project owner", () => {
    const health = reference("project-health", "2026-07-23T01:30:00.000Z");
    const finance = reference("project-finance", "2026-08-04T09:23:20.000Z");
    expect(canonicalProjectReference([finance, health], "connection-health")).toEqual(health);
    expect(projectScopedReferences([finance, health], "project-health")).toEqual([health]);
    expect(projectScopedReferences([finance, health], "project-finance")).toEqual([]);
  });

  it("reports a conflict when another Project tries to reuse an owned connection", () => {
    const health = reference("project-health", "2026-07-23T01:30:00.000Z");
    const finance = reference("project-finance", "2026-08-04T09:23:20.000Z");
    expect(projectDataSourceScopeConflict([health], finance)).toEqual({
      connectionId: "connection-health",
      ownerProjectId: "project-health",
      requestedProjectId: "project-finance",
    });
  });

  it("allows the owning Project to update its own reference", () => {
    const health = reference("project-health", "2026-07-23T01:30:00.000Z");
    expect(projectDataSourceScopeConflict([health], { ...health, updatedAt: "2026-08-04T10:00:00.000Z" })).toBeUndefined();
  });

  it("blocks cross-Project persistence and hides legacy duplicate references from Project reads", async () => {
    const store = new InMemoryPersistenceStore();
    const repository = new DurableProjectDataSourceReferenceRepository(store);
    const health = reference("project-health", "2026-07-23T01:30:00.000Z");
    const finance = reference("project-finance", "2026-08-04T09:23:20.000Z");

    await repository.save(health);
    await expect(repository.save(finance)).rejects.toMatchObject({
      code: "DATA_SOURCE_PROJECT_SCOPE_CONFLICT",
      status: 409,
      field: "connectionId",
    });

    await store.set("project-data-source-references", `${finance.projectId}:${finance.connectionId}`, finance);
    await expect(repository.listByProject("project-health")).resolves.toEqual([health]);
    await expect(repository.listByProject("project-finance")).resolves.toEqual([]);
  });
});
