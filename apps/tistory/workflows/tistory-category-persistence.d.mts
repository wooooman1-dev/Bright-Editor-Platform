import type { Page } from "playwright";

export type TistoryCategoryPersistenceEvidence = Readonly<{
  passed: boolean;
  skipped?: boolean;
  uncategorized?: boolean;
  code?: string;
  expectedId?: string;
  expectedName?: string;
  observedIds?: readonly string[];
  observedNames?: readonly string[];
  idMatched?: boolean;
  nameMatched?: boolean;
  [key: string]: unknown;
}>;

export function prepareReopenedTistoryCategoryEvidence(
  page: Page,
  categoryId: string | null | undefined,
  categoryName?: string,
): Promise<TistoryCategoryPersistenceEvidence>;
