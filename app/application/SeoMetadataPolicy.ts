import type { ContentDocument } from "../../core/content";

export function preserveCanonicalSeoMetadata(
  current: ContentDocument,
  candidate: ContentDocument,
): ContentDocument {
  const baseMetadata = candidate.metadata ?? current.metadata;
  if (!baseMetadata) return candidate;

  const seoTitle = nonBlank(candidate.metadata?.seoTitle)
    ?? nonBlank(current.metadata?.seoTitle);
  const metaDescription = nonBlank(candidate.metadata?.metaDescription)
    ?? nonBlank(current.metadata?.metaDescription);
  const metadata = { ...baseMetadata };

  if (seoTitle) metadata.seoTitle = seoTitle;
  else Reflect.deleteProperty(metadata, "seoTitle");

  if (metaDescription) metadata.metaDescription = metaDescription;
  else Reflect.deleteProperty(metadata, "metaDescription");

  return Object.freeze({
    ...candidate,
    metadata: Object.freeze(metadata),
  });
}

function nonBlank(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}