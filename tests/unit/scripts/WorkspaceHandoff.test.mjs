import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseWorkspaceHandoffArguments,
  runWorkspaceHandoffExport,
  runWorkspaceHandoffImport,
} from "../../../scripts/workspace-handoff.mjs";

async function workspace() {
  const root = await mkdtemp(path.join(tmpdir(), "workspace-handoff-"));
  const studioDirectory = path.join(root, ".bright-studio");
  await mkdir(path.join(studioDirectory, "connections"), { recursive: true });
  await mkdir(path.join(studioDirectory, "intelligence"), { recursive: true });
  await mkdir(path.join(studioDirectory, "secrets"), { recursive: true });
  await mkdir(path.join(studioDirectory, "diagnostics"), { recursive: true });
  await mkdir(path.join(studioDirectory, "backups", "content-deletions"), { recursive: true });
  await mkdir(path.join(studioDirectory, "media", "project-a"), { recursive: true });

  await writeFile(path.join(studioDirectory, "studio-data.json"), JSON.stringify({ data: {} }), "utf8");
  await writeFile(path.join(studioDirectory, "dev-server.out.log"), "noise", "utf8");
  await writeFile(path.join(studioDirectory, "studio-data.json.pre-record-table-backup.json"), "{}", "utf8");
  await writeFile(path.join(studioDirectory, "secrets", "wordpress-abc.bin"), "sealed", "utf8");
  await writeFile(path.join(studioDirectory, "diagnostics", "trace.json"), "{}", "utf8");
  await writeFile(path.join(studioDirectory, "backups", "content-deletions", "deleted.json"), "{}", "utf8");
  await writeFile(path.join(studioDirectory, "media", "project-a", "image.png"), "binary", "utf8");
  await writeFile(path.join(studioDirectory, "connections", "metadata.json"), JSON.stringify({
    data: {
      "platform-connections": {
        "connection-1": { platform: "wordpress", displayName: "brightjaetech.kr", secretReference: "wordpress-abc" },
        "connection-2": { platform: "tistory", displayName: "세션 없음" },
      },
    },
  }), "utf8");
  await writeFile(path.join(studioDirectory, "intelligence", "metadata.json"), JSON.stringify({
    data: {
      "data-source-connections": {
        "source-1": { provider: "googleSearchConsole", displayName: "Google Search Console", secretReference: "data-source-gsc" },
      },
    },
  }), "utf8");

  await writeFile(path.join(root, ".env"), "OPENAI_API_KEY=secret-value\n# comment\n", "utf8");
  await writeFile(path.join(root, ".env.local"), "GOOGLE_OAUTH_CLIENT_SECRET=another-secret\nOPENAI_API_KEY=secret-value\n", "utf8");
  return { root, studioDirectory };
}

async function exported() {
  const source = await workspace();
  const outputDirectory = path.join(source.root, "handoff");
  const manifest = await runWorkspaceHandoffExport({
    studioDirectory: source.studioDirectory,
    outputDirectory,
    environmentRoot: source.root,
    nextDevLockPath: path.join(source.root, "absent-lock"),
  });
  return { source, outputDirectory, manifest };
}

describe("workspace handoff export", () => {
  it("carries working data and leaves regenerable noise behind", async () => {
    const { outputDirectory } = await exported();
    const carriedRoot = path.join(outputDirectory, ".bright-studio");

    expect(existsSync(path.join(carriedRoot, "studio-data.json"))).toBe(true);
    expect(existsSync(path.join(carriedRoot, "media", "project-a", "image.png"))).toBe(true);
    expect(existsSync(path.join(carriedRoot, "backups", "content-deletions", "deleted.json"))).toBe(true);

    expect(existsSync(path.join(carriedRoot, "diagnostics"))).toBe(false);
    expect(existsSync(path.join(carriedRoot, "dev-server.out.log"))).toBe(false);
    expect(existsSync(path.join(carriedRoot, "studio-data.json.pre-record-table-backup.json"))).toBe(false);
  });

  it("never copies the DPAPI-sealed secrets, because they cannot be decrypted elsewhere", async () => {
    const { outputDirectory } = await exported();
    expect(existsSync(path.join(outputDirectory, ".bright-studio", "secrets"))).toBe(false);
    const carried = await readdir(path.join(outputDirectory, ".bright-studio"));
    expect(carried).not.toContain("secrets");
  });

  it("turns each stored secret reference into a named reconnect target", async () => {
    const { manifest } = await exported();
    expect(manifest.reconnect).toEqual([
      { kind: "Platform Connection", provider: "wordpress", displayName: "brightjaetech.kr", secretReference: "wordpress-abc" },
      { kind: "Data Source", provider: "googleSearchConsole", displayName: "Google Search Console", secretReference: "data-source-gsc" },
    ]);
  });

  it("records environment variable names without their values", async () => {
    const { outputDirectory, manifest } = await exported();
    expect(manifest.environment.requiredNames).toEqual(["GOOGLE_OAUTH_CLIENT_SECRET", "OPENAI_API_KEY"]);
    expect(manifest.environment.files).toEqual([".env", ".env.local"]);

    const written = await readFile(path.join(outputDirectory, "handoff-manifest.json"), "utf8")
      + await readFile(path.join(outputDirectory, "RECONNECT.md"), "utf8");
    expect(written).not.toContain("secret-value");
    expect(written).not.toContain("another-secret");
  });

  it("refuses to run while the dev server holds the lock", async () => {
    const source = await workspace();
    const lockPath = path.join(source.root, "dev-lock");
    await writeFile(lockPath, "held", "utf8");
    await expect(runWorkspaceHandoffExport({
      studioDirectory: source.studioDirectory,
      outputDirectory: path.join(source.root, "handoff"),
      environmentRoot: source.root,
      nextDevLockPath: lockPath,
    })).rejects.toThrow("개발 서버가 실행 중입니다");
  });

  it("refuses to write inside the data it is copying", async () => {
    const source = await workspace();
    await expect(runWorkspaceHandoffExport({
      studioDirectory: source.studioDirectory,
      outputDirectory: path.join(source.studioDirectory, "handoff"),
      environmentRoot: source.root,
      nextDevLockPath: path.join(source.root, "absent-lock"),
    })).rejects.toThrow("작업 데이터 안으로는 내보낼 수 없습니다");
  });
});

