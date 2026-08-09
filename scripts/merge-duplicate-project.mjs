import { createHash } from "node:crypto";
import { copyFile, mkdir, open, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = process.cwd();
const defaultStudioPath = path.join(projectRoot, ".bright-studio", "studio-data.json");
const defaultMetadataPath = path.join(projectRoot, ".bright-studio", "intelligence", "metadata.json");
const defaultNextDevLockPath = path.join(projectRoot, ".next", "dev", "lock");

export function mergeDuplicateProjectSnapshots(studioSnapshot, metadataSnapshot, sourceProjectId, targetProjectId) {
  if (!sourceProjectId || !targetProjectId) throw new Error("병합할 source Project ID와 보존할 target Project ID가 필요합니다.");
  if (sourceProjectId === targetProjectId) throw new Error("source Project와 target Project는 달라야 합니다.");

  const projects = studioSnapshot?.data?.application?.["user-data"]?.projects;
  if (!Array.isArray(projects)) throw new Error("studio-data.json에서 Project 목록을 찾을 수 없습니다.");
  if (!metadataSnapshot?.data || typeof metadataSnapshot.data !== "object") throw new Error("metadata.json의 data 영역을 찾을 수 없습니다.");

  const sourceProject = projects.find((project) => project?.id === sourceProjectId);
  const targetProject = projects.find((project) => project?.id === targetProjectId);
  if (!targetProject) throw new Error(`보존할 target Project를 찾을 수 없습니다: ${targetProjectId}`);

  const existingStudioReferences = countExactString(studioSnapshot, sourceProjectId);
  const existingMetadataReferences = countExactString(metadataSnapshot, sourceProjectId);
  if (!sourceProject) {
    if (existingStudioReferences || existingMetadataReferences) {
      throw new Error(`source Project 레코드는 없지만 기존 ID 참조가 남아 있습니다: studio ${existingStudioReferences}개, metadata ${existingMetadataReferences}개`);
    }
    return Object.freeze({
      studio: structuredClone(studioSnapshot),
      metadata: structuredClone(metadataSnapshot),
      changed: false,
      sourceProjectId,
      targetProjectId,
      sourceProjectName: "",
      targetProjectName: targetProject.name,
      replacedStudioReferences: 0,
      replacedMetadataReferences: 0,
      movedContentCount: 0,
      movedMediaCount: 0,
      movedEvidenceCount: 0,
    });
  }

  if (sourceProject.workspaceId !== targetProject.workspaceId) throw new Error("서로 다른 Workspace의 Project는 병합할 수 없습니다.");
  if (normalizeProjectName(sourceProject.name) !== normalizeProjectName(targetProject.name)) {
    throw new Error(`Project 이름이 일치하지 않아 자동 병합을 중단했습니다: ${sourceProject.name} / ${targetProject.name}`);
  }

  const userData = studioSnapshot.data.application["user-data"];
  const movedContentCount = Array.isArray(userData.contents) ? userData.contents.filter((content) => content?.projectId === sourceProjectId).length : 0;
  const movedMediaCount = Array.isArray(userData.mediaMetadata) ? userData.mediaMetadata.filter((asset) => asset?.metadata?.projectId === sourceProjectId).length : 0;
  const evidence = metadataSnapshot.data["opportunity-evidence"];
  const movedEvidenceCount = evidence && typeof evidence === "object"
    ? Object.values(evidence).filter((record) => record?.projectId === sourceProjectId).length
    : 0;

  const nextStudio = structuredClone(studioSnapshot);
  const nextMetadata = structuredClone(metadataSnapshot);
  nextStudio.data.application["user-data"].projects = nextStudio.data.application["user-data"].projects.filter((project) => project?.id !== sourceProjectId);
  replaceExactString(nextStudio, sourceProjectId, targetProjectId);
  replaceExactString(nextMetadata, sourceProjectId, targetProjectId);

  const remainingStudioReferences = countExactString(nextStudio, sourceProjectId);
  const remainingMetadataReferences = countExactString(nextMetadata, sourceProjectId);
  if (remainingStudioReferences || remainingMetadataReferences) {
    throw new Error(`병합 결과에 source Project ID가 남아 있습니다: studio ${remainingStudioReferences}개, metadata ${remainingMetadataReferences}개`);
  }

  const targetProjectRecords = nextStudio.data.application["user-data"].projects.filter((project) => project?.id === targetProjectId);
  if (targetProjectRecords.length !== 1) throw new Error(`병합 후 target Project 레코드는 정확히 1개여야 합니다. 현재 ${targetProjectRecords.length}개입니다.`);

  return Object.freeze({
    studio: nextStudio,
    metadata: nextMetadata,
    changed: true,
    sourceProjectId,
    targetProjectId,
    sourceProjectName: sourceProject.name,
    targetProjectName: targetProject.name,
    replacedStudioReferences: existingStudioReferences - 1,
    replacedMetadataReferences: existingMetadataReferences,
    movedContentCount,
    movedMediaCount,
    movedEvidenceCount,
  });
}

export function verifyMergedProjectSnapshots(result, persistedStudio, persistedMetadata) {
  if (JSON.stringify(persistedStudio) !== JSON.stringify(result.studio)) {
    throw new Error("studio-data.json 재읽기 결과가 기록하려던 병합 결과와 일치하지 않습니다.");
  }
  if (JSON.stringify(persistedMetadata) !== JSON.stringify(result.metadata)) {
    throw new Error("metadata.json 재읽기 결과가 기록하려던 병합 결과와 일치하지 않습니다.");
  }

  const studioReferences = countExactString(persistedStudio, result.sourceProjectId);
  const metadataReferences = countExactString(persistedMetadata, result.sourceProjectId);
  if (studioReferences || metadataReferences) {
    throw new Error(`재읽기 검증에서 source Project ID가 발견됐습니다: studio ${studioReferences}개, metadata ${metadataReferences}개`);
  }

  const projects = persistedStudio?.data?.application?.["user-data"]?.projects ?? [];
  const targetCount = projects.filter((project) => project?.id === result.targetProjectId).length;
  if (targetCount !== 1) throw new Error(`재읽기 검증에서 target Project 레코드가 ${targetCount}개 발견됐습니다.`);

  const contents = persistedStudio?.data?.application?.["user-data"]?.contents ?? [];
  const targetContentCount = contents.filter((content) => content?.projectId === result.targetProjectId).length;
  return Object.freeze({ targetContentCount, targetProjectCount: targetCount });
}

export async function runDuplicateProjectMerge({
  sourceProjectId,
  targetProjectId,
  studioPath = defaultStudioPath,
  metadataPath = defaultMetadataPath,
  nextDevLockPath = defaultNextDevLockPath,
} = {}) {
  if (!sourceProjectId || !targetProjectId) throw new Error("사용법: npm run project:merge-duplicate -- --source <중복 Project ID> --target <보존 Project ID>");
  if (!existsSync(studioPath)) throw new Error(`파일을 찾을 수 없습니다: ${studioPath}`);
  if (!existsSync(metadataPath)) throw new Error(`파일을 찾을 수 없습니다: ${metadataPath}`);
  if (nextDevLockPath && existsSync(nextDevLockPath)) throw new Error("Next.js 개발 서버가 실행 중입니다. 두 데이터 파일의 동시 쓰기를 막기 위해 npm run dev를 종료한 뒤 다시 실행해 주세요.");

  const lockPaths = [`${studioPath}.project-merge.lock`, `${metadataPath}.project-merge.lock`].sort();
  const locks = [];
  const temporaryPaths = [];
  try {
    for (const lockPath of lockPaths) locks.push([await acquireLock(lockPath), lockPath]);

    const [studioRaw, metadataRaw] = await Promise.all([readFile(studioPath, "utf8"), readFile(metadataPath, "utf8")]);
    const studio = parseJson(studioRaw, studioPath);
    const metadata = parseJson(metadataRaw, metadataPath);
    const result = mergeDuplicateProjectSnapshots(studio, metadata, sourceProjectId, targetProjectId);

    if (!result.changed) {
      verifyMergedProjectSnapshots(result, studio, metadata);
      console.log("병합할 중복 Project와 남은 참조가 없습니다.");
      console.log("studio-data.json과 metadata.json 재읽기 검증을 통과했습니다.");
      return Object.freeze({ ...result, verified: true, backupPaths: Object.freeze([]) });
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const studioBackupPath = `${studioPath}.duplicate-project-backup-${stamp}.json`;
    const metadataBackupPath = `${metadataPath}.duplicate-project-backup-${stamp}.json`;
    const studioTemporaryPath = `${studioPath}.project-merge-${process.pid}.tmp`;
    const metadataTemporaryPath = `${metadataPath}.project-merge-${process.pid}.tmp`;
    temporaryPaths.push(studioTemporaryPath, metadataTemporaryPath);
    const studioFingerprint = fingerprint(studioRaw);
    const metadataFingerprint = fingerprint(metadataRaw);

    await assertUnchanged(studioPath, studioFingerprint, "studio-data.json");
    await assertUnchanged(metadataPath, metadataFingerprint, "metadata.json");
    await Promise.all([copyFile(studioPath, studioBackupPath), copyFile(metadataPath, metadataBackupPath)]);
    await Promise.all([
      writeFile(studioTemporaryPath, `${JSON.stringify(result.studio, null, 2)}\n`, "utf8"),
      writeFile(metadataTemporaryPath, `${JSON.stringify(result.metadata, null, 2)}\n`, "utf8"),
    ]);
    await assertUnchanged(studioPath, studioFingerprint, "studio-data.json");
    await assertUnchanged(metadataPath, metadataFingerprint, "metadata.json");

    let studioReplaced = false;
    let metadataReplaced = false;
    try {
      await rename(studioTemporaryPath, studioPath);
      temporaryPaths.splice(temporaryPaths.indexOf(studioTemporaryPath), 1);
      studioReplaced = true;
      await rename(metadataTemporaryPath, metadataPath);
      temporaryPaths.splice(temporaryPaths.indexOf(metadataTemporaryPath), 1);
      metadataReplaced = true;

      const [persistedStudio, persistedMetadata] = await Promise.all([
        readFile(studioPath, "utf8").then((raw) => parseJson(raw, studioPath)),
        readFile(metadataPath, "utf8").then((raw) => parseJson(raw, metadataPath)),
      ]);
      const verification = verifyMergedProjectSnapshots(result, persistedStudio, persistedMetadata);

      console.log(`${result.sourceProjectName} 중복 Project를 ${result.targetProjectName} Project로 병합했습니다.`);
      console.log(`- Content 이동: ${result.movedContentCount}개`);
      console.log(`- Media metadata 이동: ${result.movedMediaCount}개`);
      console.log(`- Opportunity Evidence 이동: ${result.movedEvidenceCount}개`);
      console.log(`- studio-data.json Project 참조 변경: ${result.replacedStudioReferences}개`);
      console.log(`- metadata.json Project 참조 변경: ${result.replacedMetadataReferences}개`);
      console.log(`- target Project의 최종 Content: ${verification.targetContentCount}개`);
      console.log(`백업: ${studioBackupPath}`);
      console.log(`백업: ${metadataBackupPath}`);
      console.log("source Project ID 0건 및 두 파일 재읽기 검증을 통과했습니다.");
      return Object.freeze({ ...result, verified: true, backupPaths: Object.freeze([studioBackupPath, metadataBackupPath]), ...verification });
    } catch (error) {
      if (studioReplaced) await copyFile(studioBackupPath, studioPath).catch(() => undefined);
      if (metadataReplaced) await copyFile(metadataBackupPath, metadataPath).catch(() => undefined);
      throw new Error(`중복 Project 병합을 완료하지 못해 백업으로 복구했습니다: ${error instanceof Error ? error.message : String(error)}`);
    }
  } finally {
    await Promise.all(temporaryPaths.map((temporaryPath) => rm(temporaryPath, { force: true }).catch(() => undefined)));
    for (const [handle, lockPath] of locks.reverse()) await releaseLock(handle, lockPath);
  }
}

function replaceExactString(value, source, target, seen = new WeakSet()) {
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (value[index] === source) value[index] = target;
      else replaceExactString(value[index], source, target, seen);
    }
    return;
  }
  for (const key of Object.keys(value)) {
    if (value[key] === source) value[key] = target;
    else replaceExactString(value[key], source, target, seen);
  }
}

