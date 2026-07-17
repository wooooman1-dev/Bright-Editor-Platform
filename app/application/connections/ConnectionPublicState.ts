import type { ConnectionStatus, PlatformConnection } from "../../../core/connections";
import {
  contentReferencesConnection,
  projectReferencesConnection,
} from "./ConnectionReferenceMigration";
import type { UserData } from "../../user-flow/user-data";

export type ConnectionReferenceCounts = Readonly<{
  projectCount: number;
  contentCount: number;
}>;

export type PublicConnectionRuntimeState = Readonly<{
  status: ConnectionStatus;
  sessionStateAvailable: boolean;
  projectReferenceCount: number;
  contentReferenceCount: number;
}>;

export function connectionReferenceCounts(
  data: UserData,
  connectionId: string,
): ConnectionReferenceCounts {
  return Object.freeze({
    projectCount: data.projects.filter((project) => projectReferencesConnection(project, connectionId)).length,
    contentCount: data.contents.filter((content) => contentReferencesConnection(content, connectionId)).length,
  });
}

export function publicConnectionRuntimeState(
  connection: PlatformConnection,
  data: UserData,
  storedSessionExists: boolean,
  connectionAttemptActive = true,
): PublicConnectionRuntimeState {
  const counts = connectionReferenceCounts(data, connection.id);
  let sessionStateAvailable = connection.platform === "tistory"
    ? connection.publicMetadata.sessionStateAvailable === true && storedSessionExists
    : true;
  let status = connection.status;

  if (connection.platform === "tistory" && connection.status === "connecting" && !connectionAttemptActive) {
    status = storedSessionExists ? "connected" : "disconnected";
    sessionStateAvailable = storedSessionExists;
  } else if (connection.platform === "tistory" && connection.status === "connected" && !sessionStateAvailable) {
    status = "disconnected";
  }

  return Object.freeze({
    status,
    sessionStateAvailable,
    projectReferenceCount: counts.projectCount,
    contentReferenceCount: counts.contentCount,
  });
}