describe("workspace handoff import", () => {
  async function destination() {
    const root = await mkdtemp(path.join(tmpdir(), "workspace-handoff-target-"));
    return { root, studioDirectory: path.join(root, ".bright-studio") };
  }

  it("restores the carried data and reports what still has to be reconnected", async () => {
    const { outputDirectory } = await exported();
    const target = await destination();
    await writeFile(path.join(target.root, ".env"), "OPENAI_API_KEY=local\n", "utf8");

    const result = await runWorkspaceHandoffImport({
      studioDirectory: target.studioDirectory,
      inputDirectory: outputDirectory,
      environmentRoot: target.root,
      nextDevLockPath: path.join(target.root, "absent-lock"),
    });

    expect(existsSync(path.join(target.studioDirectory, "studio-data.json"))).toBe(true);
    expect(existsSync(path.join(target.studioDirectory, "media", "project-a", "image.png"))).toBe(true);
    expect(result.reconnect).toHaveLength(2);
    expect(result.missingNames).toEqual(["GOOGLE_OAUTH_CLIENT_SECRET"]);
  });

  it("reports a missing environment file rather than starting without it", async () => {
    const { outputDirectory } = await exported();
    const target = await destination();

    const result = await runWorkspaceHandoffImport({
      studioDirectory: target.studioDirectory,
      inputDirectory: outputDirectory,
      environmentRoot: target.root,
      nextDevLockPath: path.join(target.root, "absent-lock"),
    });

    expect(result.missingFiles).toEqual([".env", ".env.local"]);
    expect(result.missingNames).toEqual(["GOOGLE_OAUTH_CLIENT_SECRET", "OPENAI_API_KEY"]);
  });

  it("will not overwrite existing working data without --force", async () => {
    const { outputDirectory } = await exported();
    const target = await destination();
    await mkdir(target.studioDirectory, { recursive: true });
    await writeFile(path.join(target.studioDirectory, "studio-data.json"), JSON.stringify({ existing: true }), "utf8");

    await expect(runWorkspaceHandoffImport({
      studioDirectory: target.studioDirectory,
      inputDirectory: outputDirectory,
      environmentRoot: target.root,
      nextDevLockPath: path.join(target.root, "absent-lock"),
    })).rejects.toThrow("--force");
  });

  it("backs up the replaced working data when forced", async () => {
    const { outputDirectory } = await exported();
    const target = await destination();
    await mkdir(target.studioDirectory, { recursive: true });
    await writeFile(path.join(target.studioDirectory, "studio-data.json"), JSON.stringify({ existing: true }), "utf8");

    const result = await runWorkspaceHandoffImport({
      studioDirectory: target.studioDirectory,
      inputDirectory: outputDirectory,
      environmentRoot: target.root,
      nextDevLockPath: path.join(target.root, "absent-lock"),
      force: true,
    });

    expect(result.replacedBackupPath).toBeTruthy();
    expect(JSON.parse(await readFile(result.replacedBackupPath, "utf8"))).toEqual({ existing: true });
  });
});

describe("workspace handoff arguments", () => {
  it("reads the export and import forms", () => {
    expect(parseWorkspaceHandoffArguments(["export", "--out", "D:/handoff"]))
      .toEqual({ command: "export", options: { force: false, outputDirectory: "D:/handoff" } });
    expect(parseWorkspaceHandoffArguments(["import", "--from", "D:/handoff", "--force"]))
      .toEqual({ command: "import", options: { force: true, inputDirectory: "D:/handoff" } });
  });

  it("rejects an unknown command or option instead of guessing", () => {
    expect(() => parseWorkspaceHandoffArguments(["migrate"])).toThrow("사용법");
    expect(() => parseWorkspaceHandoffArguments(["export", "--everything"])).toThrow("알 수 없는 옵션");
  });
});
