import { chromium } from "playwright";

const [blogId, storageStatePath] = process.argv.slice(2);
let browser;
let page;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: storageStatePath });
  page = await context.newPage();
  await page.goto(`https://${blogId}.tistory.com/manage/newpost`, { waitUntil: "domcontentloaded", timeout: 30000 });
  if (!page.url().startsWith(`https://${blogId}.tistory.com/manage`)) throw coded("session_expired");
  const namedCategoryButton = page.getByRole("button", { name: /카테고리|분류/ }).first();
  const categoryControl = await namedCategoryButton.count() ? namedCategoryButton : page.locator('#category-btn, button[aria-controls*="category" i], button[class*="category" i], [class*="category" i] button, select[name*="category" i], select[id*="category" i]').first();
  await categoryControl.waitFor({ state: "attached", timeout: 15000 });
  if (await categoryControl.evaluate((element) => element.tagName !== "SELECT") && await categoryControl.isVisible()) await categoryControl.click();
  const categoryRoot = page.getByRole("listbox").first();
  await categoryRoot.waitFor({ state: "attached", timeout: 10000 });
  await categoryRoot.locator("option, [role=option], [data-category-id], [data-id], [data-value], input[value], button, a, li").first().waitFor({ state: "attached", timeout: 10000 });
  const categories = await categoryRoot.evaluate((root) => {
    const nodes = root.matches("select") ? [...root.querySelectorAll("option")] : [...root.querySelectorAll("[data-category-id], [data-id], [data-value], [role=option], input[value], button, a, li")];
    const seen = new Set();
    return nodes.flatMap((node) => {
      const element = /** @type {HTMLElement} */ (node);
      const carrier = element.closest("[data-category-id], [data-id], [data-value], [value]") ?? element.querySelector("[data-category-id], [data-id], [data-value], [value]") ?? element;
      const href = element.closest("a")?.getAttribute("href") ?? element.querySelector("a")?.getAttribute("href") ?? "";
      const id = carrier.getAttribute("data-category-id") ?? carrier.getAttribute("data-id") ?? carrier.getAttribute("data-value") ?? carrier.getAttribute("value") ?? element.id.match(/^category-item-(\d+)$/)?.[1] ?? href.match(/category(?:Id)?[=/](\d+)/i)?.[1] ?? "";
      const name = (element.textContent ?? "").replace(/\s+/g, " ").trim();
      if (!id || !name || id === "0" || seen.has(id) || /카테고리\s*없음|선택\s*안함|분류\s*없음/.test(name)) return [];
      seen.add(id);
      const listItem = element.closest("li");
      const nestedDepth = listItem ? Math.max(0, [...root.querySelectorAll("li")].filter((candidate) => candidate !== listItem && candidate.contains(listItem)).length) : 0;
      const depth = Number(element.getAttribute("data-depth") ?? element.getAttribute("aria-level") ?? nestedDepth);
      const parentId = element.getAttribute("data-parent-id") ?? listItem?.parentElement?.closest("li")?.querySelector("[data-category-id], [data-id], [data-value], [value]")?.getAttribute("data-category-id") ?? undefined;
      return [{ id, name, depth: Number.isFinite(depth) ? Math.max(0, depth) : 0, ...(parentId ? { parentId } : {}) }];
    });
  });
  if (!categories.length) throw coded("selector_error");
  process.stdout.write(`${JSON.stringify({ categories, supportsUncategorized: true, retrievedAt: new Date().toISOString() })}\n`);
  await context.close();
} catch (error) {
  console.error("[tistory-category-worker] category read failed", error);
  const diagnostic = page ? await page.evaluate(() => ({ url: location.href, selectCount: document.querySelectorAll("select").length, listboxCount: document.querySelectorAll('[role="listbox"]').length, listboxText: [...document.querySelectorAll('[role="listbox"]')].map((item) => (item.textContent ?? "").replace(/\s+/g, " ").trim()).slice(0, 5), listboxChildren: [...(document.querySelector('[role="listbox"]')?.querySelectorAll("*") ?? [])].slice(0, 40).map((item) => ({ tag: item.tagName, role: item.getAttribute("role"), id: item.id, className: item.className, text: (item.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80), dataValue: item.getAttribute("data-value"), value: item.getAttribute("value") })), categoryAttributeCount: document.querySelectorAll('[id*="category" i], [class*="category" i], [name*="category" i]').length, buttonLabels: [...document.querySelectorAll("button")].map((item) => (item.textContent ?? "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 30) })).catch(() => undefined) : undefined;
  const code = error?.code ?? (/ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_/i.test(String(error?.message)) ? "connection_error" : /browserType\.launch|Executable doesn't exist/i.test(String(error?.message)) ? "browser_launch_failed" : /Timeout/i.test(String(error?.message)) ? "selector_error" : "category_read_failed");
  const safe = code === "session_expired"
    ? { safeMessage: "Tistory 로그인 세션이 만료되었습니다.", remediation: "플랫폼 연결에서 Tistory 계정을 다시 연결해 주세요." }
    : code === "browser_launch_failed"
      ? { safeMessage: "카테고리 조회용 브라우저를 시작할 수 없습니다.", remediation: "자동화 설정에서 Chromium 준비 상태를 확인해 주세요." }
      : code === "selector_error" ? { safeMessage: "Tistory 카테고리 선택 영역을 찾지 못했습니다.", remediation: "편집기 DOM 변경 여부를 확인해 주세요." }
        : code === "connection_error" ? { safeMessage: "Tistory에 연결할 수 없어 카테고리 목록을 새로 불러오지 못했습니다.", remediation: "인터넷 연결을 확인한 뒤 다시 시도해 주세요." }
          : { safeMessage: "Tistory 카테고리를 불러오지 못했습니다.", remediation: "연결 상태를 확인한 뒤 새로고침해 주세요." };
  process.stdout.write(`${JSON.stringify({ errorCode: code, ...safe, ...(diagnostic ? { diagnostic } : {}) })}\n`);
  process.exitCode = 1;
} finally { await browser?.close(); }

function coded(code) { const error = new Error(code); error.code = code; return error; }
