import type { Page } from "playwright";

export type TistoryNativeMediaMetadata = Readonly<{
  context?: string;
  tagName?: string;
  className?: string;
  dataKeType?: string;
  originWidth?: string;
  originHeight?: string;
  hasDataUrl?: boolean;
  hasPhocus?: boolean;
  imageAlt?: string;
}>;

export type TistoryNativeMediaFragment = Readonly<{
  html: string;
  metadata: TistoryNativeMediaMetadata;
}>;

export function captureNativeTistoryImageFragment(
  page: Page,
  remoteUrl: string,
  timeout?: number,
): Promise<TistoryNativeMediaFragment>;

export function assertNativeFragment(html: string): void;
