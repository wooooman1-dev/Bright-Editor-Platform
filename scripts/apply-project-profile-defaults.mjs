import { copyFile, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = process.cwd();
const defaultSnapshotPath = path.join(projectRoot, ".bright-studio", "studio-data.json");
const defaultTemplatePath = path.join(projectRoot, "shared", "templates", "project-profile-defaults.json");

export function applyProjectProfileDefaults(snapshot, templateDocument, now = new Date().toISOString()) {
  const projects = snapshot?.data?.application?.["user-data"]?.projects;
  const profiles = templateDocument?.profiles;
  if (!Array.isArray(projects)) throw new Error("studio-data.json에서 Project 목록을 찾을 수 없습니다.");
  if (!Array.isArray(profiles)) throw new Error("Project 기본 프로필 템플릿을 찾을 수 없습니다.");

  const byName = new Map();
  for (const profile of profiles) {
    for (const name of profile.matchNames ?? []) byName.set(normalize(name), profile);
  }

  const changedProjects = [];
  const nextProjects = projects.map((project) => {
    const profile = byName.get(normalize(project?.name));
    if (!profile) return project;

    const next = {
      ...project,
      name: profile.title,
      description: profile.description,
      strategy: {
        ...(project.strategy ?? {}),
        primaryTopic: profile.primaryTopic,
        subtopics: [...profile.subtopics],
      },
      updatedAt: now,
    };

    changedProjects.push({
      projectId: project.id,
      before: {
        name: project.name,
        description: project.description,
        primaryTopic: project.strategy?.primaryTopic,
        subtopics: project.strategy?.subtopics,
      },
      after: {
        name: next.name,
        description: next.description,
        primaryTopic: next.strategy.primaryTopic,
        subtopics: next.strategy.subtopics,
      },
    });
    return next;
  });

  return {
    snapshot: {
      ...snapshot,
      data: {
        ...snapshot.data,
        application: {
          ...snapshot.data.application,
          "user-data": {
            ...snapshot.data.application["user-data"],
            projects: nextProjects,
          },
        },
      },
    },
    changedProjects,
  };
}

export async function runProjectProfileMigration({
  snapshotPath = defaultSnapshotPath,
  templatePath = defaultTemplatePath,
} = {}) {
  if (!existsSync(snapshotPath)) throw new Error(`파일을 찾을 수 없습니다: ${snapshotPath}`);
  if (!existsSync(templatePath)) throw new Error(`템플릿을 찾을 수 없습니다: ${templatePath}`);

  const [snapshotRaw, templateRaw] = await Promise.all([
    readFile(snapshotPath, "utf8"),
    readFile(templatePath, "utf8"),
  ]);
  const snapshot = JSON.parse(snapshotRaw.replace(/^\uFEFF/, ""));
  const templates = JSON.parse(templateRaw.replace(/^\uFEFF/, ""));
  const { snapshot: next, changedProjects } = applyProjectProfileDefaults(snapshot, templates);

  if (!changedProjects.length) {
    console.log("적용할 Project 기본 프로필이 없습니다.");
    return { changedProjects, backupPath: null };
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${snapshotPath}.project-profile-backup-${stamp}.json`;
  const temporaryPath = `${snapshotPath}.project-profile-${process.pid}.tmp`;

  await copyFile(snapshotPath, backupPath);
  await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await rename(temporaryPath, snapshotPath);

  console.log(`Project 기본 프로필 ${changedProjects.length}개를 적용했습니다.`);
  for (const change of changedProjects) {
    console.log(`- ${change.after.name} (${change.projectId})`);
  }
  console.log(`백업: ${backupPath}`);
  return { changedProjects, backupPath };
}

function normalize(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}

const isDirectExecution = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  runProjectProfileMigration().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
