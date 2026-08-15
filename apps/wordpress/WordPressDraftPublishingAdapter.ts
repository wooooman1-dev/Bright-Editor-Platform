import {
  createWordPressAuthorizationHeader,
  normalizeSiteUrl,
  type WordPressConnectionInput,
} from "./WordPressConnectionAdapter";
import type {
  PreparedPublication,
  PublicationRequest,
  PublicationResult,
  PublishingAdapter,
} from "../../core/publishing";
import { WordPressHtmlRenderer } from "./WordPressHtmlRenderer";

export type WordPressPreparedDraft = PreparedPublication & Readonly<{
  payload: Readonly<{ html: string; title: string; type: "save-draft" }>;
}>;

export type WordPressSeoMetadata = Readonly<{
  focusKeyphrase: string;
  seoTitle: string;
  metaDescription: string;
}>;

export type WordPressDraftCapabilities = Readonly<{
  yoastSeoMetadata: boolean;
  writableMetaKeys: readonly string[];
}>;

/**
 * External post state requested from WordPress. `future` releases the post
 * publicly at `scheduledAtGmt`; `draft` keeps it unpublished and only records
 * the intended time. See D-038.
 */
export type WordPressPostStatus = "draft" | "future";

export type WordPressDraftUpdatePayload = Readonly<
  Omit<WordPressDraftPayload, "status"> & { status?: WordPressPostStatus }
>;

export type WordPressDraftPayload = Readonly<{
  title: string;
  content: string;
  excerpt: string;
  status: WordPressPostStatus;
  categories: readonly string[];
  slug?: string;
  featuredMediaId?: string;
  seoMetadata?: WordPressSeoMetadata;
  /** Offset-bearing ISO instant. Converted to WordPress `date_gmt` on send. */
  scheduledAt?: string;
}>;

export type WordPressDraftCreateResult = Readonly<{
  externalId: string;
  responseStatus: string;
}>;

export class WordPressDraftCreateUncertainError extends Error {
  readonly code = "WORDPRESS_DRAFT_CREATE_UNKNOWN_RESULT";

  constructor() {
    super("WordPress may have created the Draft, but the result could not be confirmed.");
    this.name = "WordPressDraftCreateUncertainError";
  }
}

export class WordPressDraftNotFoundError extends Error {
  readonly code = "WORDPRESS_DRAFT_NOT_FOUND";

  constructor() {
    super("WordPress reported that the recorded Post ID no longer exists.");
    this.name = "WordPressDraftNotFoundError";
  }
}

export type WordPressExternalDraft = Readonly<{
  externalId: string;
  status: string;
  title: string;
  content: string;
  categoryIds: readonly string[];
  tagIds: readonly string[];
  featuredMediaId?: string;
  seoMetadata?: WordPressSeoMetadata;
  /** Raw `date_gmt` as returned by WordPress. Naive datetime already in UTC. */
  dateGmt?: string;
}>;

export type WordPressDraftVerification = Readonly<{
  verified: boolean;
  checks: readonly Readonly<{ key: string; passed: boolean }>[];
}>;

type WordPressPostResponse = Readonly<{
  id?: string | number;
  status?: string;
  title?: Readonly<{ raw?: string; rendered?: string }>;
  content?: Readonly<{ raw?: string; rendered?: string }>;
  categories?: readonly (string | number)[];
  tags?: readonly (string | number)[];
  featured_media?: string | number;
  meta?: Readonly<Record<string, unknown>>;
  date_gmt?: string;
}>;

const yoastSeoMetaKeys = Object.freeze([
  "_yoast_wpseo_focuskw",
  "_yoast_wpseo_title",
  "_yoast_wpseo_metadesc",
] as const);

export class WordPressDraftPublishingAdapter implements PublishingAdapter {
  readonly platform = "wordpress";

  constructor(
    private readonly request: typeof fetch = fetch,
    private readonly renderer = new WordPressHtmlRenderer(),
  ) {}

  async prepare(request: PublicationRequest): Promise<WordPressPreparedDraft> {
    return Object.freeze({
      payload: Object.freeze({
        html: this.renderer.render(request.content),
        title: request.content.title,
        type: "save-draft" as const,
      }),
      platform: this.platform,
      request,
    });
  }

