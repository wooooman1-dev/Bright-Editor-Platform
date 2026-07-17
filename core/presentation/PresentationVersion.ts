import type { PresentationWarning } from "./PresentationModel";

export type PresentationVersions = Readonly<{
  contentSchemaVersion: number;
  presentationSchemaVersion: number;
  presentationPolicyVersion: number;
  componentRegistryVersion: number;
  themeTokenVersion: number;
  htmlContractVersion: number;
  rendererVersion: number;
}>;

export type PresentationCompatibilityStatus =
  | "supported"
  | "migratable"
  | "fallback_available"
  | "incompatible";

export type PresentationCompatibilityResult = Readonly<{
  status: PresentationCompatibilityStatus;
  sourceVersion: number;
  targetVersion: number;
  migrationId?: string;
  fallbackComponentId?: string;
  warnings: readonly PresentationWarning[];
}>;
