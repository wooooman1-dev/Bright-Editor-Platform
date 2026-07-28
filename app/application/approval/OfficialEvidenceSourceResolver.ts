import type { ApprovalSourcePage } from "../../../core/approval";

export type OfficialEvidenceSourceFallback = Readonly<{
  requestUrl: string;
  accept: string;
  normalize: (response: Response, requestedUrl: string) => Promise<ApprovalSourcePage | undefined>;
}>;

/**
 * Resolves official machine-readable endpoints for institutions whose public
 * HTML pages reject server-side verification requests.
 *
 * A fallback is allowed only when the institution itself publishes the
 * endpoint. Third-party reader proxies and cached copies are intentionally not
 * accepted as approval Evidence.
 */
export function resolveOfficialEvidenceSourceFallback(
  requestedUrl: string,
): OfficialEvidenceSourceFallback | undefined {
  let url: URL;
  try {
    url = new URL(requestedUrl);
  } catch {
    return undefined;
  }

  const host = url.hostname.toLocaleLowerCase("en-US");
  if (host !== "nga.gov" && host !== "www.nga.gov") return undefined;

  const artworkMatch = /^\/artworks\/(\d+)(?:-|\/|$)/i.exec(url.pathname);
  const artworkId = artworkMatch?.[1];
  if (!artworkId) return undefined;

  const manifestUrl = new URL("https://www.nga.gov/api/v1/iiif/presentation/manifest.json");
  manifestUrl.searchParams.set("cultObj:id", artworkId);
  const requestUrl = manifestUrl.toString();

  return Object.freeze({
    requestUrl,
    accept: "application/ld+json,application/json;q=0.9,*/*;q=0.8",
    normalize: (response, originalUrl) => normalizeNgaIiifManifest(response, originalUrl, requestUrl),
  });
}

async function normalizeNgaIiifManifest(
  response: Response,
  requestedUrl: string,
  fallbackUrl: string,
): Promise<ApprovalSourcePage | undefined> {
  if (!response.ok) return undefined;

  const raw = (await response.text()).slice(0, 1_500_000);
  let manifest: unknown;
  try {
    manifest = JSON.parse(raw);
  } catch {
    return undefined;
  }

  const text = flattenStructuredValues(manifest).join(" ").replace(/\s+/g, " ").trim();
  if (text.length < 80) return undefined;

  const title = structuredLabel(manifest) || "National Gallery of Art collection record";
  const finalUrl = response.url || fallbackUrl;
  const rawContentType = response.headers.get("content-type") ?? "application/ld+json";

  return Object.freeze({
    requestedUrl,
    finalUrl,
    status: response.status,
    // The verifier consumes normalized text. Preserve the actual official
    // payload format in the diagnostic while marking the normalized page as
    // text so the existing deterministic fact matcher can evaluate it.
    contentType: `text/html; normalized-from=${rawContentType.split(";")[0]}`,
    title,
    publisher: "National Gallery of Art",
    text,
  });
}

function structuredLabel(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const label = (value as Record<string, unknown>).label;
  if (typeof label === "string") return label.trim();
  if (!label || typeof label !== "object") return "";

  const languageMap = label as Record<string, unknown>;
  for (const preferred of ["en", "none", "@none"]) {
    const entry = languageMap[preferred];
    if (typeof entry === "string" && entry.trim()) return entry.trim();
    if (Array.isArray(entry)) {
      const first = entry.find((item): item is string => typeof item === "string" && Boolean(item.trim()));
      if (first) return first.trim();
    }
  }
  return "";
}

function flattenStructuredValues(value: unknown): readonly string[] {
  const result: string[] = [];
  const stack: unknown[] = [value];
  let visited = 0;
  let collectedCharacters = 0;

  while (stack.length && visited < 4_000 && collectedCharacters < 300_000) {
    visited += 1;
    const current = stack.pop();
    if (typeof current === "string") {
      const normalized = current.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (normalized) {
        result.push(normalized);
        collectedCharacters += normalized.length;
      }
      continue;
    }
    if (typeof current === "number" || typeof current === "boolean") {
      const normalized = String(current);
      result.push(normalized);
      collectedCharacters += normalized.length;
      continue;
    }
    if (Array.isArray(current)) {
      for (let index = current.length - 1; index >= 0; index -= 1) stack.push(current[index]);
      continue;
    }
    if (current && typeof current === "object") {
      const entries = Object.entries(current as Record<string, unknown>);
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const [key, nested] = entries[index]!;
        if (!technicalStructuredKeys.has(key)) {
          result.push(key);
          collectedCharacters += key.length;
        }
        stack.push(nested);
      }
    }
  }

  return Object.freeze(result);
}

const technicalStructuredKeys = new Set([
  "@context",
  "@id",
  "id",
  "type",
  "profile",
  "service",
  "thumbnail",
]);
