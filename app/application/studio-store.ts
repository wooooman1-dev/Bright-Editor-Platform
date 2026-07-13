import path from "node:path";

import { SnapshotPersistenceStore } from "../../core/data";
import { JsonFileSnapshotDriver } from "./JsonFileSnapshotDriver";

export const studioDataPath = process.env.BRIGHT_STUDIO_DATA_PATH
  ? path.resolve(process.env.BRIGHT_STUDIO_DATA_PATH)
  : path.join(process.cwd(), ".bright-studio", "studio-data.json");

export const studioStore = new SnapshotPersistenceStore(new JsonFileSnapshotDriver(studioDataPath));
