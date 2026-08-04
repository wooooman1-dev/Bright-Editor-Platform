import { copyFile, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = process.cwd();
const defaultStudioPath = path.join(projectRoot, ".bright-studio", "studio-data.json");
const defaultMetadataPath = path.join(projectRoot, ".bright-studio", "intelligence", "metadata.json");
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

export async function runProjectDataSourceAssignmentRepair({
  studioPath = defaultStudioPath,
  metadataPath = defaultMetadataPath,
} = {}) {
  if (!existsSync(studioPath)) throw new Error(`파일을 찾을 수 없습니다: ${studioPath}`);
  if (!existsSync(metadataPath)) throw new Error(`파일을 찾을 수 없습니다: ${metadataPath}`);

  const [studioRaw, metadataRaw] = await Promise.all([
    readFile(studioPath, "utf8"),
    readFile(metadataPath, "utf8"),
  ]);
  const studio = JSON.parse(studioRaw.replace(/^\uFEFF/, ""));
  const metadata = JSON.parse(metadataRaw.replace(/^\uFEFF/, ""));
  const result = repairProjectDataSourceAssignments(studio, metadata);

  if (!result.removedReferences.length) {
    console.log("정리할 잘못된 건강용 Data Source Project 배정이 없습니다.");
    return { ...result, backupPath: null };
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${metadataPath}.project-assignment-backup-${stamp}.json`;
  const temporaryPath = `${metadataPath}.project-assignment-${process.pid}.tmp`;

  await copyFile(metadataPath, backupPath);
  await writeFile(temporaryPath, `${JSON.stringify(result.metadata, null, 2)}\n`, "utf8");
  await rename(temporaryPath, metadataPath);

  console.log(`건강용 Data Source의 잘못된 Project 배정 ${result.removedReferences.length}개를 제거했습니다.`);
  for (const removed of result.removedReferences) {
    console.log(`- ${removed.projectName} · ${removed.provider} · ${removed.displayName} · ${removed.resource}`);
    console.log(`  사유: ${removed.reason}`);
  }
  console.log(`건강 정보 Project의 활성 배정 ${result.preservedHealthReferenceCount}개는 유지했습니다.`);
  console.log(`백업: ${backupPath}`);
  console.log("Connection, Snapshot, Evidence, Credential은 삭제하지 않았습니다.");
  return { ...result, backupPath };
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

const isDirectExecution = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  runProjectDataSourceAssignmentRepair().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
