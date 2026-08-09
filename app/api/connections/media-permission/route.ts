import { NextResponse } from "next/server";

import { safeDraftPermissions, type AutomationPermission } from "../../../../core/connections";
import { connectionRepository } from "../../../application/connections/connection-runtime";
import { studioStore } from "../../../application/studio-store";
import type { UserData } from "../../../user-flow/user-data";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { workspaceId?: string; connectionId?: string; enabled?: boolean };
    const workspaceId = required(body.workspaceId, "Workspace is required.");
    const connectionId = required(body.connectionId, "Connection is required.");
    const data = await studioStore.get<UserData>("application", "user-data");
    if (data?.workspace?.id !== workspaceId) throw new Error("Workspace was not found.");

    const connection = await connectionRepository.findById(connectionId);
    if (!connection || connection.workspaceId !== workspaceId) throw new Error("Connection was not found.");
    if (connection.platform !== "tistory" && connection.platform !== "wordpress") {
      throw new Error("Media upload permission is not available for this platform.");
    }
    if (connection.status !== "connected") throw new Error("Reconnect the publishing account before changing media upload permission.");

    const permissions = new Set<AutomationPermission>(connection.automationPermissions ?? safeDraftPermissions);
    if (body.enabled === true) permissions.add("media.upload");
    else permissions.delete("media.upload");
    const updatedAt = new Date().toISOString();
    const updated = Object.freeze({ ...connection, automationPermissions: Object.freeze([...permissions]), updatedAt, version: connection.version + 1 });
    await connectionRepository.save(updated);
    return NextResponse.json({ enabled: permissions.has("media.upload"), permissions: [...permissions], updatedAt });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Media upload permission could not be saved." }, { status: 400 });
  }
}

function required(value: unknown, message: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(message);
  return value.trim();
}
