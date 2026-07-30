import type {
  SiteApprovalReadinessAdapter,
  SiteApprovalReadinessAuditInput,
  SiteApprovalReadinessFetch,
  SiteApprovalReadinessRequirement,
  SiteApprovalReadinessSnapshot,
} from "../../../core/approval";

export type WordPressSiteReadinessAuditInput = Readonly<{
  siteUrl: string;
  checkedAt: string;
  expectedTerms: readonly string[];
  fetcher?: SiteApprovalReadinessFetch;
  timeoutMs?: number;
  maxRedirects?: number;
  maxResponseBytes?: number;
}>;

type MutableSiteCheck = {
  key: string;
  passed: boolean;
  message: string;
  requirement?: SiteApprovalReadinessRequirement;
};

type PublicResource = Readonly<{
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
  redirectCount: number;
}>;

type PublicLink = Readonly<{
  url: string;
  text: string;
}>;

export const wordpressSiteReadinessAdapter: SiteApprovalReadinessAdapter = Object.freeze({
  platform: "wordpress",
  audit(input: SiteApprovalReadinessAuditInput) {
    const siteUrl = typeof input.connection.publicMetadata.siteUrl === "string"
      ? input.connection.publicMetadata.siteUrl.trim()
      : "";
    return auditWordPressSiteReadiness({
      siteUrl,
      checkedAt: input.checkedAt,
      expectedTerms: input.expectedTerms,
      fetcher: input.fetcher,
    });
  },
});

/**
 * Audits only facts observable from the public WordPress surface.
 *
 * It never logs credentials, enters an admin/login path, sends a write request,
 * or treats an automated HTML check as an AdSense approval decision.
 */
