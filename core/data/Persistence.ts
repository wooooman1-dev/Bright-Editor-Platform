export interface PersistenceStore {
  delete(collection: string, id: string): Promise<void>;
  get<T>(collection: string, id: string): Promise<T | undefined>;
  list<T>(collection: string): Promise<readonly T[]>;
  set<T>(collection: string, id: string, value: T): Promise<void>;
}

export class InMemoryPersistenceStore implements PersistenceStore {
  private readonly collections = new Map<string, Map<string, unknown>>();

  async delete(collection: string, id: string): Promise<void> {
    this.collections.get(collection)?.delete(id);
  }

  async get<T>(collection: string, id: string): Promise<T | undefined> {
    return this.collections.get(collection)?.get(id) as T | undefined;
  }

  async list<T>(collection: string): Promise<readonly T[]> {
    return [...(this.collections.get(collection)?.values() ?? [])] as T[];
  }

  async set<T>(collection: string, id: string, value: T): Promise<void> {
    const values = this.collections.get(collection) ?? new Map<string, unknown>();
    values.set(id, value);
    this.collections.set(collection, values);
  }
}

export type PersistenceSnapshot = Readonly<Record<string, Readonly<Record<string, unknown>>>>;

export interface PersistenceSnapshotDriver {
  read(): Promise<PersistenceSnapshot | undefined>;
  write(snapshot: PersistenceSnapshot): Promise<void>;
}

export class SnapshotPersistenceStore implements PersistenceStore {
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly driver: PersistenceSnapshotDriver) {}

  async delete(collection: string, id: string): Promise<void> {
    return this.mutate((snapshot) => {
      const values = { ...(snapshot[collection] ?? {}) };
      delete values[id];
      return { ...snapshot, [collection]: values };
    });
  }

  async get<T>(collection: string, id: string): Promise<T | undefined> {
    const snapshot = (await this.driver.read()) ?? {};
    return snapshot[collection]?.[id] as T | undefined;
  }

  async list<T>(collection: string): Promise<readonly T[]> {
    const snapshot = (await this.driver.read()) ?? {};
    return Object.values(snapshot[collection] ?? {}) as T[];
  }

  async set<T>(collection: string, id: string, value: T): Promise<void> {
    return this.mutate((snapshot) => ({
      ...snapshot,
      [collection]: { ...(snapshot[collection] ?? {}), [id]: value },
    }));
  }

  private mutate(update: (snapshot: PersistenceSnapshot) => PersistenceSnapshot): Promise<void> {
    this.queue = this.queue.then(async () => {
      const snapshot = (await this.driver.read()) ?? {};
      await this.driver.write(update(snapshot));
    });
    return this.queue;
  }
}
