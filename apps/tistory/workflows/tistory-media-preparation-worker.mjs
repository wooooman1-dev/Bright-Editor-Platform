import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { uploadSingleTistoryImage } from "./tistory-media-upload.mjs";

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
  const resolved = [];

  for (let index = 0; index < media.length; index += 1) {
    const item = media[index];
    const page = await context.newPage();
    try {
      await page.goto(`https://${command.blogId}.tistory.com/manage/newpost`, { waitUntil: "domcontentloaded", timeout: 30000 });
      if (!page.url().startsWith(`https://${command.blogId}.tistory.com/manage`)) {
        throw safeError("session_expired", "Tistory 로그인 세션이 만료되어 이미지를 업로드하지 못했습니다.");
      }
      resolved.push(await uploadSingleTistoryImage(page, item));
    } catch (error) {
      throw withMediaEvidence(error, { blockId: item?.blockId, mediaIndex: index, uploadSession: "fresh_editor_page" });
    } finally {
      await page.close().catch(() => undefined);
    }
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
  const diagnostic = safeMediaDiagnostic(error);
  process.stderr.write(`[tistory-media-worker] ${code}\n`);
  process.stdout.write(`${JSON.stringify({ status: "failed", code, error: message, ...(diagnostic ? { diagnostic } : {}) })}\n`);
  process.exitCode = 1;
} finally {
  await browser?.close();
}

function safeError(diagnosticCode, safeMessage) {
  const error = new Error(safeMessage);
  error.diagnosticCode = diagnosticCode;
  error.safeMessage = safeMessage;
  return error;
}

function withMediaEvidence(error, evidence) {
  if (!error || typeof error !== "object") return error;
  error.mediaEvidence = Object.freeze({ ...(error.mediaEvidence ?? {}), ...withoutUndefined(evidence) });
  return error;
}

function withoutUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function safeMediaDiagnostic(error) {
  const evidence = error?.mediaEvidence;
  if (!evidence || typeof evidence !== "object") return undefined;
  const diagnostic = {};
  for (const key of ["blockId", "mediaIndex", "uploadMethod", "uploadSession", "baselineMediaCount", "lastMediaCount", "baselineTrustedUrlCount", "lastTrustedUrlCount"]) {
    const value = evidence[key];
    if (typeof value === "string" || typeof value === "number") diagnostic[key] = value;
  }
  return Object.keys(diagnostic).length ? diagnostic : undefined;
}
