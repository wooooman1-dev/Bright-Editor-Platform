export type ResolvedNativeTistoryMedia = Readonly<{
  alt?: string;
  blockId: string;
  nativeHtml: string;
  placeholderUrl: string;
  remoteUrl: string;
}>;

export function replaceTistoryMediaPlaceholders(
  html: string,
  resolvedMedia: readonly ResolvedNativeTistoryMedia[],
): string;
