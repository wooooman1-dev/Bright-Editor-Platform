import {
  createWordPressAuthorizationHeader,
  normalizeSiteUrl,
  type WordPressConnectionInput,
} from "./WordPressConnectionAdapter";

export type WordPressCategory = Readonly<{
  id: string;
  platform: "wordpress";
  externalCategoryId: string;
  name: string;
  slug?: string;
  parentExternalCategoryId?: string;
  selectable: boolean;
}>;

export type WordPressCategoryListRequest = WordPressConnectionInput & Readonly<{
  platformConnectionId: string;
  search?: string;
  page?: number;
  pageSize?: number;
}>;

export type WordPressCategoryListResult = Readonly<{
  platform: "wordpress";
  platformConnectionId: string;
  categories: readonly WordPressCategory[];
  hasMore: boolean;
  nextPage?: number;
  retrievedAt: string;
  warnings: readonly string[];
}>;

type WordPressCategoryResponse = Readonly<{
  id?: string | number;
  name?: string;
  slug?: string;
  parent?: string | number;
}>;

export class WordPressCategoryAdapter {
  constructor(
    private readonly request: typeof fetch = fetch,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async listCategories(input: WordPressCategoryListRequest): Promise<WordPressCategoryListResult> {
    const page = positiveInteger(input.page ?? 1, "page");
    const pageSize = positiveInteger(input.pageSize ?? 100, "pageSize");
    if (pageSize > 100) throw new Error("WordPress category pageSize must be 100 or fewer.");
    if (!input.platformConnectionId.trim()) throw new Error("WordPress connection is required.");
    if (!input.username.trim() || !input.applicationPassword.trim()) {
      throw new Error("WordPress category authentication is required.");
    }

    const query = new URLSearchParams({
      context: "edit",
      page: String(page),
      per_page: String(pageSize),
    });
    const search = input.search?.trim();
    if (search) query.set("search", search);
    let response: Response;
    try {
      response = await this.request(`${normalizeSiteUrl(input.siteUrl)}/wp-json/wp/v2/categories?${query}`, {
        headers: {
          Accept: "application/json",
          Authorization: createWordPressAuthorizationHeader(input.username, input.applicationPassword),
        },
      });
    } catch {
      throw new Error("WordPress categories could not be read.");
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error("WordPress category authentication or permission verification failed.");
    }
    if (!response.ok) throw new Error("WordPress categories could not be read.");

    let raw: unknown;
    try { raw = await response.json(); }
    catch { throw new Error("WordPress returned an invalid category response."); }
    if (!Array.isArray(raw)) throw new Error("WordPress returned an invalid category response.");
    const categories = Object.freeze(raw.map(canonicalCategory));
    const totalPages = response.headers.get("X-WP-TotalPages");
    const parsedTotalPages = totalPages === null ? undefined : Number(totalPages);
    const hasMore = Number.isInteger(parsedTotalPages)
      ? page < parsedTotalPages!
      : categories.length === pageSize;

    return Object.freeze({
      platform: "wordpress",
      platformConnectionId: input.platformConnectionId,
      categories,
      hasMore,
      ...(hasMore ? { nextPage: page + 1 } : {}),
      retrievedAt: this.now(),
      warnings: Object.freeze([]),
    });
  }
}

function canonicalCategory(value: WordPressCategoryResponse): WordPressCategory {
  if ((typeof value.id !== "string" && typeof value.id !== "number") || !String(value.id).trim() || typeof value.name !== "string" || !value.name.trim()) {
    throw new Error("WordPress returned an invalid category response.");
  }
  const externalCategoryId = String(value.id);
  const parentExternalCategoryId = value.parent === undefined || String(value.parent) === "0"
    ? undefined
    : String(value.parent);
  return Object.freeze({
    id: externalCategoryId,
    platform: "wordpress",
    externalCategoryId,
    name: value.name,
    ...(typeof value.slug === "string" && value.slug ? { slug: value.slug } : {}),
    ...(parentExternalCategoryId ? { parentExternalCategoryId } : {}),
    selectable: true,
  });
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) throw new Error(`WordPress category ${name} must be a positive integer.`);
  return value;
}
