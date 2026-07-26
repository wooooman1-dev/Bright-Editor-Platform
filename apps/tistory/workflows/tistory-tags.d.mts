import type { Page } from "playwright";
import type { ReopenedTistoryRepresentativeResult } from "./tistory-reopened-evidence.mjs";

export type TistoryTagResult = Readonly<{
  passed: boolean;
  tags: readonly string[];
  skipped?: boolean;
  code?: string;
  message?: string;
  representativeRemoteUrl?: string;
  representativeUi?: ReopenedTistoryRepresentativeResult;
  evidence?: Readonly<Record<string, unknown>>;
}>;

export function normalizeTistoryTags(values: unknown, limit?: number): string[];
export function fillTistoryTags(page: Page, values: unknown): Promise<TistoryTagResult>;
export function verifyTistoryTags(page: Page, values: unknown): Promise<TistoryTagResult>;