function countExactString(value, target, seen = new WeakSet()) {
  if (value === target) return 1;
  if (!value || typeof value !== "object") return 0;
  if (seen.has(value)) return 0;
  seen.add(value);
  if (Array.isArray(value)) return value.reduce((count, item) => count + countExactString(item, target, seen), 0);
  return Object.values(value).reduce((count, item) => count + countExactString(item, target, seen), 0);
}

async function assertUnchanged(filePath, expectedFingerprint, label) {
  const currentRaw = await readFile(filePath, "utf8");
  if (fingerprint(currentRaw) !== expectedFingerprint) throw new Error(`${label}이 병합 도중 변경됐습니다. 다른 프로세스의 쓰기 작업을 종료한 뒤 다시 실행해 주세요.`);
}

async function acquireLock(lockPath) {
  await mkdir(path.dirname(lockPath), { recursive: true });
  try {
    const handle = await open(lockPath, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`, "utf8");
    await handle.sync();
    return handle;
  } catch (error) {
    if (code(error) === "EEXIST") throw new Error(`다른 Project 병합 작업이 진행 중이거나 비정상 종료됐습니다: ${lockPath}`);
    throw error;
  }
}

async function releaseLock(handle, lockPath) {
  await handle.close().catch(() => undefined);
  try { await unlink(lockPath); } catch (error) { if (code(error) !== "ENOENT") throw error; }
}

function parseJson(raw, filePath) {
  try { return JSON.parse(raw.replace(/^\uFEFF/, "")); }
  catch (error) { throw new Error(`${filePath} JSON을 읽을 수 없습니다: ${error instanceof Error ? error.message : String(error)}`); }
}

function fingerprint(raw) { return createHash("sha256").update(raw, "utf8").digest("hex"); }
function normalizeProjectName(value) { return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR"); }
function code(error) { return typeof error === "object" && error !== null && "code" in error ? String(error.code) : "UNKNOWN"; }

function argument(name) {
  const exact = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (exact) return exact.slice(name.length + 3).trim();
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? String(process.argv[index + 1] ?? "").trim() : "";
}

const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirectExecution) {
  runDuplicateProjectMerge({ sourceProjectId: argument("source"), targetProjectId: argument("target") }).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
