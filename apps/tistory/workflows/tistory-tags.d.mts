import type { Page } from "playwright";

export type TistoryTagResult = Readonly<{
  passed: boolean;
  tags: readonly string[];
  skipped?: boolean;
  code?: string;
  message?: string;
  evidence?: Readonly<Record<string, unknown>>;
}>;

export function normalizeTistoryTags(values: unknown, limit?: number): string[];
export function fillTistoryTags(page: Page, values: unknown): Promise<TistoryTagResult>;
export function verifyTistoryTags(page: Page, values: unknown): Promise<TistoryTagResult>;
