export type DuplicateProjectMergeResult = Readonly<{
  studio: unknown;
  metadata: unknown;
  changed: boolean;
  sourceProjectId: string;
  targetProjectId: string;
  sourceProjectName: string;
  targetProjectName: string;
  replacedStudioReferences: number;
  replacedMetadataReferences: number;
  movedContentCount: number;
  movedMediaCount: number;
  movedEvidenceCount: number;
  verified?: boolean;
  backupPaths?: readonly string[];
  targetContentCount?: number;
  targetProjectCount?: number;
}>;

export function mergeDuplicateProjectSnapshots(
  studioSnapshot: any,
  metadataSnapshot: any,
  sourceProjectId: string,
  targetProjectId: string,
): DuplicateProjectMergeResult & { studio: any; metadata: any };

export function verifyMergedProjectSnapshots(
  result: DuplicateProjectMergeResult,
  persistedStudio: any,
  persistedMetadata: any,
): Readonly<{ targetContentCount: number; targetProjectCount: number }>;

export function runDuplicateProjectMerge(options: Readonly<{
  sourceProjectId: string;
  targetProjectId: string;
  studioPath?: string;
  metadataPath?: string;
  nextDevLockPath?: string;
}>): Promise<DuplicateProjectMergeResult>;
