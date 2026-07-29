import type { PersistenceStore } from "../../../core/data";
import {
  isPublishingExecutionRecord,
  type PublishingExecutionRecord,
} from "../../../core/publishing";
import type { UserData } from "../../user-flow/user-data";

const USER_DATA_COLLECTION = "application";
const USER_DATA_ID = "user-data";

export type WordPressPublishingRecordClaim = Readonly<
  | { claimed: true; record: PublishingExecutionRecord }
  | { claimed: false; record: PublishingExecutionRecord }
>;

export interface WordPressPublishingRecordRepository {
  claim(record: PublishingExecutionRecord): Promise<WordPressPublishingRecordClaim>;
  findByIdempotencyKey(idempotencyKey: string): Promise<PublishingExecutionRecord | undefined>;
  save(record: PublishingExecutionRecord): Promise<PublishingExecutionRecord>;
}

export class InMemoryWordPressPublishingRecordRepository implements WordPressPublishingRecordRepository {
  private readonly records = new Map<string, PublishingExecutionRecord>();

  async claim(record: PublishingExecutionRecord): Promise<WordPressPublishingRecordClaim> {
    const existing = this.records.get(record.idempotencyKey);
    if (existing) return Object.freeze({ claimed: false, record: existing });
    this.records.set(record.idempotencyKey, record);
    return Object.freeze({ claimed: true, record });
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<PublishingExecutionRecord | undefined> {
    return this.records.get(idempotencyKey);
  }

  async save(record: PublishingExecutionRecord): Promise<PublishingExecutionRecord> {
    const current = this.records.get(record.idempotencyKey);
    const saved = current && shouldPreserveCurrent(current, record) ? current : record;
    this.records.set(record.idempotencyKey, saved);
    return saved;
  }
}

export class PersistentWordPressPublishingRecordRepository implements WordPressPublishingRecordRepository {
  constructor(private readonly store: PersistenceStore) {}

  async claim(record: PublishingExecutionRecord): Promise<WordPressPublishingRecordClaim> {
    let claimed = false;
    const data = await this.store.update<UserData>(USER_DATA_COLLECTION, USER_DATA_ID, (current) => {
      if (!current) throw new Error("Workspace was not found.");
      const existing = findRecord(current, record.idempotencyKey);
      if (existing) return current;
      claimed = true;
      return Object.freeze({
        ...current,
        publishingRecords: Object.freeze([...(current.publishingRecords ?? []), record]),
      });
    });
    const saved = findRecord(data, record.idempotencyKey);
    if (!saved) throw new Error("WordPress publishing record could not be persisted.");
    return Object.freeze({ claimed, record: saved }) as WordPressPublishingRecordClaim;
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<PublishingExecutionRecord | undefined> {
    const data = await this.store.get<UserData>(USER_DATA_COLLECTION, USER_DATA_ID);
    return data ? findRecord(data, idempotencyKey) : undefined;
  }

  async save(record: PublishingExecutionRecord): Promise<PublishingExecutionRecord> {
    const data = await this.store.update<UserData>(USER_DATA_COLLECTION, USER_DATA_ID, (current) => {
      if (!current) throw new Error("Workspace was not found.");
      const existing = findRecord(current, record.idempotencyKey);
      const saved = existing && shouldPreserveCurrent(existing, record) ? existing : record;
      const others = (current.publishingRecords ?? []).filter((item) => item.id !== record.id);
      return Object.freeze({
        ...current,
        publishingRecords: Object.freeze([...others, saved]),
      });
    });
    const saved = findRecord(data, record.idempotencyKey);
    if (!saved) throw new Error("WordPress publishing record could not be persisted.");
    return saved;
  }
}

function findRecord(data: UserData, idempotencyKey: string): PublishingExecutionRecord | undefined {
  return (data.publishingRecords ?? []).find((record) => (
    isPublishingExecutionRecord(record) && record.idempotencyKey === idempotencyKey
  )) as PublishingExecutionRecord | undefined;
}

function shouldPreserveCurrent(current: PublishingExecutionRecord, candidate: PublishingExecutionRecord): boolean {
  if (current.idempotencyKey !== candidate.idempotencyKey) return false;
  if (terminal(current.status) && current.status !== candidate.status) return true;
  const currentTime = Date.parse(current.updatedAt);
  const candidateTime = Date.parse(candidate.updatedAt);
  return Number.isFinite(currentTime) && Number.isFinite(candidateTime) && currentTime > candidateTime;
}

function terminal(status: PublishingExecutionRecord["status"]): boolean {
  return ["verified", "verification_failed", "failed", "cleanup_required", "unknown_result"].includes(status);
}
