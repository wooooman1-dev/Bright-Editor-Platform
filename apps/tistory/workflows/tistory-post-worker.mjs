import { chromium } from "playwright";

const [blogId, storageStatePath] = process.argv.slice(2);
const origin = `https://${blogId}.tistory.com`;
const maxPages = 50;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: storageStatePath });
  const sessionPage = await context.newPage();
  await sessionPage.goto(`${origin}/manage/posts`, { waitUntil: "domcontentloaded", timeout: 30000 });
  if (!sessionPage.url().startsWith(`${origin}/manage`)) throw coded("session_expired");
  const page = await context.newPage();
  const collected = []; const discoveredUrls = new Set(); let pagesRead = 0; let partial = false; let diagnostic;
  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    try {
      await page.goto(`${origin}/?page=${pageNumber}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(500);
      const rows = await page.evaluate(({ expectedOrigin }) => {
        const anchors = [...document.querySelectorAll('a[href*="/entry/"]')];
        return anchors.flatMap((anchor) => {
          const href = anchor instanceof HTMLAnchorElement ? anchor.href : "";
          if (!href.startsWith(`${expectedOrigin}/entry/`)) return [];
          const container = anchor.closest("article, li, .post-item, .entry, .list_content") ?? anchor.parentElement;
          const titleNode = container?.querySelector("h1, h2, h3, [class*=title], [class*=tit_post], [class*=link_post]");
          const title = (anchor.getAttribute("title") || titleNode?.textContent || "").replace(/\s+/g, " ").trim();
          if (!title) return [];
          const categoryAnchor = container?.querySelector('a[href*="/category/"]');
          const time = container?.querySelector("time");
          const excerpt = (container?.querySelector("p, .summary, .excerpt")?.textContent ?? "").replace(/\s+/g, " ").trim();
          return [{ title, publishedUrl: href.split("#")[0], categoryName: categoryAnchor?.textContent?.trim(), publishedAt: time?.getAttribute("datetime") || time?.textContent?.trim(), excerpt }];
        });
      }, { expectedOrigin: origin });
      if (!rows.length) {
        if (pageNumber === 1) { const bodyText = await page.locator("body").innerText().catch(() => ""); if (!/게시물이?\s*없|등록된\s*글이\s*없|no posts/i.test(bodyText)) throw coded("selector_error"); }
        break;
      }
      const freshRows = rows.filter((row) => !discoveredUrls.has(row.publishedUrl));
      if (!freshRows.length) break;
      freshRows.forEach((row) => discoveredUrls.add(row.publishedUrl)); pagesRead += 1; collected.push(...freshRows);
    } catch { partial = collected.length > 0; diagnostic = `${pageNumber}페이지 조회 중 중단되었습니다.`; break; }
  }
  const seen = new Set(); const retrievedAt = new Date().toISOString(); const posts = [];
  const unique = collected.filter((item) => { const url = safePublicUrl(item.publishedUrl, origin); if (!url || seen.has(url)) return false; seen.add(url); return true; });
  for (let start = 0; start < unique.length; start += 6) {
    const verified = await Promise.all(unique.slice(start, start + 6).map(async (item) => ({ item, response: await context.request.get(item.publishedUrl, { timeout: 10000 }).catch(() => undefined) })));
    for (const { item, response } of verified) { if (!response?.ok()) { partial = true; continue; } const externalPostId = decodeURIComponent(new URL(item.publishedUrl).pathname.slice("/entry/".length)); posts.push({ platform: "tistory", externalPostId, title: item.title, publishedUrl: item.publishedUrl, ...(item.categoryName ? { categoryName: item.categoryName } : {}), ...(item.publishedAt ? { publishedAt: item.publishedAt } : {}), ...(item.excerpt ? { excerpt: item.excerpt.slice(0, 400) } : {}), keywords: terms(`${item.title} ${item.categoryName ?? ""}`), status: "public", retrievedAt }); }
  }
  process.stdout.write(`${JSON.stringify({ posts, state: partial ? "partial" : posts.length ? "success" : "empty", retrievedAt, pagesRead, ...(diagnostic ? { diagnostic } : {}) })}\n`);
  await context.close();
} catch (error) {
  const code = error?.code ?? (/browserType\.launch|Executable doesn't exist/i.test(String(error?.message)) ? "browser_launch_failed" : "connection_error");
  const safeMessage = code === "session_expired" ? "Tistory 로그인 세션이 만료되었습니다." : code === "browser_launch_failed" ? "게시글 조회용 브라우저를 시작할 수 없습니다." : code === "selector_error" ? "공개 게시글 목록 구조를 확인할 수 없습니다." : "Tistory 공개 게시글을 불러오지 못했습니다.";
  process.stdout.write(`${JSON.stringify({ errorCode: code, safeMessage, remediation: code === "session_expired" ? "플랫폼 연결에서 다시 연결해 주세요." : "연결 상태를 확인한 뒤 다시 시도해 주세요." })}\n`); process.exitCode = 1;
} finally { await browser?.close(); }

function safePublicUrl(value, expectedOrigin) { try { const url = new URL(value); return url.origin === expectedOrigin && url.pathname.startsWith("/entry/") && !url.pathname.includes("/manage") ? url.toString() : undefined; } catch { return undefined; } }
function terms(value) { return [...new Set(value.toLowerCase().replace(/[^0-9a-z가-힣\s]/g, " ").split(/\s+/).filter((term) => term.length >= 2))].slice(0, 20); }
function coded(code) { const error = new Error(code); error.code = code; return error; }
