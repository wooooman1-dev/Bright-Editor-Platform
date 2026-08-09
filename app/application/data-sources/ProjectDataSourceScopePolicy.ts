import type { ProjectDataSourceReference } from "../../../core/intelligence";

export type ProjectDataSourceScopeConflict = Readonly<{
  connectionId: string;
  ownerProjectId: string;
  requestedProjectId: string;
}>;

export function canonicalProjectReference(
  references: readonly ProjectDataSourceReference[],
  connectionId: string,
): ProjectDataSourceReference | undefined {
  return references
    .filter((reference) => reference.connectionId === connectionId && reference.enabled)
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt) || left.projectId.localeCompare(right.projectId))[0];
}

export function projectScopedReferences(
  references: readonly ProjectDataSourceReference[],
  projectId: string,
): readonly ProjectDataSourceReference[] {
  const connectionIds = [...new Set(references.filter((reference) => reference.enabled).map((reference) => reference.connectionId))];
  return connectionIds.flatMap((connectionId) => {
    const canonical = canonicalProjectReference(references, connectionId);
    return canonical?.projectId === projectId ? [canonical] : [];
  });
}

export function projectDataSourceScopeConflict(
  references: readonly ProjectDataSourceReference[],
  requested: ProjectDataSourceReference,
): ProjectDataSourceScopeConflict | undefined {
  const owner = canonicalProjectReference(references, requested.connectionId);
  if (!owner || owner.projectId === requested.projectId) return undefined;
  return Object.freeze({
    connectionId: requested.connectionId,
    ownerProjectId: owner.projectId,
    requestedProjectId: requested.projectId,
  });
}
