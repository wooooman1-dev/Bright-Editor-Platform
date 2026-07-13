import { chromium } from "playwright";

const [blogId, storageStatePath] = process.argv.slice(2);
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: storageStatePath });
  const page = await context.newPage();
  await page.goto(`https://${blogId}.tistory.com/manage/newpost`, { waitUntil: "domcontentloaded", timeout: 30000 });
  if (!page.url().startsWith(`https://${blogId}.tistory.com/manage`)) throw coded("session_expired");
  const categoryControl = page.locator("#category-btn, [aria-controls*=category], select[name*=category], select[id*=category]").first();
  await categoryControl.waitFor({ state: "attached", timeout: 15000 });
  if (await categoryControl.evaluate((element) => element.tagName !== "SELECT") && await categoryControl.isVisible()) await categoryControl.click();
  await page.locator("#category-list, [role=listbox][id*=category], select[name*=category], select[id*=category]").first().waitFor({ state: "attached", timeout: 10000 });
  const categories = await page.evaluate(() => {
    const root = document.querySelector("#category-list, [role=listbox][id*=category], select[name*=category], select[id*=category]");
    if (!root) return [];
    const nodes = root.matches("select") ? [...root.querySelectorAll("option")] : [...root.querySelectorAll("[data-category-id], [data-id], [role=option], li")];
    return nodes.flatMap((node) => {
      const element = /** @type {HTMLElement} */ (node);
      const id = element.getAttribute("data-category-id") ?? element.getAttribute("data-id") ?? element.getAttribute("value") ?? "";
      const name = (element.textContent ?? "").replace(/\s+/g, " ").trim();
      if (!id || !name || id === "0" || /카테고리\s*없음|선택\s*안함/.test(name)) return [];
      const depth = Number(element.getAttribute("data-depth") ?? element.getAttribute("aria-level") ?? 0);
      const parentId = element.getAttribute("data-parent-id") ?? undefined;
      return [{ id, name, depth: Number.isFinite(depth) ? Math.max(0, depth) : 0, ...(parentId ? { parentId } : {}) }];
    });
  });
  process.stdout.write(`${JSON.stringify({ categories, supportsUncategorized: true, retrievedAt: new Date().toISOString() })}\n`);
  await context.close();
} catch (error) {
  console.error("[tistory-category-worker] category read failed", error);
  const code = error?.code ?? (/browserType\.launch|Executable doesn't exist/i.test(String(error?.message)) ? "browser_launch_failed" : "category_read_failed");
  const safe = code === "session_expired"
    ? { safeMessage: "Tistory 로그인 세션이 만료되었습니다.", remediation: "플랫폼 연결에서 Tistory 계정을 다시 연결해 주세요." }
    : code === "browser_launch_failed"
      ? { safeMessage: "카테고리 조회용 브라우저를 시작할 수 없습니다.", remediation: "자동화 설정에서 Chromium 준비 상태를 확인해 주세요." }
      : { safeMessage: "Tistory 카테고리를 불러오지 못했습니다.", remediation: "연결 상태를 확인한 뒤 새로고침해 주세요." };
  process.stdout.write(`${JSON.stringify({ errorCode: code, ...safe })}\n`);
  process.exitCode = 1;
} finally { await browser?.close(); }

function coded(code) { const error = new Error(code); error.code = code; return error; }
