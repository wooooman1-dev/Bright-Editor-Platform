export type DuplicateProjectMergeResult<TStudio = unknown, TMetadata = unknown> = Readonly<{
  studio: TStudio;
  metadata: TMetadata;
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

export function mergeDuplicateProjectSnapshots<TStudio, TMetadata>(
  studioSnapshot: TStudio,
  metadataSnapshot: TMetadata,
  sourceProjectId: string,
  targetProjectId: string,
): DuplicateProjectMergeResult<TStudio, TMetadata>;

export function verifyMergedProjectSnapshots<TStudio, TMetadata>(
  result: DuplicateProjectMergeResult<TStudio, TMetadata>,
  persistedStudio: TStudio,
  persistedMetadata: TMetadata,
): Readonly<{ targetContentCount: number; targetProjectCount: number }>;

export function runDuplicateProjectMerge(options: Readonly<{
  sourceProjectId: string;
  targetProjectId: string;
  studioPath?: string;
  metadataPath?: string;
  nextDevLockPath?: string;
}>): Promise<DuplicateProjectMergeResult>;
