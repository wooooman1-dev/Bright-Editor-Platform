import type { ContentDocument } from "../../../core/content";

const localMediaSourcePattern = /^\/api\/media\/([a-f0-9-]+\.(?:png|jpe?g|webp))$/i;
const placeholderOrigin = "https://bright-studio.invalid/tistory-media/";

export type TistoryMediaUploadPlanItem = Readonly<{
  alt: string;
  blockId: string;
  placeholderUrl: string;
  storageKey: string;
}>;

export type TistoryMediaUploadPlan = Readonly<{
  document: ContentDocument;
  items: readonly TistoryMediaUploadPlanItem[];
}>;

export type ResolvedTistoryMedia = Readonly<{
  blockId: string;
  placeholderUrl: string;
  remoteUrl: string;
}>;

export function createTistoryMediaUploadPlan(document: ContentDocument): TistoryMediaUploadPlan {
  const items: TistoryMediaUploadPlanItem[] = [];
  const blocks = document.blocks.map((block) => {
    if (block.type !== "image") return block;
    const match = block.source.match(localMediaSourcePattern);
    const storageKey = match?.[1];
    if (!storageKey) return block;
    const placeholderUrl = `${placeholderOrigin}${encodeURIComponent(block.id)}`;
    items.push(Object.freeze({
      alt: block.alt,
      blockId: block.id,
      placeholderUrl,
      storageKey,
    }));
    return Object.freeze({ ...block, source: placeholderUrl });
  });
  return Object.freeze({ document: Object.freeze({ ...document, blocks }), items: Object.freeze(items) });
}

export function applyResolvedTistoryMedia(html: string, resolved: readonly ResolvedTistoryMedia[]): string {
  let output = html;
  for (const item of resolved) {
    assertRemoteTistoryMediaUrl(item.remoteUrl);
    output = output.replaceAll(item.placeholderUrl, item.remoteUrl);
  }
  if (output.includes(placeholderOrigin)) throw new Error("Tistory media upload did not resolve every local image.");
  return output;
}

export function assertRemoteTistoryMediaUrl(value: string): void {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Tistory media URL must use HTTPS.");
  if (!/(?:^|\.)(?:kakaocdn\.net|daumcdn\.net|tistory\.com|kakao\.com)$/i.test(url.hostname)) {
    throw new Error("Tistory media URL host is not trusted.");
  }
}
