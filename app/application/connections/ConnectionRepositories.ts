import type { PlatformConnection, PlatformConnectionRepository, PublishingTarget, PublishingTargetRepository } from "../../../core/connections";
import type { PersistenceStore } from "../../../core/data";

export class DurablePlatformConnectionRepository implements PlatformConnectionRepository {
  constructor(private readonly store: PersistenceStore) {}
  delete(id: string) { return this.store.delete("platform-connections", id); }
  findById(id: string) { return this.store.get<PlatformConnection>("platform-connections", id); }
  async listByWorkspace(workspaceId: string) { return (await this.store.list<PlatformConnection>("platform-connections")).filter((value) => value.workspaceId === workspaceId); }
  save(value: PlatformConnection) { return this.store.set("platform-connections", value.id, value); }
}
export class DurablePublishingTargetRepository implements PublishingTargetRepository {
  constructor(private readonly store: PersistenceStore) {}
  async findByProject(id: string) { return (await this.listByProject(id))[0]; }
  async listByProject(id: string) { return (await this.store.list<PublishingTarget>("publishing-targets")).filter((target) => target.projectId === id); }
  save(value: PublishingTarget) { return this.store.set("publishing-targets", `${value.projectId}:${value.platformConnectionId}`, value); }
  async delete(id: string) {
    const targets = await this.listByProject(id);
    await Promise.all(targets.map((target) => this.store.delete("publishing-targets", `${target.projectId}:${target.platformConnectionId}`)));
  }
  async deleteByConnection(connectionId: string) {
    const targets = await this.store.list<PublishingTarget>("publishing-targets");
    await Promise.all(targets.filter((target) => target.platformConnectionId === connectionId).map((target) => this.store.delete("publishing-targets", `${target.projectId}:${target.platformConnectionId}`)));
  }
}
