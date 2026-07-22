import type { Page } from "playwright";
import type { TistoryCategory } from "./TistoryCategoryReadWorkflow";

export function readTistoryCategories(page: Page): Promise<readonly TistoryCategory[]>;
export function resolveCategoryIdByName(categoryName: string | undefined, categories: readonly TistoryCategory[]): string | undefined;
