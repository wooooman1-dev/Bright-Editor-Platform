import path from "node:path";

import { SnapshotPersistenceStore } from "../../core/data";
import { ApprovalAwarePersistenceStore } from "./approval/ApprovalAwarePersistenceStore";
import { JsonFileSnapshotDriver } from "./JsonFileSnapshotDriver";

export const studioDataPath = process.env.BRIGHT_STUDIO_DATA_PATH
  ? path.resolve(process.env.BRIGHT_STUDIO_DATA_PATH)
  : path.join(process.cwd(), ".bright-studio", "studio-data.json");

const snapshotStore = new SnapshotPersistenceStore(new JsonFileSnapshotDriver(studioDataPath));

export const studioStore = new ApprovalAwarePersistenceStore(snapshotStore);
