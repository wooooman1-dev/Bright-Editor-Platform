import type { ContentDocument } from "../content";
import type { Brand, Content, Draft, HistoryEntry, Project } from "./Models";
import type { Repository } from "./Repositories";

export class ProjectApplicationService {
  constructor(
    private readonly brands: Repository<Brand>,
    private readonly projects: Repository<Project>,
  ) {}

  async save(project: Project): Promise<void> {
    if (project.brandId) {
      const brand = await this.brands.findById(project.brandId);
      if (!brand || brand.workspaceId !== project.workspaceId) {
        throw new Error("Project Brand must belong to the same Workspace.");
      }
    }
    await this.projects.save(project);
  }
}

export class DraftService {
  constructor(
    private readonly contents: Repository<Content>,
    private readonly drafts: Repository<Draft>,
    private readonly history: Repository<HistoryEntry>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async save(contentId: string, document: ContentDocument): Promise<Draft> {
    const content = await this.contents.findById(contentId);
    if (!content) throw new Error("Content must exist before saving a Draft.");
    const savedAt = this.now().toISOString();
    const draft = Object.freeze({ contentId, document, id: contentId, savedAt });
    const prior = (await this.history.list()).filter((item) => item.contentId === contentId);
    const entry = Object.freeze({
      contentId,
      document,
      id: `${contentId}:${prior.length + 1}`,
      recordedAt: savedAt,
      version: prior.length + 1,
    });
    await this.drafts.save(draft);
    await this.history.save(entry);
    await this.contents.save(Object.freeze({ ...content, document, updatedAt: savedAt }));
    return draft;
  }
}

export class AutoSaveController {
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private readonly saveDraft: (document: ContentDocument) => Promise<void>, private readonly delayMs = 500) {}
  schedule(document: ContentDocument): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.saveDraft(document), this.delayMs);
  }
  cancel(): void { if (this.timer) clearTimeout(this.timer); this.timer = undefined; }
}
