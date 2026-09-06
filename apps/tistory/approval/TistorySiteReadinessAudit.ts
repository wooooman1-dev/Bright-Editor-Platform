import { evaluatePublicPageIndexability } from "../../../core/approval";
import type {
  SiteApprovalReadinessAdapter,
  SiteApprovalReadinessAuditInput,
  SiteApprovalReadinessRequirement,
  SiteApprovalReadinessSnapshot,
} from "../../../core/approval";

export type TistorySiteAuditFetcher = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export type TistorySiteReadinessAuditInput = Readonly<{
  blogUrl: string;
  checkedAt: string;
  expectedTerms: readonly string[];
  fetcher?: TistorySiteAuditFetcher;
  timeoutMs?: number;
}>;

export const tistorySiteReadinessAdapter: SiteApprovalReadinessAdapter = Object.freeze({
  platform: "tistory",
  async audit(input: SiteApprovalReadinessAuditInput) {
    const blogUrl = typeof input.connection.publicMetadata.blogUrl === "string"
      ? input.connection.publicMetadata.blogUrl.trim()
      : "";
    if (!blogUrl) {
      return Object.freeze({
        version: "1.0",
        status: "needs_review",
        checkedAt: input.checkedAt,
        checks: Object.freeze([
          Object.freeze({
            key: "public_site",
            passed: false,
            message: "Tistory 공개 블로그 주소가 연결 정보에 없습니다.",
          }),
        ]),
      });
    }

    return auditTistorySiteReadiness({
      blogUrl,
      checkedAt: input.checkedAt,
      expectedTerms: input.expectedTerms,
      fetcher: input.fetcher,
    });
  },
});

type MutableSiteCheck = {
  key: string;
  passed: boolean;
  message: string;
  requirement?: SiteApprovalReadinessRequirement;
};

/**
 * Audits the public Tistory surface without using another AI call.
 *
 * The audit intentionally checks only facts observable from the public site.
 * It does not infer AdSense approval and it does not treat a stored Tistory
 * session as evidence that the public site is ready.
 */
