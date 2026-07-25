import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { tistoryMediaUploadSelectors, uploadSingleTistoryImage, uploadTistoryMediaSequentially } from "./tistory-media-upload.mjs";
import { captureNativeTistoryImageFragment } from "./tistory-native-media-fragment.mjs";
import { replaceTistoryMediaPlaceholders } from "./tistory-native-media-html.mjs";

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

  let uploadIndex = 0;
  const resolved = await uploadTistoryMediaSequentially(page, media, async (editorPage, item) => {
    const currentIndex = uploadIndex;
    uploadIndex += 1;
    await removeReusableImageInputs(editorPage);
    try {
      const uploaded = await uploadSingleTistoryImage(editorPage, item);
      const native = await captureNativeTistoryImageFragment(editorPage, uploaded.remoteUrl);
      return Object.freeze({
        ...uploaded,
        alt: item.alt,
        nativeHtml: native.html,
        nativeMetadata: native.metadata,
        representativeCandidate: currentIndex === 0,
      });
    } catch (error) {
      throw withMediaEvidence(error, { uploadSession: "same_editor_fresh_attachment_control", mediaIndex: currentIndex });
    }
  });

  const html = replaceTistoryMediaPlaceholders(String(command.html ?? ""), resolved);
  await writeFile(commandPath, JSON.stringify({
    ...command,
    html,
    resolvedMedia: resolved,
    representativeMedia: resolved[0]
      ? {
          blockId: resolved[0].blockId,
          remoteUrl: resolved[0].remoteUrl,
          nativeMetadata: resolved[0].nativeMetadata,
        }
      : undefined,
  }), { encoding: "utf8", mode: 0o600 });
  process.stdout.write(`${JSON.stringify({
    status: "prepared",
    media: resolved.map((item) => ({
      blockId: item.blockId,
      remoteUrl: item.remoteUrl,
      nativeMetadata: item.nativeMetadata,
      representativeCandidate: item.representativeCandidate,
    })),
  })}\n`);
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

async function removeReusableImageInputs(page) {
  for (const frame of page.frames()) {
    const inputs = frame.locator(tistoryMediaUploadSelectors.existingImageInput);
    await inputs.evaluateAll((nodes) => nodes.forEach((node) => node.remove())).catch(() => undefined);
  }
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
  for (const key of ["blockId", "mediaIndex", "uploadMethod", "uploadSession", "baselineMediaCount", "lastMediaCount", "baselineTrustedUrlCount", "lastTrustedUrlCount", "activeTinyMce", "frameCount"]) {
    const value = evidence[key];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") diagnostic[key] = value;
  }
  return Object.keys(diagnostic).length ? diagnostic : undefined;
}
