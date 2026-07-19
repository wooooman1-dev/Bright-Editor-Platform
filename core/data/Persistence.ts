export interface PersistenceStore {
  batch(mutations: readonly PersistenceMutation[]): Promise<void>;
  delete(collection: string, id: string): Promise<void>;
  get<T>(collection: string, id: string): Promise<T | undefined>;
  list<T>(collection: string): Promise<readonly T[]>;
  set<T>(collection: string, id: string, value: T): Promise<void>;
  update<T>(collection: string, id: string, update: (current: T | undefined) => T): Promise<T>;
}

export type PersistenceMutation = Readonly<
  | { type: "delete"; collection: string; id: string }
  | { type: "set"; collection: string; id: string; value: unknown }
>;

export class InMemoryPersistenceStore implements PersistenceStore {
  private readonly collections = new Map<string, Map<string, unknown>>();

  async batch(mutations: readonly PersistenceMutation[]): Promise<void> {
    const next = new Map([...this.collections].map(([collection, values]) => [collection, new Map(values)]));
    for (const mutation of mutations) {
      const values = next.get(mutation.collection) ?? new Map<string, unknown>();
      if (mutation.type === "delete") values.delete(mutation.id); else values.set(mutation.id, mutation.value);
      next.set(mutation.collection, values);
    }
    this.collections.clear();
    for (const [collection, values] of next) this.collections.set(collection, values);
  }

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

  async update<T>(collection: string, id: string, update: (current: T | undefined) => T): Promise<T> {
    const value = update(this.collections.get(collection)?.get(id) as T | undefined);
    await this.set(collection, id, value);
    return value;
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

  async batch(mutations: readonly PersistenceMutation[]): Promise<void> {
    return this.mutate((snapshot) => {
      const next: Record<string, Record<string, unknown>> = Object.fromEntries(Object.entries(snapshot).map(([collection, values]) => [collection, { ...values }]));
      for (const mutation of mutations) {
        const values = next[mutation.collection] ?? {};
        if (mutation.type === "delete") delete values[mutation.id]; else values[mutation.id] = mutation.value;
        next[mutation.collection] = values;
      }
      return next;
    });
  }

  async delete(collection: string, id: string): Promise<void> {
    return this.mutate((snapshot) => {
      const values = { ...(snapshot[collection] ?? {}) };
      delete values[id];
      return { ...snapshot, [collection]: values };
    });
  }

  async get<T>(collection: string, id: string): Promise<T | undefined> {
    await this.queue;
    const snapshot = (await this.driver.read()) ?? {};
    return snapshot[collection]?.[id] as T | undefined;
  }

  async list<T>(collection: string): Promise<readonly T[]> {
    await this.queue;
    const snapshot = (await this.driver.read()) ?? {};
    return Object.values(snapshot[collection] ?? {}) as T[];
  }

  async set<T>(collection: string, id: string, value: T): Promise<void> {
    return this.mutate((snapshot) => ({
      ...snapshot,
      [collection]: { ...(snapshot[collection] ?? {}), [id]: value },
    }));
  }

  async update<T>(collection: string, id: string, update: (current: T | undefined) => T): Promise<T> {
    let value!: T;
    await this.mutate((snapshot) => {
      value = update(snapshot[collection]?.[id] as T | undefined);
      return { ...snapshot, [collection]: { ...(snapshot[collection] ?? {}), [id]: value } };
    });
    return value;
  }

  private mutate(update: (snapshot: PersistenceSnapshot) => PersistenceSnapshot): Promise<void> {
    const operation = this.queue.then(async () => {
      const snapshot = (await this.driver.read()) ?? {};
      await this.driver.write(update(snapshot));
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }
}