export async function auditTistorySiteReadiness(
  input: TistorySiteReadinessAuditInput,
): Promise<SiteApprovalReadinessSnapshot> {
  const fetcher = input.fetcher ?? fetch;
  const timeoutMs = input.timeoutMs ?? 12_000;
  const checks: MutableSiteCheck[] = [];

  let page: PublicHtmlPage;
  try {
    page = await fetchHtmlPage(input.blogUrl, fetcher, timeoutMs);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "공개 사이트를 불러오지 못했습니다.";
    return Object.freeze({
      version: "1.0",
      status: "blocked",
      checkedAt: input.checkedAt,
      checks: Object.freeze([
        Object.freeze({ key: "public_access", passed: false, message: `공개 사이트 접근 실패: ${detail}` }),
        Object.freeze({ key: "https", passed: false, message: "공개 HTTPS 주소를 확인하지 못했습니다." }),
        Object.freeze({ key: "navigation", passed: false, message: "메뉴와 내부 탐색 구조를 확인하지 못했습니다." }),
        Object.freeze({ key: "privacy", passed: false, message: "개인정보처리방침 링크를 확인하지 못했습니다." }),
        Object.freeze({ key: "about_contact", passed: false, message: "권장: 사이트 소개 또는 문의 경로를 확인하지 못했습니다.", requirement: "recommended" as const }),
        Object.freeze({ key: "mobile", passed: false, message: "모바일 viewport 설정을 확인하지 못했습니다." }),
        Object.freeze({ key: "broken_links", passed: false, message: "내부 링크 정상 여부를 확인하지 못했습니다." }),
      ]),
    });
  }

  const publicAccess = page.status >= 200 && page.status < 400 && page.text.length >= 300;
  checks.push({
    key: "public_access",
    passed: publicAccess,
    message: publicAccess
      ? `공개 사이트가 정상 응답했습니다 (${page.status}).`
      : `공개 사이트 응답 또는 의미 있는 본문이 부족합니다 (${page.status}).`,
  });

  const https = page.finalUrl.startsWith("https://");
  checks.push({
    key: "https",
    passed: https,
    message: https ? "공개 사이트가 HTTPS로 제공됩니다." : "공개 사이트가 HTTPS로 제공되지 않습니다.",
  });

  const expectedTerms = input.expectedTerms.map(normalizeText).filter((value) => value.length >= 2);
  const identityText = normalizeText(`${page.title} ${page.description} ${page.text.slice(0, 5000)}`);
  const identityMatched = expectedTerms.length === 0 || expectedTerms.some((term) => identityText.includes(term));
  checks.push({
    key: "site_identity",
    passed: identityMatched,
    message: identityMatched
      ? "Project 주제와 연결되는 사이트 정체성 신호를 확인했습니다."
      : "공개 첫 화면에서 Project 주제와 연결되는 사이트 정체성을 확인하지 못했습니다.",
  });

  const mobile = /<meta[^>]+name=["']viewport["'][^>]*>/i.test(page.html)
    || /<meta[^>]+content=["'][^"']*width=device-width[^"']*["'][^>]*>/i.test(page.html);
  checks.push({
    key: "mobile",
    passed: mobile,
    message: mobile ? "모바일 viewport 설정을 확인했습니다." : "모바일 viewport 설정을 확인하지 못했습니다.",
  });

  const internalLinks = collectInternalLinks(page.html, page.finalUrl);
  const navigation = internalLinks.length >= 3 && /(?:category|menu|nav|카테고리|메뉴)/i.test(page.html);
  checks.push({
    key: "navigation",
    passed: navigation,
    message: navigation
      ? `메뉴·내부 탐색 링크 ${internalLinks.length}개를 확인했습니다.`
      : `메뉴와 충분한 내부 탐색 링크를 확인하지 못했습니다 (${internalLinks.length}개).`,
  });

  const categoryLinks = internalLinks.filter((url) => /\/category(?:\/|$)|\/m\/category(?:\/|$)/i.test(new URL(url).pathname));
  checks.push({
    key: "categories",
    passed: categoryLinks.length > 0,
    message: categoryLinks.length > 0
      ? `공개 카테고리 경로 ${categoryLinks.length}개를 확인했습니다.`
      : "공개 카테고리 경로를 확인하지 못했습니다.",
  });

  /**
   * 공개 홈이 검색 색인에서 빠져 있으면 나머지 검사는 의미가 없다.
   *
   * 워드프레스 감사에는 이 검사가 있는데 티스토리에는 없었다. AGENTS.md 14장이
   * 금지하는 "약한 티스토리 승인 경로"다. 2026-08-14 실측에서 워드프레스 쪽은
   * 게이트가 15건 전부 통과라고 보고한 같은 날 Search Console 이 세 페이지를
   * NOINDEX 로 제외했다고 보고했다 — 열어 보지 않으면 알 수 없다.
   */
  const indexability = evaluatePublicPageIndexability({
    html: page.html,
    ...(page.xRobotsTag ? { xRobotsTag: page.xRobotsTag } : {}),
  });
  checks.push({
    key: "public_indexable",
    passed: indexability.indexable,
    message: indexability.indexable
      ? "공개 홈이 검색 색인에서 제외되지 않았습니다."
      : `공개 홈이 검색 색인에서 제외되어 있습니다 (${indexability.blockedBy === "header" ? "X-Robots-Tag" : "meta robots"}: ${indexability.directive ?? "noindex"}).`,
    ...(indexability.indexable ? {} : { action: "티스토리 관리 → 블로그 설정에서 검색엔진 수집 허용을 켜고, 사용 중인 스킨이 noindex 메타를 넣고 있는지 확인하세요." }),
  });

  const linksAndText = `${page.html} ${page.text}`;
  const privacy = /(?:개인정보\s*처리방침|privacy\s*policy|privacy)/i.test(linksAndText);
  checks.push({
    key: "privacy",
    passed: privacy,
    message: privacy ? "개인정보처리방침 경로를 확인했습니다." : "개인정보처리방침 경로를 확인하지 못했습니다.",
  });

  const about = /(?:사이트\s*소개|블로그\s*소개|운영자\s*소개|about)/i.test(linksAndText);
  const contact = /(?:문의|연락처|contact|방명록)/i.test(linksAndText);
  checks.push({
    key: "about_contact",
    passed: about && contact,
    requirement: "recommended",
    message: about && contact
      ? "권장 사이트 소개와 문의 경로를 확인했습니다."
      : `권장: 사이트 소개 ${about ? "확인" : "미확인"} · 문의 경로 ${contact ? "확인" : "미확인"}.`,
  });

  const placeholderFree = !/(?:공사\s*중|준비\s*중|coming\s*soon|under\s*construction|lorem\s*ipsum|내용을\s*입력)/i.test(page.text);
  checks.push({
    key: "placeholder_free",
    passed: placeholderFree,
    message: placeholderFree ? "공사 중·placeholder 문구가 발견되지 않았습니다." : "공사 중 또는 placeholder 문구가 발견되었습니다.",
  });

  const sampledLinks = internalLinks
    .filter((url) => !shouldSkipLink(url))
    .slice(0, 8);
  const broken = await findBrokenLinks(sampledLinks, fetcher, timeoutMs);
  checks.push({
    key: "broken_links",
    passed: sampledLinks.length > 0 && broken.length === 0,
    message: sampledLinks.length === 0
      ? "검사할 공개 내부 링크가 없습니다."
      : broken.length === 0
        ? `공개 내부 링크 ${sampledLinks.length}개 표본 검사를 통과했습니다.`
        : `깨지거나 접근할 수 없는 내부 링크 ${broken.length}개가 있습니다: ${broken.join(", ")}`,
  });

  const requiredFailures = checks.filter((check) => !check.passed && (check.requirement ?? "required") === "required");
  const criticalKeys = new Set(["public_access", "https", "placeholder_free"]);
  const criticalFailure = requiredFailures.some((check) => criticalKeys.has(check.key));

  return Object.freeze({
    version: "1.0",
    status: criticalFailure ? "blocked" : requiredFailures.length ? "needs_review" : "passed",
    checkedAt: input.checkedAt,
    checks: Object.freeze(checks.map((check) => Object.freeze(check))),
  });
}

type PublicHtmlPage = Readonly<{
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string;
  html: string;
  text: string;
  /** 스킨을 건드리지 않고도 색인에서 뺄 수 있는 경로라 헤더도 읽는다. */
  xRobotsTag?: string;
  title: string;
  description: string;
}>;

async function fetchHtmlPage(
  url: string,
  fetcher: TistorySiteAuditFetcher,
  timeoutMs: number,
): Promise<PublicHtmlPage> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "BrightStudioApprovalAudit/1.0",
      },
    });
    const contentType = response.headers.get("content-type") ?? "";
    const html = (await response.text()).slice(0, 1_500_000);
    return Object.freeze({
      requestedUrl: url,
      finalUrl: response.url || url,
      status: response.status,
      contentType,
      html,
      text: htmlToText(html),
      ...(response.headers.get("x-robots-tag") ? { xRobotsTag: response.headers.get("x-robots-tag")! } : {}),
      title: extractFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
      description: extractFirst(html, /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["'][^>]*>/i),
    });
  } finally {
    clearTimeout(timeout);
  }
}