  async publish(publication: PreparedPublication): Promise<PublicationResult> {
    void publication;
    throw new Error("Public publishing is outside the WordPress Draft scope.");
  }

  async capabilities(input: WordPressConnectionInput): Promise<WordPressDraftCapabilities> {
    const response = await this.safeRequest(
      `${normalizeSiteUrl(input.siteUrl)}/wp-json/wp/v2/posts`,
      {
        method: "OPTIONS",
        headers: {
          Accept: "application/json",
          Authorization: createWordPressAuthorizationHeader(input.username, input.applicationPassword),
        },
      },
      "WordPress Draft capabilities could not be verified.",
    );
    const value = await objectResponse(response, "WordPress returned an invalid Draft capability response.");
    const schema = objectValue(value.schema);
    const properties = objectValue(schema?.properties);
    const meta = objectValue(properties?.meta);
    const metaProperties = objectValue(meta?.properties);
    const writableMetaKeys = yoastSeoMetaKeys.filter((key) =>
      Object.prototype.hasOwnProperty.call(metaProperties ?? {}, key));
    return Object.freeze({
      yoastSeoMetadata: writableMetaKeys.length === yoastSeoMetaKeys.length,
      writableMetaKeys: Object.freeze([...writableMetaKeys]),
    });
  }

  async createDraft(
    input: WordPressConnectionInput & Readonly<{ payload: WordPressDraftPayload }>,
  ): Promise<WordPressDraftCreateResult> {
    const payload = createPayload(input.payload);
    let response: Response;
    try {
      response = await this.request(`${normalizeSiteUrl(input.siteUrl)}/wp-json/wp/v2/posts`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: createWordPressAuthorizationHeader(input.username, input.applicationPassword),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch {
      throw new WordPressDraftCreateUncertainError();
    }
    if (response.status === 408 || response.status >= 500) {
      throw new WordPressDraftCreateUncertainError();
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error("WordPress draft authentication or permission verification failed.");
    }
    if (!response.ok) throw new Error(await rejectionMessage(response, "WordPress draft could not be created."));
    let raw: WordPressPostResponse;
    try { raw = await postResponse(response); }
    catch { throw new WordPressDraftCreateUncertainError(); }
    if ((typeof raw.id !== "string" && typeof raw.id !== "number") || !String(raw.id).trim()) {
      throw new WordPressDraftCreateUncertainError();
    }
    return Object.freeze({ externalId: String(raw.id), responseStatus: raw.status ?? "unknown" });
  }

  /**
   * Rewrites a Post that already exists instead of creating another one.
   *
   * Publishing the same manuscript twice used to leave two Posts, because the
   * execution identity carries the manuscript revision: editing one sentence
   * produced a new identity, and a new identity meant a new Post. Measured on
   * brightjaetech.kr 2026-08-14 — one article became Posts 92, 95, 98 and 101,
   * and the reader-facing one had to be moved to the trash by hand.
   *
   * Two differences from `createDraft`. `status` is omitted unless the caller
   * asks for one, so updating an article that is already public does not quietly
   * return it to a draft. And a failed request is an ordinary failure rather
   * than an uncertain one: writing the same body twice leaves the same Post, so
   * a retry cannot duplicate anything.
   */
  async updateDraft(
    input: WordPressConnectionInput & Readonly<{ externalId: string; payload: WordPressDraftUpdatePayload }>,
  ): Promise<WordPressDraftCreateResult> {
    const externalId = postId(input.externalId);
    const payload = updatePayload(input.payload);
    let response: Response;
    try {
      response = await this.request(`${normalizeSiteUrl(input.siteUrl)}/wp-json/wp/v2/posts/${externalId}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: createWordPressAuthorizationHeader(input.username, input.applicationPassword),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch {
      throw new Error("WordPress Post could not be updated.");
    }
    if (response.status === 404) throw new WordPressDraftNotFoundError();
    if (response.status === 401 || response.status === 403) {
      throw new Error("WordPress draft authentication or permission verification failed.");
    }
    if (!response.ok) throw new Error(await rejectionMessage(response, "WordPress Post could not be updated."));
    const raw = await postResponse(response);
    if ((typeof raw.id !== "string" && typeof raw.id !== "number") || !String(raw.id).trim()) {
      throw new Error("WordPress returned an invalid Post update response.");
    }
    return Object.freeze({ externalId: String(raw.id), responseStatus: raw.status ?? "unknown" });
  }

  async readDraft(
    input: WordPressConnectionInput & Readonly<{ externalId: string }>,
  ): Promise<WordPressExternalDraft> {
    const externalId = postId(input.externalId);
    let response: Response;
    try {
      response = await this.request(
        `${normalizeSiteUrl(input.siteUrl)}/wp-json/wp/v2/posts/${externalId}?context=edit`,
        {
          headers: {
            Accept: "application/json",
            Authorization: createWordPressAuthorizationHeader(input.username, input.applicationPassword),
          },
        },
      );
    } catch {
      throw new Error("WordPress draft could not be re-read for verification.");
    }
    if (response.status === 404) throw new WordPressDraftNotFoundError();
    if (response.status === 401 || response.status === 403) {
      throw new Error("WordPress draft authentication or permission verification failed.");
    }
    if (!response.ok) throw new Error("WordPress draft could not be re-read for verification.");
    return externalDraft(await postResponse(response));
  }

  verifyDraft(
    draft: WordPressExternalDraft,
    expected: Readonly<{
      externalId: string;
      title: string;
      content: string;
      categoryIds: readonly string[];
      mediaUrls: readonly string[];
      featuredMediaId?: string;
      seoMetadata?: WordPressSeoMetadata;
      status?: WordPressPostStatus;
      scheduledAt?: string;
    }>,
  ): WordPressDraftVerification {
    const expectedStatus = expected.status ?? "draft";
    const checks = Object.freeze([
      check("external_id", draft.externalId === expected.externalId),
      check("draft_status", draft.status === expectedStatus),
      ...(expected.scheduledAt
        ? [check("scheduled_time", sameGmtDateTime(draft.dateGmt, expected.scheduledAt))]
        : []),
      check("title", normalizedText(draft.title) === normalizedText(expected.title)),
      check("meaningful_content", containsExpectedMeaningfulSegments(draft.content, expected.content)),
      check("categories", sameIds(draft.categoryIds, expected.categoryIds)),
      check("tags_unused", draft.tagIds.length === 0),
      check("media_urls", expected.mediaUrls.every((url) => draft.content.includes(url))),
      check("featured_media", expected.featuredMediaId === undefined
        ? draft.featuredMediaId === undefined
        : draft.featuredMediaId === expected.featuredMediaId),
      check("seo_metadata", expected.seoMetadata === undefined
        ? draft.seoMetadata === undefined
        : sameSeoMetadata(draft.seoMetadata, expected.seoMetadata)),
    ]);
    return Object.freeze({ verified: checks.every((item) => item.passed), checks });
  }

  private async safeRequest(url: string, init: RequestInit, message: string): Promise<Response> {
    let response: Response;
    try { response = await this.request(url, init); }
    catch { throw new Error(message); }
    if (response.status === 401 || response.status === 403) {
      throw new Error("WordPress draft authentication or permission verification failed.");
    }
    if (!response.ok) throw new Error(message);
    return response;
  }
}

function createPayload(payload: WordPressDraftPayload): Readonly<Record<string, unknown>> {
  if (!payload.title.trim() || !meaningfulText(payload.content)) {
    throw new Error("WordPress draft title and meaningful content are required.");
  }
  const categories = normalizedNumericIds(payload.categories, "category");
  if (!categories.length) throw new Error("WordPress draft categories are required.");
  const scheduledAt = payload.scheduledAt?.trim();
  if (payload.status === "future" && !scheduledAt) {
    throw new Error("WordPress scheduled publishing requires a scheduled time.");
  }
  const result: Record<string, unknown> = {
    title: payload.title,
    content: payload.content,
    excerpt: payload.excerpt,
    status: payload.status,
    categories: categories.map(Number),
  };
  if (scheduledAt) result.date_gmt = wordpressGmtDateTime(scheduledAt);
  if (payload.slug?.trim()) result.slug = payload.slug.trim();
  if (payload.featuredMediaId !== undefined) {
    result.featured_media = Number(normalizedNumericIds([payload.featuredMediaId], "featured media")[0]);
  }
  if (payload.seoMetadata) {
    result.meta = {
      _yoast_wpseo_focuskw: requiredSeoValue(payload.seoMetadata.focusKeyphrase, "focus keyphrase"),
      _yoast_wpseo_title: requiredSeoValue(payload.seoMetadata.seoTitle, "SEO title"),
      _yoast_wpseo_metadesc: requiredSeoValue(payload.seoMetadata.metaDescription, "meta description"),
    };
  }
  return result;
}

/**
 * The same body as a create, minus the one field an update must not assert.
 * A Post that the reader can already see keeps whatever state WordPress holds.
 */
function updatePayload(payload: WordPressDraftUpdatePayload): Readonly<Record<string, unknown>> {
  const result = { ...createPayload({ ...payload, status: payload.status ?? "draft" }) } as Record<string, unknown>;
  if (payload.status === undefined) delete result.status;
  return Object.freeze(result);
}

async function postResponse(response: Response): Promise<WordPressPostResponse> {
  const value = await objectResponse(response, "WordPress returned an invalid draft response.");
  return value as WordPressPostResponse;
}

/**
 * WordPress reports why it refused a write in the response body. Without it a
 * rejected payload is indistinguishable from any other failure, so surface the
 * REST error code and status while leaving the body itself out.
 */
async function rejectionMessage(response: Response, fallback: string): Promise<string> {
  let detail = "";
  try {
    const value = await response.json() as unknown;
    if (value && typeof value === "object") {
      const body = value as Readonly<{ code?: unknown; message?: unknown }>;
      detail = [body.code, body.message]
        .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
        .join(": ")
        .slice(0, 200);
    }
  } catch {
    detail = "";
  }
  return detail ? `${fallback} (${response.status} ${detail})` : `${fallback} (${response.status})`;
}

async function objectResponse(response: Response, message: string): Promise<Record<string, unknown>> {
  try {
    const value = await response.json() as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new Error(message);
  }
}

function externalDraft(value: WordPressPostResponse): WordPressExternalDraft {
  if ((typeof value.id !== "string" && typeof value.id !== "number") || !String(value.id).trim()) {
    throw new Error("WordPress returned an invalid draft response.");
  }
  const featuredMediaId = externalFeaturedMediaId(value.featured_media);
  const seoMetadata = externalSeoMetadata(value.meta);
  const dateGmt = typeof value.date_gmt === "string" && value.date_gmt.trim()
    ? value.date_gmt.trim()
    : undefined;
  return Object.freeze({
    externalId: String(value.id),
    status: typeof value.status === "string" ? value.status : "",
    title: value.title?.raw ?? value.title?.rendered ?? "",
    content: value.content?.raw ?? value.content?.rendered ?? "",
    categoryIds: Object.freeze((value.categories ?? []).map(String)),
    tagIds: Object.freeze((value.tags ?? []).map(String)),
    ...(featuredMediaId ? { featuredMediaId } : {}),
    ...(seoMetadata ? { seoMetadata } : {}),
    ...(dateGmt ? { dateGmt } : {}),
  });
}

/**
 * WordPress stores `date_gmt` as a naive UTC datetime. Convert an offset-bearing
 * ISO instant into that shape so the request and the later re-read compare
 * against the same value.
 */
export function wordpressGmtDateTime(value: string): string {
  const normalized = value.trim();
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(normalized)) {
    throw new Error("WordPress scheduled time must include a timezone offset.");
  }
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) throw new Error("WordPress scheduled time is invalid.");
  return new Date(timestamp).toISOString().replace(/\.\d{3}Z$/, "");
}

function sameGmtDateTime(actual: string | undefined, expectedScheduledAt: string): boolean {
  return Boolean(actual && naiveGmtValue(actual) === wordpressGmtDateTime(expectedScheduledAt));
}

/**
 * Compares WordPress-returned values without re-parsing them. A naive datetime
 * would otherwise be read as local time and shift the comparison by the host
 * offset.
 */
function naiveGmtValue(value: string): string {
  return value.trim().replace(/\.\d+/, "").replace(/z$/i, "");
}

function postId(value: string): string {
  const normalized = value.trim();
  if (!/^[1-9]\d*$/.test(normalized) || !Number.isSafeInteger(Number(normalized))) {
    throw new Error("WordPress Post ID is invalid.");
  }
  return normalized;
}

function normalizedNumericIds(values: readonly string[], name: string): readonly string[] {
  const ids = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  if (ids.some((value) => !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))) {
    throw new Error(`WordPress ${name} ID is invalid.`);
  }
  return ids;
}

function sameIds(actual: readonly string[], expected: readonly string[]): boolean {
  const left = [...new Set(actual)].sort();
  const right = [...new Set(expected)].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function meaningfulText(value: string): string {
  return normalizedText(value
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " "));
}

function containsExpectedMeaningfulSegments(actualHtml: string, expectedHtml: string): boolean {
  const expectedSegments = meaningfulSegments(expectedHtml);
  const actualSegments = meaningfulSegments(actualHtml);
  if (!expectedSegments.length || !actualSegments.length) return false;
  let expectedIndex = 0;
  for (const actual of actualSegments) {
    if (actual === expectedSegments[expectedIndex]) expectedIndex += 1;
    if (expectedIndex === expectedSegments.length) return true;
  }
  return false;
}

function meaningfulSegments(value: string): readonly string[] {
  const html = value.replace(/<!--[\s\S]*?-->/g, " ");
  const pattern = /<(h[1-6]|p|li|blockquote|pre|figcaption|th|td|a)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
  const segments: string[] = [];
  for (const match of html.matchAll(pattern)) {
    const text = meaningfulText(match[2]);
    if (text) segments.push(text);
  }
  if (!segments.length) {
    const fallback = meaningfulText(html);
    if (fallback) segments.push(fallback);
  }
  return Object.freeze(segments);
}

function normalizedText(value: string): string {
  return decodeEntities(value).replace(/\s+/g, " ").trim();
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;/gi, "–")
    .replace(/&mdash;/gi, "—")
    .replace(/&hellip;/gi, "…")
    .replace(/&lsquo;|&rsquo;/gi, "'")
    .replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_entity, hexadecimal: string | undefined, decimal: string | undefined) => {
      const codePoint = Number.parseInt(hexadecimal ?? decimal ?? "", hexadecimal ? 16 : 10);
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : "";
    });
}

function externalFeaturedMediaId(value: WordPressPostResponse["featured_media"]): string | undefined {
  if (value === undefined || String(value) === "0") return undefined;
  return String(value);
}

function externalSeoMetadata(meta: WordPressPostResponse["meta"]): WordPressSeoMetadata | undefined {
  if (!meta) return undefined;
  const focusKeyphrase = stringValue(meta._yoast_wpseo_focuskw);
  const seoTitle = stringValue(meta._yoast_wpseo_title);
  const metaDescription = stringValue(meta._yoast_wpseo_metadesc);
  if (!focusKeyphrase && !seoTitle && !metaDescription) return undefined;
  return Object.freeze({ focusKeyphrase, seoTitle, metaDescription });
}

function sameSeoMetadata(
  actual: WordPressSeoMetadata | undefined,
  expected: WordPressSeoMetadata,
): boolean {
  return Boolean(actual
    && normalizedText(actual.focusKeyphrase) === normalizedText(expected.focusKeyphrase)
    && normalizedText(actual.seoTitle) === normalizedText(expected.seoTitle)
    && normalizedText(actual.metaDescription) === normalizedText(expected.metaDescription));
}

function requiredSeoValue(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`WordPress ${name} is required.`);
  return normalized;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function check(key: string, passed: boolean): Readonly<{ key: string; passed: boolean }> {
  return Object.freeze({ key, passed });
}
