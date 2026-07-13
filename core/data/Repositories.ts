import type { Brand, Content, Draft, HistoryEntry, Project, Workspace } from "./Models";
import type { PersistenceStore } from "./Persistence";

export interface Repository<T extends { id: string }> {
  delete(id: string): Promise<void>;
  findById(id: string): Promise<T | undefined>;
  list(): Promise<readonly T[]>;
  save(value: T): Promise<void>;
}

class StoreRepository<T extends { id: string }> implements Repository<T> {
  constructor(private readonly store: PersistenceStore, private readonly collection: string) {}
  delete(id: string) { return this.store.delete(this.collection, id); }
  findById(id: string) { return this.store.get<T>(this.collection, id); }
  list() { return this.store.list<T>(this.collection); }
  save(value: T) { return this.store.set(this.collection, value.id, value); }
}

export class WorkspaceRepository extends StoreRepository<Workspace> { constructor(store: PersistenceStore) { super(store, "workspaces"); } }
export class BrandRepository extends StoreRepository<Brand> { constructor(store: PersistenceStore) { super(store, "brands"); } }
export class ProjectRepository extends StoreRepository<Project> { constructor(store: PersistenceStore) { super(store, "projects"); } }
export class ContentRepository extends StoreRepository<Content> { constructor(store: PersistenceStore) { super(store, "contents"); } }
export class DraftRepository extends StoreRepository<Draft> { constructor(store: PersistenceStore) { super(store, "drafts"); } }
export class HistoryRepository extends StoreRepository<HistoryEntry> { constructor(store: PersistenceStore) { super(store, "history"); } }
