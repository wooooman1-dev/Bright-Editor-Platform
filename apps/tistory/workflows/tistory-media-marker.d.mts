export type TistoryMediaMarkerItem = Readonly<{
  blockId: string;
  placeholderUrl: string;
}>;

export function tistoryMediaMarkerText(blockId: string): string;
export function replaceTistoryMediaPlaceholdersWithMarkers(
  html: string,
  media: readonly TistoryMediaMarkerItem[],
): string;
export function isTistoryMediaMarkerText(value: string): boolean;
