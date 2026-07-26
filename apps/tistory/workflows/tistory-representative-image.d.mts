export type RepresentativeControlState = Readonly<{
  label?: string;
  tagName?: string;
  className?: string;
  checked?: boolean;
  ariaPressed?: string;
  ariaChecked?: string;
  ariaSelected?: string;
  dataSelected?: string;
  dataActive?: string;
  dataState?: string;
}>;

export type TistoryRepresentativeImageResult = Readonly<{
  passed: boolean;
  attempted?: boolean;
  verified?: boolean;
  code?: string;
  message?: string;
  evidence?: Readonly<Record<string, unknown>>;
}>;

export function representativeControlLooksSelected(state: RepresentativeControlState | undefined): boolean;
export function verifyTistoryRepresentativePersistence(
  persistedThumbnail: unknown,
  selectedImageUrl: unknown,
): TistoryRepresentativeImageResult;
export function ensureFirstTistoryImageRepresentative(page: unknown, remoteUrl: string): Promise<TistoryRepresentativeImageResult>;
