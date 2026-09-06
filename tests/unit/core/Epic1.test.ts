import { describe, expect, it, vi } from "vitest";
import { AIWorkflow, type ContentGenerationStrategy } from "../../../core/ai/AIWorkflow";
import type { ContentDocument } from "../../../core/content";
import {
  BrandRepository,
  ContentRepository,
  DraftRepository,
  DraftService,
  HistoryRepository,
  InMemoryPersistenceStore,
  ProjectApplicationService,
  ProjectRepository,
  SnapshotPersistenceStore,
} from "../../../core/data";
import { InMemoryMediaLibrary, MediaManager } from "../../../core/media";
import { PublishingAdapterRegistry, PublishingPipeline } from "../../../core/publishing";
import { PublishingGate, QualityEngine } from "../../../core/quality";

const document: ContentDocument = Object.freeze({
  blocks: Object.freeze([
    { id: "heading", level: 1 as const, text: "A useful guide", type: "heading" as const },
    { id: "body", text: Array.from({ length: 55 }, () => "useful").join(" "), type: "paragraph" as const },
    { alt: "Example", id: "image", source: "/example.png", type: "image" as const },
    { id: "cta", label: "Read more", targetUrl: "/more", type: "button" as const },
  ]),
  id: "content-1",
  title: "A useful content guide",
});

describe("Epic 1 AI workflow", () => {
  it("uses the provider abstraction and tracks successful state", async () => {
    const provider = { generate: vi.fn().mockResolvedValue({ content: "result", model: "test" }) };
    const strategy: ContentGenerationStrategy = {
      createRequest: () => ({ instruction: "Generate" }),
      parse: () => document,
    };
    const workflow = new AIWorkflow(provider, strategy);
    const result = await workflow.generate({
      contentType: "article" as never,
      keywords: ["quality"],
      platform: "tistory" as never,
      projectId: "project-1",
    });
    expect(result.document).toBe(document);
    expect(workflow.getState().status).toBe("generated");
    expect(provider.generate).toHaveBeenCalledOnce();
  });
});

describe("Epic 1 data services", () => {
  it("persists repository snapshots through an injected durable driver", async () => {
    let snapshot = {};
    const store = new SnapshotPersistenceStore({
      read: async () => snapshot,
      write: async (next) => { snapshot = next; },
    });
    const projects = new ProjectRepository(store);
    await projects.save({ id: "project-1", name: "Project", workspaceId: "workspace-1" });
    expect((await projects.findById("project-1"))?.workspaceId).toBe("workspace-1");
  });

  it("enforces workspace ownership and synchronizes draft, history, and content", async () => {
    const store = new InMemoryPersistenceStore();
    const brands = new BrandRepository(store);
    const projects = new ProjectRepository(store);
    await brands.save({ id: "brand-1", name: "Brand", workspaceId: "workspace-1" });
    const projectService = new ProjectApplicationService(brands, projects);
    await expect(projectService.save({ brandId: "brand-1", id: "project-1", name: "Project", workspaceId: "workspace-2" })).rejects.toThrow("same Workspace");

    const contents = new ContentRepository(store);
    const drafts = new DraftRepository(store);
    const history = new HistoryRepository(store);
    await contents.save({ document, id: "content-1", projectId: "project-1", updatedAt: "old" });
    const service = new DraftService(contents, drafts, history, () => new Date("2026-01-01T00:00:00.000Z"));
    await service.save("content-1", document);
    expect((await drafts.findById("content-1"))?.savedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(await history.list()).toHaveLength(1);
    expect((await contents.findById("content-1"))?.updatedAt).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("Epic 1 publishing, media, and quality", () => {
  it("routes publishing through the registered adapter", async () => {
    const registry = new PublishingAdapterRegistry();
    registry.register({
      platform: "example",
      prepare: async (request) => ({ payload: request.content, platform: "example", request }),
      publish: async () => ({ externalId: "published-1", status: "published" }),
    });
    const result = await new PublishingPipeline(registry).publish({ content: document, platform: "example" });
    expect(result.status).toBe("published");
  });

  it("requires image ALT metadata", async () => {
    const manager = new MediaManager(new InMemoryMediaLibrary());
    await expect(manager.add({ id: "image-1", kind: "image", metadata: { createdAt: "now" }, source: "/image.png" })).rejects.toThrow("ALT");
  });

  it("produces an honest reusable quality report and keeps incomplete content behind the gate", () => {
    const report = new QualityEngine().review(document, { contentType: "article", platform: "tistory", primaryKeyword: "useful", searchIntent: "guide" });
    expect(report.overallScore).toBeLessThan(100);
    expect(report.dimensions).toHaveLength(14);
    expect(report.approved).toBe(false);
    expect(() => new PublishingGate().assertReady(report)).toThrow("Publishing blocked");
  });
});