export async function auditWordPressSiteReadiness(
  input: WordPressSiteReadinessAuditInput,
): Promise<SiteApprovalReadinessSnapshot> {
  const checks: MutableSiteCheck[] = [];
  const siteUrl = normalizePublicSiteUrl(input.siteUrl);
  if (!siteUrl) return inaccessibleSiteSnapshot(input.checkedAt, "WordPress 공개 siteUrl이 없거나 안전한 HTTP(S) URL이 아닙니다.");

  checks.push({
    key: "site_url",
    passed: true,
    message: `WordPress 공개 siteUrl 형식을 확인했습니다: ${siteUrl}`,
  });

  const session = new PublicAuditSession(
    input.fetcher ?? fetch,
    input.timeoutMs ?? 12_000,
    input.maxRedirects ?? 5,
    input.maxResponseBytes ?? 1_500_000,
  );

  let home: PublicResource;
  try {
    home = await session.get(siteUrl, "text/html,application/xhtml+xml");
  } catch (error) {
    return inaccessibleSiteSnapshot(
      input.checkedAt,
      `WordPress 공개 홈페이지 접근 실패: ${safeErrorMessage(error)}`,
      checks,
    );
  }

  const html = home.body;
  const text = htmlToText(html);
  const title = extractFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const publicAccess = home.status >= 200 && home.status < 400;
  checks.push({
    key: "public_access",
    passed: publicAccess,
    message: publicAccess
      ? `공개 홈페이지가 정상 응답했습니다 (${home.status}, 최종 URL: ${home.finalUrl}, redirect ${home.redirectCount}회).`
      : `공개 홈페이지가 정상 응답하지 않았습니다 (${home.status}, 최종 URL: ${home.finalUrl}).`,
  });

  const https = home.finalUrl.startsWith("https://");
  checks.push({
    key: "https",
    passed: https,
    message: https
      ? `최종 공개 URL이 HTTPS입니다: ${home.finalUrl}`
      : `최종 공개 URL이 HTTPS가 아닙니다: ${home.finalUrl}`,
  });

  const meaningfulPage = Boolean(title) && text.length >= 80;
  checks.push({
    key: "page_content",
    passed: meaningfulPage,
    message: meaningfulPage
      ? `공개 페이지의 title과 의미 있는 기본 본문을 확인했습니다 (${text.length}자).`
      : `공개 페이지의 기본 title 또는 의미 있는 본문이 부족합니다 (title ${title ? "확인" : "미확인"}, 본문 ${text.length}자).`,
  });

  const expectedTerms = input.expectedTerms.map(normalizeText).filter((value) => value.length >= 2);
  const identityText = normalizeText(`${title} ${text.slice(0, 8_000)}`);
  const identityMatched = expectedTerms.length === 0 || expectedTerms.some((term) => identityText.includes(term));
  checks.push({
    key: "site_identity",
    passed: identityMatched,
    message: identityMatched
      ? "Project 주제와 연결되는 공개 사이트 정체성 신호를 확인했습니다."
      : "공개 홈페이지에서 Project 주제와 연결되는 사이트 정체성을 확인하지 못했습니다.",
  });

  const mobileViewport = /<meta[^>]+name=["']viewport["'][^>]*>/i.test(html)
    && /<meta[^>]+(?:name=["']viewport["'][^>]*content=["'][^"']*width\s*=\s*device-width|content=["'][^"']*width\s*=\s*device-width[^"']*["'][^>]*name=["']viewport["'])/i.test(html);
  checks.push({
    key: "mobile_viewport",
    passed: mobileViewport,
    message: mobileViewport ? "모바일 viewport metadata를 확인했습니다." : "모바일 viewport metadata를 확인하지 못했습니다.",
  });

  const links = collectPublicLinks(html, home.finalUrl);
  const navigation = /<(?:nav|header)\b|role=["']navigation["']|class=["'][^"']*(?:menu|navigation|navbar)/i.test(html)
    && links.length >= 3;
  checks.push({
    key: "navigation",
    passed: navigation,
    message: navigation
      ? `주요 navigation과 공개 링크 ${links.length}개를 확인했습니다.`
      : `주요 navigation 또는 충분한 공개 링크를 확인하지 못했습니다 (${links.length}개).`,
  });

  const archiveLinks = links.filter((link) => /\/(?:category|tag|author|archives?)(?:\/|$)|[?&](?:cat|category_name)=/i.test(new URL(link.url).pathname + new URL(link.url).search));
  checks.push({
    key: "category_archive",
    passed: archiveLinks.length > 0,
    message: archiveLinks.length
      ? `Category 또는 archive 링크 후보 ${archiveLinks.length}개를 확인했습니다.`
      : "Category 또는 archive 링크 후보를 확인하지 못했습니다.",
  });

  const privacyLinks = matchingLinks(links, /(?:개인정보\s*처리방침|privacy(?:\s*policy)?|개인정보)/i);
  checks.push({
    key: "privacy",
    passed: privacyLinks.length > 0,
    message: privacyLinks.length
      ? `개인정보처리방침 링크 후보를 확인했습니다: ${privacyLinks[0]!.url}`
      : "개인정보처리방침 링크 후보를 확인하지 못했습니다.",
  });

  const aboutLinks = matchingLinks(links, /(?:사이트\s*소개|블로그\s*소개|운영자\s*소개|about)/i);
  checks.push({
    key: "about",
    passed: aboutLinks.length > 0,
    requirement: "recommended",
    message: aboutLinks.length
      ? `권장 사이트 소개 링크 후보를 확인했습니다: ${aboutLinks[0]!.url}`
      : "권장: 사이트 소개 링크 후보를 확인하지 못했습니다.",
  });

  const contactLinks = matchingLinks(links, /(?:문의(?:하기)?|연락처|contact)/i);
  checks.push({
    key: "contact",
    passed: contactLinks.length > 0,
    requirement: "recommended",
    message: contactLinks.length
      ? `권장 문의 링크 후보를 확인했습니다: ${contactLinks[0]!.url}`
      : "권장: 문의 또는 연락 링크 후보를 확인하지 못했습니다.",
  });

  const placeholderFree = !/(?:coming\s*soon|under\s*(?:construction|maintenance)|maintenance\s*mode|공사\s*중|점검\s*중|준비\s*중|lorem\s*ipsum|sample\s*page|hello\s*world|내용을\s*입력)/i.test(`${title} ${text}`);
  checks.push({
    key: "placeholder_free",
    passed: placeholderFree,
    message: placeholderFree
      ? "coming soon·maintenance·placeholder 위험 문구가 발견되지 않았습니다."
      : "coming soon, maintenance 또는 placeholder 위험 문구가 발견되었습니다.",
  });

  const robotsUrl = new URL("/robots.txt", home.finalUrl).toString();
  let robots: PublicResource | undefined;
  try {
    const response = await session.get(robotsUrl, "text/plain,*/*;q=0.5");
    if (response.status >= 200 && response.status < 400) robots = response;
  } catch {
    robots = undefined;
  }
  checks.push({
    key: "robots",
    passed: Boolean(robots),
    message: robots
      ? `robots.txt에 접근했습니다 (${robots.status}, 최종 URL: ${robots.finalUrl}).`
      : `robots.txt에 접근하지 못했습니다: ${robotsUrl}`,
  });

  const noindex = hasPublicNoindex(html);
  const robotsBlocked = robots ? robotsBlocksPublicCrawlers(robots.body) : true;
  const crawlerAccess = Boolean(robots) && !noindex && !robotsBlocked;
  checks.push({
    key: "crawler_access",
    passed: crawlerAccess,
    message: crawlerAccess
      ? "홈페이지 noindex와 robots.txt 전체 차단 신호가 발견되지 않았습니다."
      : `공개 crawler 접근을 통과 처리할 수 없습니다 (homepage noindex ${noindex ? "발견" : "미발견"}, robots 전체 차단 ${robotsBlocked ? "발견 또는 미확인" : "미발견"}).`,
  });

  const sitemapCandidates = sitemapCandidateUrls(robots?.body ?? "", siteUrl, home.finalUrl);
  const sitemap = await firstAccessibleSitemap(sitemapCandidates, session);
  checks.push({
    key: "sitemap",
    passed: Boolean(sitemap),
    message: sitemap
      ? `XML sitemap에 접근했습니다 (${sitemap.status}, 최종 URL: ${sitemap.finalUrl}).`
      : `접근 가능한 XML sitemap을 찾지 못했습니다. 검사 후보: ${sitemapCandidates.join(", ")}`,
  });

  checks.push(...manualReviewChecks());

  const requiredFailures = checks.filter((check) => !check.passed && (check.requirement ?? "required") === "required");
  const criticalKeys = new Set(["site_url", "public_access", "https", "page_content", "placeholder_free"]);
  const criticalFailure = requiredFailures.some((check) => criticalKeys.has(check.key));
  return Object.freeze({
    version: "1.0",
    status: criticalFailure ? "blocked" : requiredFailures.length ? "needs_review" : "passed",
    checkedAt: input.checkedAt,
    checks: Object.freeze(checks.map((check) => Object.freeze(check))),
  });
}

class PublicAuditSession {
  private readonly cache = new Map<string, Promise<PublicResource>>();

  constructor(
    private readonly fetcher: SiteApprovalReadinessFetch,
    private readonly timeoutMs: number,
    private readonly maxRedirects: number,
    private readonly maxResponseBytes: number,
  ) {}

  get(url: string, accept: string): Promise<PublicResource> {
    const key = `GET ${url} ${accept}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const request = this.fetchWithRedirects(url, accept);
    this.cache.set(key, request);
    return request;
  }

  private async fetchWithRedirects(requestedUrl: string, accept: string): Promise<PublicResource> {
    let currentUrl = requirePublicAuditUrl(requestedUrl);
    for (let redirectCount = 0; redirectCount <= this.maxRedirects; redirectCount += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetcher(currentUrl, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            Accept: accept,
            "User-Agent": "BrightStudioWordPressReadinessAudit/1.0",
          },
        });
        if (isRedirect(response.status)) {
          const location = response.headers.get("location");
          if (!location) throw new Error(`redirect ${response.status} 응답에 Location이 없습니다.`);
          if (redirectCount >= this.maxRedirects) throw new Error(`redirect 제한 ${this.maxRedirects}회를 초과했습니다.`);
          const nextUrl = requirePublicAuditUrl(new URL(location, currentUrl).toString());
          if (!samePublicHost(new URL(nextUrl), new URL(requestedUrl))) {
            throw new Error("공개 사이트와 다른 host로 redirect되어 검사를 중단했습니다.");
          }
          currentUrl = nextUrl;
          continue;
        }
        const body = await readLimitedBody(response, this.maxResponseBytes);
        return Object.freeze({
          requestedUrl,
          finalUrl: response.url || currentUrl,
          status: response.status,
          contentType: response.headers.get("content-type") ?? "",
          body,
          redirectCount,
        });
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new Error(`redirect 제한 ${this.maxRedirects}회를 초과했습니다.`);
  }
}

async function readLimitedBody(response: Response, maxBytes: number): Promise<string> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(`응답 크기가 ${maxBytes} byte 제한을 초과했습니다.`);
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let body = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`응답 크기가 ${maxBytes} byte 제한을 초과했습니다.`);
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
    return body;
  } finally {
    reader.releaseLock();
  }
}

async function firstAccessibleSitemap(
  urls: readonly string[],
  session: PublicAuditSession,
): Promise<PublicResource | undefined> {
  for (const url of urls) {
    try {
      const response = await session.get(url, "application/xml,text/xml,*/*;q=0.5");
      if (response.status < 200 || response.status >= 400) continue;
      if (/(?:<\?xml\b|<urlset\b|<sitemapindex\b)/i.test(response.body)
        || /(?:application|text)\/xml/i.test(response.contentType)) return response;
    } catch {
      continue;
    }
  }
  return undefined;
}

function sitemapCandidateUrls(robotsBody: string, siteUrl: string, finalHomeUrl: string): readonly string[] {
  const siteDirectory = new URL(siteUrl);
  siteDirectory.pathname = siteDirectory.pathname.endsWith("/") ? siteDirectory.pathname : `${siteDirectory.pathname}/`;
  siteDirectory.search = "";
  siteDirectory.hash = "";
  const candidates = [...robotsBody.matchAll(/^\s*Sitemap\s*:\s*(\S+)\s*$/gim)]
    .flatMap((match) => {
      try {
        const url = new URL(match[1]!, finalHomeUrl);
        return samePublicHost(url, new URL(finalHomeUrl)) ? [url.toString()] : [];
      } catch {
        return [];
      }
    });
  candidates.push(
    new URL("wp-sitemap.xml", siteDirectory).toString(),
    new URL("sitemap_index.xml", siteDirectory).toString(),
  );
  return Object.freeze([...new Set(candidates)]);
}

function collectPublicLinks(html: string, baseUrl: string): readonly PublicLink[] {
  const base = new URL(baseUrl);
  const links = new Map<string, PublicLink>();
  for (const match of html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const rawUrl = match[1]?.trim();
    if (!rawUrl || rawUrl.startsWith("#") || /^(?:javascript:|mailto:|tel:)/i.test(rawUrl)) continue;
    try {
      const url = new URL(rawUrl, base);
      if (!samePublicHost(url, base) || forbiddenPublicPath(url.pathname)) continue;
      url.hash = "";
      const normalized = url.toString();
      links.set(normalized, Object.freeze({ url: normalized, text: htmlToText(match[2] ?? "") }));
    } catch {
      continue;
    }
  }
  return Object.freeze([...links.values()]);
}

function matchingLinks(links: readonly PublicLink[], pattern: RegExp): readonly PublicLink[] {
  return links.filter((link) => pattern.test(`${link.text} ${new URL(link.url).pathname}`));
}

function manualReviewChecks(): readonly MutableSiteCheck[] {
  return [
    {
      key: "theme_plugin_review",
      passed: false,
      message: "Theme 또는 GeneratePress 사용 여부와 플러그인 충돌은 공개 HTML 자동 검사만으로 확정할 수 없습니다. 관리자 또는 수동 화면 검토가 필요합니다.",
    },
    {
      key: "mobile_visual_review",
      passed: false,
      message: "실제 모바일 시각 품질과 깨진 Template 여부는 viewport metadata만으로 통과 처리할 수 없습니다. 실제 기기 또는 브라우저 검토가 필요합니다.",
    },
    {
      key: "performance_review",
      passed: false,
      message: "실제 성능 점수는 이 공개 구조 검사에서 측정하지 않았습니다. 별도 성능 검토가 필요합니다.",
    },
    {
      key: "copyright_review",
      passed: false,
      message: "사이트 전체 이미지와 자료의 저작권·이용 조건은 홈페이지 응답만으로 확인할 수 없습니다. 권리 검토가 필요합니다.",
    },
    {
      key: "site_quality_consistency",
      passed: false,
      message: "공개 글 전체의 주제·품질 일관성은 홈페이지 표본만으로 확정할 수 없습니다. 사이트 전체 수동 검토가 필요합니다.",
    },
    {
      key: "search_console_review",
      passed: false,
      message: "Google Search Console 연결과 실제 색인 상태는 공개 사이트 응답에서 관찰할 수 없습니다. 별도 계정 검토가 필요합니다.",
    },
    {
      key: "adsense_external_approval",
      passed: false,
      requirement: "recommended",
      message: "외부 AdSense 승인 가능성은 자동 검사로 확정하거나 보장할 수 없습니다. 이 결과는 내부 준비 진단만 제공합니다.",
    },
  ];
}

function inaccessibleSiteSnapshot(
  checkedAt: string,
  message: string,
  prefix: readonly MutableSiteCheck[] = [],
): SiteApprovalReadinessSnapshot {
  const checks: MutableSiteCheck[] = [
    ...prefix,
    { key: "public_access", passed: false, message },
    { key: "https", passed: false, message: "최종 공개 HTTPS URL을 확인하지 못했습니다." },
    { key: "page_content", passed: false, message: "공개 페이지의 title과 기본 본문을 확인하지 못했습니다." },
    { key: "robots", passed: false, message: "robots.txt 접근 여부를 확인하지 못했습니다." },
    { key: "crawler_access", passed: false, message: "homepage noindex와 robots.txt crawler 차단 여부를 확인하지 못했습니다." },
    { key: "sitemap", passed: false, message: "XML sitemap 접근 여부를 확인하지 못했습니다." },
    { key: "privacy", passed: false, message: "개인정보처리방침 링크 후보를 확인하지 못했습니다." },
    { key: "about", passed: false, requirement: "recommended", message: "권장 사이트 소개 링크 후보를 확인하지 못했습니다." },
    { key: "contact", passed: false, requirement: "recommended", message: "권장 문의 링크 후보를 확인하지 못했습니다." },
    { key: "navigation", passed: false, message: "주요 navigation을 확인하지 못했습니다." },
    { key: "category_archive", passed: false, message: "Category 또는 archive 링크 후보를 확인하지 못했습니다." },
    { key: "mobile_viewport", passed: false, message: "모바일 viewport metadata를 확인하지 못했습니다." },
    { key: "placeholder_free", passed: false, message: "coming soon·maintenance·placeholder 위험 여부를 확인하지 못했습니다." },
    ...manualReviewChecks(),
  ];
  return Object.freeze({
    version: "1.0",
    status: "blocked",
    checkedAt,
    checks: Object.freeze(checks.map((check) => Object.freeze(check))),
  });
}

function normalizePublicSiteUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || !isPublicHostname(url.hostname)) return undefined;
    if (forbiddenPublicPath(url.pathname)) return undefined;
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function requirePublicAuditUrl(value: string): string {
  const normalized = normalizePublicSiteUrl(value);
  if (!normalized) throw new Error("로그인·관리자·로컬 네트워크가 아닌 안전한 공개 HTTP(S) URL만 검사할 수 있습니다.");
  return normalized;
}

function isPublicHostname(hostname: string): boolean {
  const value = hostname.toLocaleLowerCase("en-US").replace(/^\[|\]$/g, "");
  if (value === "localhost" || value === "::1" || value.endsWith(".local")) return false;
  if (/^(?:fc|fd)[0-9a-f]{2}:|^fe[89ab][0-9a-f]:/i.test(value)) return false;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value);
  if (!ipv4) return true;
  const octets = ipv4.slice(1).map(Number);
  if (octets.some((part) => part < 0 || part > 255)) return false;
  const [first, second] = octets;
  return !(first === 10
    || first === 127
    || first === 0
    || first === 169 && second === 254
    || first === 172 && second >= 16 && second <= 31
    || first === 192 && second === 168);
}

function forbiddenPublicPath(pathname: string): boolean {
  return /\/(?:wp-admin|wp-login\.php|admin|login)(?:\/|$)/i.test(pathname);
}

function samePublicHost(left: URL, right: URL): boolean {
  return left.hostname.replace(/^www\./i, "").toLocaleLowerCase("en-US")
    === right.hostname.replace(/^www\./i, "").toLocaleLowerCase("en-US");
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function hasPublicNoindex(html: string): boolean {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/(?:name|property)=["'](?:robots|googlebot|bingbot)["']/i.test(tag)) continue;
    const content = /content=["']([^"']*)["']/i.exec(tag)?.[1] ?? "";
    if (/\bnoindex\b/i.test(content)) return true;
  }
  return false;
}

function robotsBlocksPublicCrawlers(body: string): boolean {
  const normalized = body.replace(/#[^\r\n]*/g, "");
  return /User-agent\s*:\s*(?:\*|Googlebot|Mediapartners-Google)[\s\S]{0,800}?Disallow\s*:\s*\/\s*(?:\r?\n|$)/i.test(normalized);
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
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'");
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") return "요청 시간이 초과되었습니다.";
  return error instanceof Error ? error.message : "공개 사이트를 불러오지 못했습니다.";
}
