import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";

import { AIConfigurationError, OpenAIProvider } from "../../../../app/application/OpenAIProvider";
import { EditorialGenerationStrategy } from "../../../../app/application/EditorialGenerationStrategy";
import { JsonFileSnapshotDriver } from "../../../../app/application/JsonFileSnapshotDriver";
import { SnapshotPersistenceStore } from "../../../../core/data";

describe("integration infrastructure", () => {
  it("persists versioned state across store restarts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "bright-studio-"));
    const file = join(directory, "state.json");
    const first = new SnapshotPersistenceStore(new JsonFileSnapshotDriver(file));
    await first.set("workspaces", "workspace-1", { id: "workspace-1", name: "Studio", settings: { enabledPlatforms: ["tistory", "wordpress"] } });
    const second = new SnapshotPersistenceStore(new JsonFileSnapshotDriver(file));
    expect(await second.get("workspaces", "workspace-1")).toEqual({ id: "workspace-1", name: "Studio", settings: { enabledPlatforms: ["tistory", "wordpress"] } });
    expect(JSON.parse(await readFile(file, "utf8")).schemaVersion).toBe(1);
  });

  it("does not silently replace corrupt persisted data", async () => {
    const directory = await mkdtemp(join(tmpdir(), "bright-studio-corrupt-"));
    const file = join(directory, "state.json");
    await writeFile(file, "{corrupt", "utf8");
    const driver = new JsonFileSnapshotDriver(file);
    await expect(driver.read()).rejects.toThrow("could not be read safely");
    expect(await readFile(file, "utf8")).toBe("{corrupt");
  });

  it("reports missing AI configuration without making a request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(new OpenAIProvider(undefined).generate({ instruction: "test" })).rejects.toBeInstanceOf(AIConfigurationError);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("reports a non-ASCII API key before constructing an HTTP header", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(new OpenAIProvider("잘못된-api-key").generate({ instruction: "test" })).rejects.toThrow(
      "OPENAI_API_KEY must contain only printable ASCII characters",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("converts one AI JSON response into canonical blocks", () => {
    const strategy = new EditorialGenerationStrategy();
    const document = strategy.parse('{"title":"Guide","blocks":[{"type":"heading","level":1,"text":"Guide"},{"type":"paragraph","text":"Body"}]}', {
      contentType: "article" as never, keywords: ["guide"], platform: "tistory" as never, projectId: "project-1",
    });
    expect(document.blocks.map((block) => block.type)).toEqual(["heading", "paragraph"]);
  });
});
