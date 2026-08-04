export type DataSourceProjectSummary = Readonly<{ id: string; name: string }>;
export type DataSourceProjectReference = Readonly<{ projectId: string; connectionId: string; enabled: boolean }>;

export type DataSourceProjectBuckets<T extends Readonly<{ id: string }>> = Readonly<{
  assigned: readonly T[];
}>;

export function singleProjectIds(values: readonly string[], allowedProjectIds?: ReadonlySet<string>): readonly string[] {
  const first = values.find((value) => value.trim() && (!allowedProjectIds || allowedProjectIds.has(value)));
  return Object.freeze(first ? [first] : []);
}

export function activeProjectIdForConnection(
  references: readonly DataSourceProjectReference[],
  connectionId: string,
): string | undefined {
  return references.find((reference) => reference.connectionId === connectionId && reference.enabled)?.projectId;
}

export function projectConnectionBuckets<T extends Readonly<{ id: string }>>(
  connections: readonly T[],
  references: readonly DataSourceProjectReference[],
  projectId: string,
): DataSourceProjectBuckets<T> {
  const assignedConnectionIds = new Set(
    references
      .filter((reference) => reference.enabled && reference.projectId === projectId)
      .map((reference) => reference.connectionId),
  );

  return Object.freeze({
    assigned: Object.freeze(connections.filter((connection) => assignedConnectionIds.has(connection.id))),
  });
}

export function workspaceUnassignedConnections<T extends Readonly<{ id: string }>>(
  connections: readonly T[],
  references: readonly DataSourceProjectReference[],
): readonly T[] {
  const ownedConnectionIds = new Set(
    references
      .filter((reference) => reference.enabled)
      .map((reference) => reference.connectionId),
  );
  return Object.freeze(connections.filter((connection) => !ownedConnectionIds.has(connection.id)));
}

export function duplicateNormalizedProjectNames(projects: readonly DataSourceProjectSummary[]): readonly string[] {
  const namesByKey = new Map<string, string[]>();
  for (const project of projects) {
    const key = normalizeProjectName(project.name);
    if (!key) continue;
    namesByKey.set(key, [...(namesByKey.get(key) ?? []), project.name]);
  }
  return Object.freeze(
    [...namesByKey.values()]
      .filter((names) => names.length > 1)
      .map((names) => names[0]),
  );
}

export function normalizeProjectName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}
