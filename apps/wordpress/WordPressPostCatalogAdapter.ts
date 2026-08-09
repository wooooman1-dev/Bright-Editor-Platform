import {
  createWordPressAuthorizationHeader,
  normalizeSiteUrl,
  type WordPressConnectionInput,
} from "./WordPressConnectionAdapter";

export type WordPressPublishedPost = Readonly<{
  externalPostId: string;
  title: string;
  publishedUrl: string;
  publishedAt?: string;
  excerpt?: string;
  categoryIds: readonly string[];
}>;

export type WordPressPublishedPostCatalogResult = Readonly<{
  platform: "wordpress";
  platformConnectionId: string;
  posts: readonly WordPressPublishedPost[];
  retrievedAt: string;
  warnings: readonly string[];
}>;

export type WordPressPublishedPostCatalogRequest = WordPressConnectionInput & Readonly<{
  platformConnectionId: string;
  page?: number;
  pageSize?: number;
}>;

type WordPressPostResponse = Readonly<{
  id?: string | number;
  link?: string;
  date?: string;
  status?: string;
  title?: Readonly<{ rendered?: string }>;
  excerpt?: Readonly<{ rendered?: string }>;
  categories?: readonly (string | number)[];
}>;

export class WordPressPostCatalogAdapter {
  constructor(
    private readonly request: typeof fetch = fetch,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async listPublishedPosts(
    input: WordPressPublishedPostCatalogRequest,
  ): Promise<WordPressPublishedPostCatalogResult & Readonly<{ hasMore: boolean; nextPage?: number }>> {
    const page = positiveInteger(input.page ?? 1, "page");
    const pageSize = positiveInteger(input.pageSize ?? 100, "pageSize");
    if (pageSize > 100) throw new Error("WordPress post pageSize must be 100 or fewer.");
    if (!input.platformConnectionId.trim()) throw new Error("WordPress connection is required.");
    if (!input.username.trim() || !input.applicationPassword.trim()) {
      throw new Error("WordPress post authentication is required.");
    }

    const query = new URLSearchParams({
      context: "view",
      status: "publish",
      page: String(page),
      per_page: String(pageSize),
      _fields: "id,link,date,status,title,excerpt,categories",
    });

    const siteUrl = normalizeSiteUrl(input.siteUrl);
    let response: Response;
    try {
      response = await this.request(
        `${siteUrl}/wp-json/wp/v2/posts?${query}`,
        {
          headers: {
            Accept: "application/json",
            Authorization: createWordPressAuthorizationHeader(
              input.username,
              input.applicationPassword,
            ),
          },
        },
      );
    } catch {
      throw new Error("WordPress published posts could not be read.");
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error("WordPress post authentication or permission verification failed.");
    }
    if (response.status === 400 && page > 1) {
      return Object.freeze({
        platform: "wordpress",
        platformConnectionId: input.platformConnectionId,
        posts: Object.freeze([]),
        retrievedAt: this.now(),
        warnings: Object.freeze([]),
        hasMore: false,
      });
    }
    if (!response.ok) throw new Error("WordPress published posts could not be read.");

    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      throw new Error("WordPress returned an invalid post response.");
    }
    if (!Array.isArray(raw)) throw new Error("WordPress returned an invalid post response.");

    const posts = Object.freeze(raw.map((value) => canonicalPost(value, siteUrl)));
    const totalPagesHeader = response.headers.get("X-WP-TotalPages");
    const totalPages = totalPagesHeader === null ? undefined : Number(totalPagesHeader);
    const hasMore = Number.isInteger(totalPages)
      ? page < totalPages!
      : posts.length === pageSize;

    return Object.freeze({
      platform: "wordpress",
      platformConnectionId: input.platformConnectionId,
      posts,
      retrievedAt: this.now(),
      warnings: Object.freeze([]),
      hasMore,
      ...(hasMore ? { nextPage: page + 1 } : {}),
    });
  }

  async listAllPublishedPosts(
    input: Omit<WordPressPublishedPostCatalogRequest, "page">,
  ): Promise<WordPressPublishedPostCatalogResult> {
    const posts = new Map<string, WordPressPublishedPost>();
    let retrievedAt = this.now();

    for (let page = 1; page <= 100; page += 1) {
      const result = await this.listPublishedPosts({ ...input, page });
      if (result.platformConnectionId !== input.platformConnectionId) {
        throw new Error("WordPress post result belongs to a different connection.");
      }
      retrievedAt = result.retrievedAt;
      for (const post of result.posts) posts.set(post.externalPostId, post);
      if (!result.hasMore) {
        return Object.freeze({
          platform: "wordpress",
          platformConnectionId: input.platformConnectionId,
          posts: Object.freeze([...posts.values()]),
          retrievedAt,
          warnings: Object.freeze([]),
        });
      }
    }

    throw new Error("WordPress post pagination exceeded the safe limit.");
  }
}

function canonicalPost(
  value: WordPressPostResponse,
  siteUrl: string,
): WordPressPublishedPost {
  const externalPostId =
    typeof value.id === "string" || typeof value.id === "number"
      ? String(value.id).trim()
      : "";
  const publishedUrl = typeof value.link === "string" ? value.link.trim() : "";
  const title = renderedText(value.title?.rendered ?? "");
  if (!externalPostId || !publishedUrl || !title) {
    throw new Error("WordPress returned an invalid post response.");
  }
  if (!isSafeOwnedPublishedUrl(publishedUrl, siteUrl)) {
    throw new Error("WordPress returned an unsafe or foreign post URL.");
  }
  if (value.status && value.status !== "publish") {
    throw new Error("WordPress returned a non-public post in the published catalog.");
  }

  const categoryIds = Object.freeze(
    [...new Set((value.categories ?? [])
      .map((categoryId) => String(categoryId).trim())
      .filter(Boolean))],
  );
  const excerpt = renderedText(value.excerpt?.rendered ?? "");
  const publishedAt = typeof value.date === "string" && value.date.trim()
    ? value.date.trim()
    : undefined;

  return Object.freeze({
    externalPostId,
    title,
    publishedUrl,
    ...(publishedAt ? { publishedAt } : {}),
    ...(excerpt ? { excerpt } : {}),
    categoryIds,
  });
}

function isSafeOwnedPublishedUrl(value: string, siteUrl: string): boolean {
  try {
    const url = new URL(value);
    const site = new URL(siteUrl);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    if (normalizedHost(url.hostname) !== normalizedHost(site.hostname)) return false;
    return !/(?:^|\/)(?:wp-admin|wp-login\.php|admin|login)(?:\/|$)/i.test(
      url.pathname,
    );
  } catch {
    return false;
  }
}

function normalizedHost(value: string): string {
  return value.replace(/^www\./i, "").toLocaleLowerCase("en-US");
}

function renderedText(value: string): string {
  return decodeEntities(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code: string) =>
      String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)));
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`WordPress post ${name} must be a positive integer.`);
  }
  return value;
}
