import path from "node:path";
import { SnapshotPersistenceStore } from "../../../core/data";
import { JsonFileSnapshotDriver } from "../JsonFileSnapshotDriver";
import { DurablePlatformConnectionRepository, DurablePublishingTargetRepository } from "./ConnectionRepositories";
import { WindowsDpapiSecretStore } from "./WindowsDpapiSecretStore";
import { LocalConnectionJobRunner } from "./LocalConnectionJobRunner";

const root = path.join(process.cwd(), ".bright-studio");
export const connectionStore = new SnapshotPersistenceStore(new JsonFileSnapshotDriver(path.join(root, "connections", "metadata.json")));
export const connectionRepository = new DurablePlatformConnectionRepository(connectionStore);
export const targetRepository = new DurablePublishingTargetRepository(connectionStore);
export const secretStore = new WindowsDpapiSecretStore(path.join(root, "secrets"));
export const connectionJobRunner = new LocalConnectionJobRunner();
export const connectionRoot = path.join(root, "connections");
