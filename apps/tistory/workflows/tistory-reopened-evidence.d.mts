export type ReopenedRepresentativeControlState = Readonly<{
  tagName?: string;
  className?: string;
  ariaPressed?: string;
  ariaChecked?: string;
  ariaSelected?: string;
  dataSelected?: string;
  dataActive?: string;
  dataState?: string;
}>;

export type ReopenedTistoryRepresentativeEvidence = Readonly<{
  skipped?: boolean;
  expectedMediaCount?: number;
  nativeImageFound?: boolean;
  context?: string;
  imageIndex?: number;
  selector?: string;
  controlContext?: string;
  controlCount?: number;
  state?: ReopenedRepresentativeControlState;
  [key: string]: unknown;
}>;

export type ReopenedTistoryRepresentativeResult = Readonly<{
  passed: boolean;
  code?: string;
  message?: string;
  evidence?: ReopenedTistoryRepresentativeEvidence;
}>;

export function reopenedRepresentativeLooksSelected(
  state: ReopenedRepresentativeControlState | undefined,
): boolean;

export function tistoryRepresentativeMediaKey(value: unknown): string;

export function verifyReopenedTistoryRepresentativeImage(
  page: unknown,
  expectedMediaCount: number,
): Promise<ReopenedTistoryRepresentativeResult>;