function collectInternalLinks(html: string, baseUrl: string): readonly string[] {
  const base = new URL(baseUrl);
  const links = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)) {
    const raw = match[1]?.trim();
    if (!raw || raw.startsWith("#") || /^(?:javascript:|mailto:|tel:)/i.test(raw)) continue;
    try {
      const url = new URL(raw, base);
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      if (url.hostname !== base.hostname) continue;
      url.hash = "";
      links.add(url.toString());
    } catch {
      continue;
    }
  }
  return Object.freeze([...links]);
}

async function findBrokenLinks(
  urls: readonly string[],
  fetcher: TistorySiteAuditFetcher,
  timeoutMs: number,
): Promise<readonly string[]> {
  const broken: string[] = [];
  for (const url of urls) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let response = await fetcher(url, {
        method: "HEAD",
        redirect: "follow",
        signal: controller.signal,
        headers: { "User-Agent": "BrightStudioApprovalAudit/1.0" },
      });
      if (response.status === 405 || response.status === 403) {
        response = await fetcher(url, {
          method: "GET",
          redirect: "follow",
          signal: controller.signal,
          headers: { "User-Agent": "BrightStudioApprovalAudit/1.0" },
        });
      }
      if (response.status >= 400) broken.push(url);
    } catch {
      broken.push(url);
    } finally {
      clearTimeout(timeout);
    }
  }
  return Object.freeze(broken);
}

function shouldSkipLink(value: string): boolean {
  const pathname = new URL(value).pathname;
  return /\/(?:admin|manage|login|logout|rss|feed|comment|guestbook)(?:\/|$)/i.test(pathname);
}

function htmlToText(html: string): string {
  return decodeEntities(html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function extractFirst(html: string, pattern: RegExp): string {
  return decodeEntities(pattern.exec(html)?.[1]?.replace(/\s+/g, " ").trim() ?? "");
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}
