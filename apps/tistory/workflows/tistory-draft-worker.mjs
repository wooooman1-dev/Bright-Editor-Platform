import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const [commandPath] = process.argv.slice(2);
const empty = { saveClicked: false, saveNotificationDetected: false, draftIdDetected: false, draftListVerified: false, reopenedDraftVerified: false, titleMatched: false, bodyMatched: false, publicPostCreated: false };
let browser;
try {
  const command = JSON.parse(await readFile(commandPath, "utf8"));
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: command.storageStatePath }); const page = await context.newPage();
  await page.goto(`https://${command.blogId}.tistory.com/manage/newpost`, { waitUntil: "domcontentloaded", timeout: 30000 });
  if (!page.url().startsWith(`https://${command.blogId}.tistory.com/manage`)) throw new Error("The Tistory session has expired.");
  await selectCategory(page, command.categoryId);
  const title = page.locator('textarea[placeholder*="제목"], input[placeholder*="제목"]').first(); await title.waitFor({ state: "visible", timeout: 15000 }); await title.fill(command.title);
  const mode = page.locator('button:has-text("HTML")').first(); if (await mode.isVisible()) await mode.click();
  const area = page.locator('[contenteditable="true"], textarea').last(); await area.fill(command.html);
  const direct = page.locator('button:has-text("임시저장")').first(); if (await direct.isVisible()) await direct.click(); else { await page.locator('button:has-text("완료")').first().click(); await direct.click(); }
  const saveNotificationDetected = await page.locator('[role="alert"]:has-text("저장"), .toast:has-text("저장"), text=/임시저장.*(완료|되었습니다)/').first().isVisible({ timeout: 15000 }).catch(() => false);
  const editorUrl = page.url(), idMatch = editorUrl.match(/(?:postId=|\/manage\/post\/)(\d+)/);
  const preSaveTitleMatched = await title.inputValue().then((value) => value.trim() === command.title.trim()).catch(() => false);
  const preSaveBodyMatched = await readableValue(area).then((value) => meaningful(value));
  let draftListVerified = false, reopenedDraftVerified = false, titleMatched = preSaveTitleMatched, bodyMatched = preSaveBodyMatched, draftStateVerified = false;
  try {
    await page.goto(`https://${command.blogId}.tistory.com/manage/posts/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    const draftLink = page.getByRole("link", { name: command.title, exact: true }).first();
    draftListVerified = await draftLink.isVisible({ timeout: 15000 }).catch(() => false);
    if (draftListVerified) {
      const rowText = await draftLink.locator("xpath=ancestor::*[self::li or self::tr or self::article][1]").textContent().catch(() => "");
      draftStateVerified = /임시저장|비공개|초안/.test(rowText ?? "");
      await draftLink.click(); await page.waitForLoadState("domcontentloaded", { timeout: 15000 });
      const reopenedTitle = page.locator('textarea[placeholder*="제목"], input[placeholder*="제목"]').first();
      const reopenedArea = page.locator('[contenteditable="true"], textarea').last();
      titleMatched = await reopenedTitle.inputValue().then((value) => value.trim() === command.title.trim()).catch(() => false);
      bodyMatched = await readableValue(reopenedArea).then((value) => meaningful(value));
      reopenedDraftVerified = titleMatched && bodyMatched;
    }
  } catch { /* Conservative partial verification is returned below. */ }
  const reliable = saveNotificationDetected && draftListVerified && reopenedDraftVerified && titleMatched && bodyMatched && draftStateVerified;
  const result = { ...empty, saveClicked: true, saveNotificationDetected, draftIdDetected: Boolean(idMatch), draftListVerified, reopenedDraftVerified, titleMatched, bodyMatched, publicPostCreated: false, ...(idMatch ? { draftId: idMatch[1] } : {}), editorUrl, status: reliable ? "saved" : "partially_verified" };
  process.stdout.write(`${JSON.stringify(result)}\n`); await context.close();
} catch (error) { const safeError = error instanceof Error && error.message === "The Tistory session has expired." ? error.message : "Tistory draft workflow failed during editor interaction."; process.stdout.write(`${JSON.stringify({ ...empty, status: "failed", error: safeError })}\n`); process.exitCode = 1; }
finally { await browser?.close(); }

async function readableValue(locator) { return locator.inputValue().catch(() => locator.textContent().then((value) => value ?? "").catch(() => "")); }
function meaningful(value) { return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length >= 10; }
async function selectCategory(page, categoryId) {
  const controls = page.locator("select[name*=category], select[id*=category]");
  if (await controls.count()) {
    await controls.first().selectOption(categoryId === null ? "0" : String(categoryId));
    return;
  }
  const button = page.locator("#category-btn, [aria-controls*=category]").first();
  if (await button.isVisible()) await button.click();
  const option = categoryId === null
    ? page.locator('#category-list [data-category-id="0"], #category-list [data-id="0"], #category-list li').filter({ hasText: /카테고리\s*없음|선택\s*안함/ }).first()
    : page.locator(`#category-list [data-category-id="${cssEscape(categoryId)}"], #category-list [data-id="${cssEscape(categoryId)}"], [role=option][data-category-id="${cssEscape(categoryId)}"]`).first();
  if (!await option.isVisible({ timeout: 10000 }).catch(() => false)) throw new Error("The selected Tistory category is no longer available.");
  await option.click();
}
function cssEscape(value) { return String(value).replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character.codePointAt(0).toString(16)} `); }
