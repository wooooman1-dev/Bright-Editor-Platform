import type { Project } from "../data";
import type { PlatformConnectionRepository, PublishingTargetRepository } from "./Contracts";
import type { PublishingTarget } from "./PlatformConnection";

export class PlatformConnectionService {
  constructor(private readonly connections: PlatformConnectionRepository, private readonly targets: PublishingTargetRepository) {}
  async selectTarget(project: Project, connectionId: string, now = new Date()): Promise<PublishingTarget> {
    const connection = await this.connections.findById(connectionId);
    if (!connection || connection.workspaceId !== project.workspaceId) throw new Error("Publishing connection must belong to the Project Workspace.");
    if (connection.status !== "connected") throw new Error("A verified publishing connection is required.");
    const target = Object.freeze({ projectId: project.id, platformConnectionId: connection.id, platform: connection.platform, selectedAt: now.toISOString() });
    await this.targets.save(target); return target;
  }
}
