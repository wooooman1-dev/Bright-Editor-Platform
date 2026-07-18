import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const [commandPath] = process.argv.slice(2);
let browser;

try {
  const command = JSON.parse(await readFile(commandPath, "utf8"));
  const media = Array.isArray(command.media) ? command.media : [];
  if (!media.length) {
    process.stdout.write(`${JSON.stringify({ status: "not_required", media: [] })}\n`);
    process.exit(0);
  }

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: command.storageStatePath });
  const page = await context.newPage();
  await page.goto(`https://${command.blogId}.tistory.com/manage/newpost`, { waitUntil: "domcontentloaded", timeout: 30000 });
  if (!page.url().startsWith(`https://${command.blogId}.tistory.com/manage`)) {
    throw safeError("session_expired", "Tistory 로그인 세션이 만료되어 이미지를 업로드하지 못했습니다.");
  }

  const resolved = [];
  for (const item of media) {
    const before = await collectTrustedImageUrls(page);
    await uploadImage(page, item.localPath);
    const remoteUrl = await waitForNewTrustedImageUrl(page, before);
    resolved.push({ blockId: item.blockId, placeholderUrl: item.placeholderUrl, remoteUrl });
  }

  let html = String(command.html ?? "");
  for (const item of resolved) html = html.replaceAll(item.placeholderUrl, item.remoteUrl);
  if (html.includes("https://bright-studio.invalid/tistory-media/")) {
    throw safeError("media_placeholder_unresolved", "일부 로컬 이미지가 Tistory 주소로 변환되지 않았습니다.");
  }

  await writeFile(commandPath, JSON.stringify({ ...command, html, resolvedMedia: resolved }), { encoding: "utf8", mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ status: "prepared", media: resolved })}\n`);
  await context.close();
} catch (error) {
  const code = error?.diagnosticCode ?? "media_upload_failed";
  const message = error?.safeMessage ?? "Tistory 이미지 업로드 준비를 완료하지 못했습니다.";
  process.stderr.write(`[tistory-media-worker] ${code}\n`);
  process.stdout.write(`${JSON.stringify({ status: "failed", code, error: message })}\n`);
  process.exitCode = 1;
} finally {
  await browser?.close();
}

async function uploadImage(page, localPath) {
  const directInputs = page.locator('input[type="file"][accept*="image" i]');
  for (let index = 0; index < await directInputs.count(); index += 1) {
    const input = directInputs.nth(index);
    if (!await input.isEnabled().catch(() => false)) continue;
    const accepted = await input.setInputFiles(localPath).then(() => true).catch(() => false);
    if (accepted) return;
  }

  const controls = [
    page.getByRole("button", { name: /사진|이미지/ }).first(),
    page.locator('button[aria-label*="사진"], button[aria-label*="이미지"], [data-name*="image" i] button').first(),
  ];
  for (const control of controls) {
    if (!await control.isVisible().catch(() => false)) continue;
    const chooser = page.waitForEvent("filechooser", { timeout: 5000 }).catch(() => undefined);
    const clicked = await control.click({ timeout: 5000 }).then(() => true).catch(() => false);
    if (!clicked) continue;
    const fileChooser = await chooser;
    if (!fileChooser) continue;
    await fileChooser.setFiles(localPath);
    return;
  }
  throw safeError("media_input_not_found", "Tistory 에디터에서 이미지 업로드 입력 영역을 찾지 못했습니다.");
}

async function waitForNewTrustedImageUrl(page, before) {
  const started = Date.now();
  while (Date.now() - started < 45000) {
    const current = await collectTrustedImageUrls(page);
    const added = [...current].find((url) => !before.has(url));
    if (added) return added;
    await page.waitForTimeout(250);
  }
  throw safeError("media_remote_url_not_detected", "Tistory가 업로드한 이미지의 원격 주소를 확인하지 못했습니다.");
}

async function collectTrustedImageUrls(page) {
  const urls = new Set();
  for (const frame of page.frames()) {
    const values = await frame.locator("img[src]").evaluateAll((elements) => elements.map((element) => element.getAttribute("src") ?? "")).catch(() => []);
    for (const value of values) {
      const normalized = trustedImageUrl(value);
      if (normalized) urls.add(normalized);
    }
  }
  return urls;
}

function trustedImageUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return undefined;
    if (!/(?:^|\.)(?:kakaocdn\.net|daumcdn\.net|tistory\.com|kakao\.com)$/i.test(url.hostname)) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function safeError(diagnosticCode, safeMessage) {
  const error = new Error(safeMessage);
  error.diagnosticCode = diagnosticCode;
  error.safeMessage = safeMessage;
  return error;
}
