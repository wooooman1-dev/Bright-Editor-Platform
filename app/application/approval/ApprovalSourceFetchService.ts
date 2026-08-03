import {
  evaluateApprovalSourceUrlSafety,
  normalizeApprovalSourceDocument,
  type ApprovalSourcePage,
} from "../../../core/approval";
import type { SiteApprovalReadinessFetch } from "../../../core/approval";
import { resolveOfficialEvidenceSourceFallback } from "./OfficialEvidenceSourceResolver";

export type ApprovalSourceFetch = SiteApprovalReadinessFetch;

/**
 * Fetches source candidates sequentially so one readiness inspection does not
 * burst an official institution. Every input produces one terminal page record.
 */
export async function fetchApprovalSourcePages(
  requestedUrls: readonly string[],
  fetcher: ApprovalSourceFetch,
): Promise<readonly ApprovalSourcePage[]> {
  const pages: ApprovalSourcePage[] = [];
  for (const requestedUrl of requestedUrls) {
    pages.push(await fetchApprovalSourcePage(requestedUrl, fetcher));
  }
  return Object.freeze(pages);
}

export async function fetchApprovalSourcePage(
  requestedUrl: string,
  fetcher: ApprovalSourceFetch,
  timeoutMs = 12_000,
): Promise<ApprovalSourcePage> {
  const initialSafety = evaluateApprovalSourceUrlSafety(requestedUrl);
  if (!initialSafety.safe || !initialSafety.normalizedUrl) {
    return sourceFailurePage(requestedUrl, `URL 안전성 검사 차단: ${initialSafety.reason ?? "안전한 공개 HTTPS URL이 아닙니다."}`);
  }

  let lastError: string | undefined;
  for (let attempt = 0; attempt < sourceFetchMaxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let retryDelay: number | undefined;

    try {
      const fetched = await fetchSourceResponse(
        initialSafety.normalizedUrl,
        fetcher,
        controller.signal,
        sourceAcceptHeader,
      );
      const response = fetched.response;
      const contentType = response.headers.get("content-type") ?? "";
      const body = await readBoundedResponseBody(response, sourceResponseMaxBytes);
      const extraction = normalizeApprovalSourceDocument({
        requestedUrl,
        finalUrl: fetched.finalUrl,
        status: response.status,
        contentType,
        bytes: body.bytes,
        tooLarge: body.tooLarge,
      });
      const page: ApprovalSourcePage = Object.freeze({
        requestedUrl,
        finalUrl: fetched.finalUrl,
        status: response.status,
        contentType,
        title: extraction.title,
        publisher: extraction.publisher,
        text: extraction.text,
        documentFormat: extraction.format,
        extractionStatus: extraction.extractionStatus,
        ...(extraction.extractionReason ? { extractionReason: extraction.extractionReason } : {}),
        contentLength: body.contentLength,
      });

      if (!retryableSourceStatus(response.status) || attempt === sourceFetchMaxAttempts - 1) {
        if (sourcePageRequiresOfficialFallback(page)) {
          const fallback = await fetchOfficialSourceFallback(requestedUrl, fetcher, timeoutMs);
          if (fallback) return fallback;
        }
        return page;
      }
      retryDelay = sourceRetryDelayMs(response.headers.get("retry-after"), attempt);
    } catch (error) {
      lastError = sourceFetchErrorMessage(error, timeoutMs);
      if (error instanceof UnsafeApprovalSourceUrlError) {
        return sourceFailurePage(requestedUrl, lastError);
      }
      if (attempt === sourceFetchMaxAttempts - 1) {
        const fallback = await fetchOfficialSourceFallback(requestedUrl, fetcher, timeoutMs);
        return fallback ?? sourceFailurePage(requestedUrl, lastError);
      }
      retryDelay = sourceRetryDelayMs(undefined, attempt);
    } finally {
      clearTimeout(timeout);
    }

    await delay(retryDelay ?? 0);
  }

  const fallback = await fetchOfficialSourceFallback(requestedUrl, fetcher, timeoutMs);
  return fallback ?? sourceFailurePage(requestedUrl, lastError ?? "알 수 없는 네트워크 오류");
}

async function fetchSourceResponse(
  requestedUrl: string,
  fetcher: ApprovalSourceFetch,
  signal: AbortSignal,
  accept: string,
): Promise<Readonly<{ response: Response; finalUrl: string }>> {
  let currentUrl = requestedUrl;
  for (let redirectCount = 0; redirectCount <= sourceFetchMaxRedirects; redirectCount += 1) {
    const safety = evaluateApprovalSourceUrlSafety(currentUrl);
    if (!safety.safe || !safety.normalizedUrl) {
      throw new UnsafeApprovalSourceUrlError(safety.reason ?? "안전한 공개 HTTPS URL이 아닙니다.");
    }
    currentUrl = safety.normalizedUrl;
    const response = await fetcher(currentUrl, {
      method: "GET",
      redirect: "manual",
      signal,
      headers: sourceRequestHeaders(accept),
    });
    if (!redirectSourceStatus(response.status)) {
      return Object.freeze({ response, finalUrl: response.url || currentUrl });
    }

    const location = response.headers.get("location");
    if (!location) return Object.freeze({ response, finalUrl: response.url || currentUrl });
    try {
      await response.body?.cancel();
    } catch {
      // Redirect response bodies may already be closed.
    }
    if (redirectCount === sourceFetchMaxRedirects) {
      throw new UnsafeApprovalSourceUrlError(`출처 리다이렉트가 ${sourceFetchMaxRedirects}회를 초과했습니다.`);
    }
    try {
      currentUrl = new URL(location, currentUrl).toString();
    } catch {
      throw new UnsafeApprovalSourceUrlError("출처 리다이렉트 주소가 올바르지 않습니다.");
    }
  }
  throw new UnsafeApprovalSourceUrlError("출처 리다이렉트 검사를 완료하지 못했습니다.");
}

