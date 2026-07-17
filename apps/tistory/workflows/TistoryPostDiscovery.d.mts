import type { Page } from "playwright";

export type TistoryDiscoveredPostRow = Readonly<{
  title: string;
  publishedUrl: string;
  categoryName?: string;
  publishedAt?: string;
  excerpt?: string;
}>;

export function publicPostListingUrls(origin: string, pageNumber: number): readonly string[];
export function extractPublicPostRows(page: Page, expectedOrigin: string): Promise<readonly TistoryDiscoveredPostRow[]>;
export function listingHasNoPostsMessage(page: Page): Promise<boolean>;
