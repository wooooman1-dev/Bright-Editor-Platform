import { createHash } from "node:crypto";
import { copyFile, mkdir, open, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = process.cwd();
const defaultStudioPath = path.join(projectRoot, ".bright-studio", "studio-data.json");
const defaultMetadataPath = path.join(projectRoot, ".bright-studio", "intelligence", "metadata.json");
const defaultNextDevLockPath = path.join(projectRoot, ".next", "dev", "lock");
const repairLockSuffix = ".project-assignment-repair.lock";
const ignoredTerms = new Set(["관리", "방법", "가이드", "정보", "콘텐츠", "글", "프로젝트", "위한", "대한"]);

export function repairProjectDataSourceAssignments(studioSnapshot, metadataSnapshot) {
  const projects = studioSnapshot?.data?.application?.["user-data"]?.projects;
  const connections = metadataSnapshot?.data?.["data-source-connections"];
  const references = metadataSnapshot?.data?.["project-data-source-references"];

  if (!Array.isArray(projects)) throw new Error("studio-data.json에서 Project 목록을 찾을 수 없습니다.");
  if (!connections || typeof connections !== "object") throw new Error("metadata.json에서 Data Source Connection 목록을 찾을 수 없습니다.");
  if (!references || typeof references !== "object") throw new Error("metadata.json에서 Project Data Source Reference 목록을 찾을 수 없습니다.");

  const healthProject = projects.find((project) => normalize(project?.name) === normalize("건강 정보"));
  if (!healthProject) throw new Error("건강 정보 Project를 찾을 수 없습니다.");

  const projectById = new Map(projects.map((project) => [project?.id, project]));
  const connectionById = new Map(Object.values(connections).map((connection) => [connection?.id, connection]));
  const healthTerms = projectTerms(healthProject);
  const nextMetadata = structuredClone(metadataSnapshot);
  const nextReferences = nextMetadata.data["project-data-source-references"];
  const removedReferences = [];

  for (const [storageKey, reference] of Object.entries(references)) {
    if (reference?.projectId === healthProject.id || reference?.enabled !== true) continue;

    const targetProject = projectById.get(reference?.projectId);
    const connection = connectionById.get(reference?.connectionId);
    if (!targetProject || !connection) continue;

    const reason = wrongHealthAssignmentReason(connection, healthTerms, projectTerms(targetProject), targetProject.name);
    if (!reason) continue;

    delete nextReferences[storageKey];
    removedReferences.push({
      storageKey,
      projectId: targetProject.id,
      projectName: targetProject.name,
      connectionId: connection.id,
      provider: connection.provider,
      displayName: connection.displayName,
      resource: connectionResource(connection),
      reason,
    });
  }

  return {
    metadata: nextMetadata,
    removedReferences,
    preservedHealthReferenceCount: Object.values(nextReferences).filter((reference) => reference?.projectId === healthProject.id && reference?.enabled === true).length,
  };
}

export function verifyPersistedProjectDataSourceAssignments(studioSnapshot, expectedResult, persistedMetadata) {
  if (JSON.stringify(persistedMetadata) !== JSON.stringify(expectedResult.metadata)) {
    throw new Error("metadata.json 재읽기 결과가 기록하려던 정리 결과와 일치하지 않습니다. 다른 프로세스의 동시 쓰기 가능성이 있습니다.");
  }

  const remaining = repairProjectDataSourceAssignments(studioSnapshot, persistedMetadata);
  if (remaining.removedReferences.length) {
    const details = remaining.removedReferences.map((value) => `${value.projectName}:${value.connectionId}`).join(", ");
    throw new Error(`metadata.json 재검증에서 잘못된 건강용 Project 배정이 다시 발견됐습니다: ${details}`);
  }

  if (remaining.preservedHealthReferenceCount !== expectedResult.preservedHealthReferenceCount) {
    throw new Error("건강 정보 Project의 정상 Reference 수가 기록 전후에 달라졌습니다.");
  }

  return Object.freeze({
    activeReferenceCount: Object.values(persistedMetadata.data["project-data-source-references"])
      .filter((reference) => reference?.enabled === true).length,
  });
}

export async function runProjectDataSourceAssignmentRepair({
  studioPath = defaultStudioPath,
  metadataPath = defaultMetadataPath,
  nextDevLockPath = defaultNextDevLockPath,
  repairLockPath = `${metadataPath}${repairLockSuffix}`,
} = {}) {
  if (!existsSync(studioPath)) throw new Error(`파일을 찾을 수 없습니다: ${studioPath}`);
  if (!existsSync(metadataPath)) throw new Error(`파일을 찾을 수 없습니다: ${metadataPath}`);
  if (nextDevLockPath && existsSync(nextDevLockPath)) {
    throw new Error("Next.js 개발 서버가 실행 중입니다. metadata.json 동시 쓰기를 막기 위해 npm run dev를 종료한 뒤 다시 실행해 주세요.");
  }

  const repairLock = await acquireRepairLock(repairLockPath);
  let temporaryPath;
  try {
    const [studioRaw, metadataRaw] = await Promise.all([
      readFile(studioPath, "utf8"),
      readFile(metadataPath, "utf8"),
    ]);
    const studio = parseJson(studioRaw, studioPath);
    const metadata = parseJson(metadataRaw, metadataPath);
    const result = repairProjectDataSourceAssignments(studio, metadata);

    if (!result.removedReferences.length) {
      verifyPersistedProjectDataSourceAssignments(studio, result, metadata);
      console.log("정리할 잘못된 건강용 Data Source Project 배정이 없습니다.");
      console.log("metadata.json 읽기 검증을 통과했습니다.");
      return { ...result, backupPath: null, verified: true };
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `${metadataPath}.project-assignment-backup-${stamp}.json`;
    temporaryPath = `${metadataPath}.project-assignment-${process.pid}.tmp`;
    const initialFingerprint = fingerprint(metadataRaw);

    await assertMetadataUnchanged(metadataPath, initialFingerprint);
    await copyFile(metadataPath, backupPath);
    await writeFile(temporaryPath, `${JSON.stringify(result.metadata, null, 2)}\n`, "utf8");
    await assertMetadataUnchanged(metadataPath, initialFingerprint);
    await rename(temporaryPath, metadataPath);
    temporaryPath = undefined;

    const persistedMetadata = parseJson(await readFile(metadataPath, "utf8"), metadataPath);
    const verification = verifyPersistedProjectDataSourceAssignments(studio, result, persistedMetadata);

    console.log(`건강용 Data Source의 잘못된 Project 배정 ${result.removedReferences.length}개를 제거했습니다.`);
    for (const removed of result.removedReferences) {
      console.log(`- ${removed.projectName} · ${removed.provider} · ${removed.displayName} · ${removed.resource}`);
      console.log(`  사유: ${removed.reason}`);
    }
    console.log(`건강 정보 Project의 활성 배정 ${result.preservedHealthReferenceCount}개는 유지했습니다.`);
    console.log(`현재 활성 Project Reference: ${verification.activeReferenceCount}개`);
    console.log(`백업: ${backupPath}`);
    console.log("metadata.json 재읽기 검증을 통과했습니다.");
    console.log("Connection, Snapshot, Evidence, Credential은 삭제하지 않았습니다.");
    return { ...result, backupPath, verified: true, activeReferenceCount: verification.activeReferenceCount };
  } finally {
    if (temporaryPath) await rm(temporaryPath, { force: true }).catch(() => undefined);
    await releaseRepairLock(repairLock, repairLockPath);
  }
}

async function assertMetadataUnchanged(metadataPath, expectedFingerprint) {
  const currentRaw = await readFile(metadataPath, "utf8");
  if (fingerprint(currentRaw) !== expectedFingerprint) {
    throw new Error("metadata.json이 정리 도중 변경됐습니다. 다른 프로세스의 쓰기 작업을 종료한 뒤 다시 실행해 주세요.");
  }
}

async function acquireRepairLock(lockPath) {
  await mkdir(path.dirname(lockPath), { recursive: true });
  try {
    const handle = await open(lockPath, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`, "utf8");
    await handle.sync();
    return handle;
  } catch (error) {
    if (code(error) === "EEXIST") {
      throw new Error(`다른 Data Source 배정 정리 작업이 진행 중이거나 비정상 종료됐습니다: ${lockPath}`);
    }
    throw error;
  }
}

async function releaseRepairLock(handle, lockPath) {
  await handle.close().catch(() => undefined);
  try {
    await unlink(lockPath);
  } catch (error) {
    if (code(error) !== "ENOENT") throw error;
  }
}

function parseJson(raw, filePath) {
  try {
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error(`${filePath} JSON을 읽을 수 없습니다: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function fingerprint(raw) {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

function wrongHealthAssignmentReason(connection, healthTerms, targetTerms, targetProjectName) {
  if (connection.provider === "googleSearchConsole") {
    const siteProperty = normalize(connection.resourceConfiguration?.siteProperty);
    if (siteProperty.includes("bright-healthy.tistory.com")) {
      return `건강 정보 Tistory Search Console 속성이 ${targetProjectName}에 배정되어 있음`;
    }
    return null;
  }

  if (connection.provider === "naverSearchTrend") {
    const keywords = Array.isArray(connection.resourceConfiguration?.keywords)
      ? connection.resourceConfiguration.keywords
      : [];
    const healthScore = overlapScore(keywords, healthTerms);
    const targetScore = overlapScore(keywords, targetTerms);
    if (healthScore > 0 && targetScore === 0) {
      return `NAVER 키워드가 건강 문맥에만 일치함 (건강 ${healthScore}, ${targetProjectName} ${targetScore})`;
    }
  }

  return null;
}

function projectTerms(project) {
  const values = [
    project.name,
    project.description,
    project.strategy?.primaryTopic,
    ...(Array.isArray(project.strategy?.subtopics) ? project.strategy.subtopics : []),
  ];
  return new Set(values.flatMap(tokenize).filter((term) => term.length >= 2 && !ignoredTerms.has(term)));
}

function overlapScore(values, terms) {
  return values.flatMap(tokenize).filter((value) => {
    if (ignoredTerms.has(value)) return false;
    return [...terms].some((term) => value.includes(term) || term.includes(value));
  }).length;
}

function tokenize(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .split(/[^\p{L}\p{N}]+/u)
    .map((term) => term.trim())
    .filter(Boolean);
}

function normalize(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}

function connectionResource(connection) {
  return connection.resourceConfiguration?.siteProperty
    ?? connection.resourceConfiguration?.propertyId
    ?? connection.resourceConfiguration?.accountReference
    ?? connection.resourceConfiguration?.channelTitle
    ?? connection.resourceConfiguration?.channelId
    ?? connection.resourceConfiguration?.keywords?.join(", ")
    ?? "resource 없음";
}

function code(error) {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : "UNKNOWN";
}

const isDirectExecution = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  runProjectDataSourceAssignmentRepair().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