async function readBoundedResponseBody(
  response: Response,
  maximumBytes: number,
): Promise<Readonly<{ bytes: Uint8Array; contentLength: number; tooLarge: boolean }>> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    try {
      await response.body?.cancel();
    } catch {
      // The response body may already be locked or closed.
    }
    return Object.freeze({ bytes: new Uint8Array(), contentLength: declaredLength, tooLarge: true });
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.byteLength > maximumBytes
      ? Object.freeze({ bytes: bytes.slice(0, maximumBytes), contentLength: bytes.byteLength, tooLarge: true })
      : Object.freeze({ bytes, contentLength: bytes.byteLength, tooLarge: false });
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      if (total + value.byteLength > maximumBytes) {
        const remaining = Math.max(0, maximumBytes - total);
        if (remaining) chunks.push(value.slice(0, remaining));
        total += value.byteLength;
        await reader.cancel();
        return Object.freeze({
          bytes: combineChunks(chunks, Math.min(maximumBytes, chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0))),
          contentLength: Math.max(total, declaredLength || 0),
          tooLarge: true,
        });
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // The stream may already be released.
    }
  }

  return Object.freeze({
    bytes: combineChunks(chunks, total),
    contentLength: Math.max(total, declaredLength || 0),
    tooLarge: false,
  });
}

function combineChunks(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function fetchOfficialSourceFallback(
  requestedUrl: string,
  fetcher: ApprovalSourceFetch,
  timeoutMs: number,
): Promise<ApprovalSourcePage | undefined> {
  const fallback = resolveOfficialEvidenceSourceFallback(requestedUrl);
  if (!fallback) return undefined;

  for (let attempt = 0; attempt < sourceFetchMaxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let retryDelay: number | undefined;

    try {
      const fetched = await fetchSourceResponse(
        fallback.requestUrl,
        fetcher,
        controller.signal,
        fallback.accept,
      );
      const response = fetched.response;
      if (response.ok) return fallback.normalize(response, requestedUrl);
      if (!retryableSourceStatus(response.status) || attempt === sourceFetchMaxAttempts - 1) return undefined;
      retryDelay = sourceRetryDelayMs(response.headers.get("retry-after"), attempt);
    } catch (error) {
      if (error instanceof UnsafeApprovalSourceUrlError || attempt === sourceFetchMaxAttempts - 1) return undefined;
      retryDelay = sourceRetryDelayMs(undefined, attempt);
    } finally {
      clearTimeout(timeout);
    }

    await delay(retryDelay ?? 0);
  }

  return undefined;
}

function sourceFailurePage(requestedUrl: string, fetchError: string): ApprovalSourcePage {
  let publisher = requestedUrl;
  try {
    publisher = new URL(requestedUrl).hostname;
  } catch {
    // Keep the original malformed value as the diagnostic publisher.
  }
  return Object.freeze({
    requestedUrl,
    finalUrl: requestedUrl,
    status: 0,
    contentType: "",
    title: "",
    publisher,
    text: "",
    fetchError,
    documentFormat: "unknown",
    extractionStatus: "unavailable",
    extractionReason: fetchError,
    contentLength: 0,
  });
}

function sourceFetchErrorMessage(error: unknown, timeoutMs: number): string {
  if (error instanceof UnsafeApprovalSourceUrlError) return `URL 안전성 검사 차단: ${error.message}`;
  if (error instanceof DOMException && error.name === "AbortError") {
    return `요청 시간이 ${timeoutMs}ms를 초과했습니다.`;
  }
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

function sourceRequestHeaders(accept: string): HeadersInit {
  return {
    Accept: accept,
    "Accept-Language": "en-US,en;q=0.9,ko;q=0.8",
    "Cache-Control": "no-cache",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 BrightStudioEvidenceVerifier/1.2",
  };
}

function sourcePageRequiresOfficialFallback(page: ApprovalSourcePage): boolean {
  if (page.status >= 400) return true;
  return /(?:just a moment|security checkpoint|attention required|access denied|temporarily blocked)/i.test(page.title);
}

function redirectSourceStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function retryableSourceStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function sourceRetryDelayMs(retryAfter: string | null | undefined, attempt: number): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1_000, sourceFetchMaxDelayMs);
    }
    const retryAt = Date.parse(retryAfter);
    if (!Number.isNaN(retryAt)) {
      return Math.min(Math.max(0, retryAt - Date.now()), sourceFetchMaxDelayMs);
    }
  }
  return Math.min(500 * (2 ** attempt), sourceFetchMaxDelayMs);
}

function delay(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

class UnsafeApprovalSourceUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeApprovalSourceUrlError";
  }
}

const sourceAcceptHeader = "text/html,application/xhtml+xml,text/plain,text/csv,text/xml,application/json,application/xml,application/pdf;q=0.9,*/*;q=0.5";
const sourceFetchMaxAttempts = 3;
const sourceFetchMaxDelayMs = 2_000;
const sourceFetchMaxRedirects = 5;
const sourceResponseMaxBytes = 1_500_000;
