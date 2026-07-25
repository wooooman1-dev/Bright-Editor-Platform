export type RepresentativeControlState = Readonly<{
  label?: string;
  className?: string;
  checked?: boolean;
  ariaPressed?: string;
  ariaChecked?: string;
  dataSelected?: string;
  dataActive?: string;
}>;

export type TistoryRepresentativeImageResult = Readonly<{
  passed: boolean;
  verified?: boolean;
  code?: string;
  message?: string;
  evidence?: Readonly<Record<string, unknown>>;
}>;

export function representativeControlLooksSelected(state: RepresentativeControlState | undefined): boolean;
export function ensureFirstTistoryImageRepresentative(page: unknown, remoteUrl: string): Promise<TistoryRepresentativeImageResult>;
