import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Moves a Bright Studio working environment to another computer.
 *
 * Three things never travel with the repository: the untracked `.bright-studio`
 * runtime data, the `.env` files, and the stored credentials. The first two are
 * a copy problem. The third is not: secrets are sealed with Windows DPAPI under
 * `DataProtectionScope::CurrentUser`, so the `.bin` files are readable only by
 * the Windows account that wrote them. Copying them to another machine produces
 * files that exist but cannot be decrypted, which fails later and looks like a
 * bug rather than a missing step.
 *
 * So this deliberately does not copy them. It resolves every stored secret
 * reference back to the connection that owns it and writes that list out, so
 * the destination machine knows exactly what to reconnect before starting.
 */

const projectRoot = process.cwd();
const studioDirectoryName = ".bright-studio";
const defaultStudioDirectory = path.join(projectRoot, studioDirectoryName);
const defaultNextDevLockPath = path.join(projectRoot, ".next", "dev", "lock");
const environmentFileNames = ["env", "env.local"].map((name) => `.${name}`);
const manifestFileName = "handoff-manifest.json";
const reconnectFileName = "RECONNECT.md";

/**
 * Carried because losing it loses work. `backups/` is included despite being a
 * backup directory: `backups/content-deletions` is the only copy of a deleted
 * article, and there is no other restore path for one.
 */
const carriedEntries = Object.freeze([
  "studio-data.json",
  "verification-data.json",
  "settings-browser-data.json",
  "connections",
  "intelligence",
  "media",
  "publishing-jobs",
  "backups",
]);

/**
 * Regenerated on demand or written by a past run. Copying these moves tens of
 * megabytes of diagnostics and stale logs that describe a machine the
 * destination is not.
 */
const skippedEntries = Object.freeze([
  "secrets",
  "diagnostics",
  "cache",
  "logs",
  "benchmarks",
]);

const skippedFilePattern = /\.(log|tmp)$|^studio-data\.json\..*\.json$|-verification(-\d+)?\.json$/;

export async function runWorkspaceHandoffExport({
  studioDirectory = defaultStudioDirectory,
  outputDirectory,
  nextDevLockPath = defaultNextDevLockPath,
  environmentRoot = projectRoot,
} = {}) {
  if (!outputDirectory) throw new Error("내보낼 위치가 필요합니다: --out <디렉터리>");
  if (!existsSync(studioDirectory)) throw new Error(`작업 데이터를 찾을 수 없습니다: ${studioDirectory}`);
  assertDevServerStopped(nextDevLockPath, "내보내는 도중 데이터가 바뀌지 않도록");

  const resolvedOutput = path.resolve(outputDirectory);
  if (resolvedOutput.startsWith(path.resolve(studioDirectory) + path.sep)) {
    throw new Error("작업 데이터 안으로는 내보낼 수 없습니다. 다른 위치를 지정해 주세요.");
  }
  await mkdir(resolvedOutput, { recursive: true });

  const carried = [];
  for (const entry of carriedEntries) {
    const source = path.join(studioDirectory, entry);
    if (!existsSync(source)) continue;
    const copied = await copyTree(source, path.join(resolvedOutput, studioDirectoryName, entry));
    carried.push({ entry, fileCount: copied.fileCount, byteCount: copied.byteCount });
  }
  if (!carried.length) throw new Error("옮길 작업 데이터가 없습니다. 경로가 맞는지 확인해 주세요.");

  const reconnect = await resolveReconnectTargets(studioDirectory);
  const environment = await readEnvironmentVariableNames(environmentRoot);
  const manifest = Object.freeze({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    carried,
    skipped: [...skippedEntries],
    environment,
    reconnect,
  });

  await writeFile(path.join(resolvedOutput, manifestFileName), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(path.join(resolvedOutput, reconnectFileName), reconnectDocument(manifest), "utf8");

  console.log(`작업 데이터를 내보냈습니다: ${resolvedOutput}`);
  for (const item of carried) {
    console.log(`- ${item.entry} · 파일 ${item.fileCount}개 · ${megabytes(item.byteCount)}`);
  }
  console.log(`제외: ${skippedEntries.join(", ")} 및 로그·임시 파일`);
  console.log("");
  console.log(`자격증명은 옮기지 않았습니다. 새 컴퓨터에서 다시 연결할 대상 ${reconnect.length}개:`);
  for (const target of reconnect) console.log(`- ${target.kind} · ${target.displayName}`);
  console.log("");
  console.log(`환경 변수 ${environment.requiredNames.length}개는 .env 파일을 직접 옮겨야 합니다. 값은 기록하지 않았습니다.`);
  console.log(`체크리스트: ${path.join(resolvedOutput, reconnectFileName)}`);
  return manifest;
}

export async function runWorkspaceHandoffImport({
  studioDirectory = defaultStudioDirectory,
  inputDirectory,
  nextDevLockPath = defaultNextDevLockPath,
  environmentRoot = projectRoot,
  force = false,
} = {}) {
  if (!inputDirectory) throw new Error("가져올 위치가 필요합니다: --from <디렉터리>");
  const resolvedInput = path.resolve(inputDirectory);
  const manifestPath = path.join(resolvedInput, manifestFileName);
  if (!existsSync(manifestPath)) throw new Error(`${manifestFileName}을 찾을 수 없습니다: ${manifestPath}`);
  assertDevServerStopped(nextDevLockPath, "가져오는 도중 데이터가 덮어써지지 않도록");

  const manifest = parseJson(await readFile(manifestPath, "utf8"), manifestPath);
  const carriedRoot = path.join(resolvedInput, studioDirectoryName);
  if (!existsSync(carriedRoot)) throw new Error(`내보낸 작업 데이터를 찾을 수 없습니다: ${carriedRoot}`);

  const existingStudioData = path.join(studioDirectory, "studio-data.json");
  let replacedBackupPath = null;
  if (existsSync(existingStudioData)) {
    if (!force) {
      throw new Error("이 컴퓨터에 이미 작업 데이터가 있습니다. 덮어쓰려면 --force를 붙여 주세요. 기존 데이터는 백업됩니다.");
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    replacedBackupPath = `${existingStudioData}.handoff-replaced-${stamp}.json`;
    await copyFile(existingStudioData, replacedBackupPath);
  }

  const restored = [];
  for (const entry of await readdir(carriedRoot)) {
    const copied = await copyTree(path.join(carriedRoot, entry), path.join(studioDirectory, entry));
    restored.push({ entry, fileCount: copied.fileCount, byteCount: copied.byteCount });
  }

  const environment = await readEnvironmentVariableNames(environmentRoot);
  const missingNames = (manifest.environment?.requiredNames ?? [])
    .filter((name) => !environment.requiredNames.includes(name));
  const missingFiles = (manifest.environment?.files ?? [])
    .filter((name) => !environment.files.includes(name));

  console.log(`작업 데이터를 가져왔습니다: ${studioDirectory}`);
  for (const item of restored) {
    console.log(`- ${item.entry} · 파일 ${item.fileCount}개 · ${megabytes(item.byteCount)}`);
  }
  if (replacedBackupPath) console.log(`기존 studio-data.json 백업: ${replacedBackupPath}`);
  console.log("");

  if (missingFiles.length) console.log(`없는 환경 변수 파일: ${missingFiles.join(", ")}`);
  if (missingNames.length) {
    console.log(`설정되지 않은 환경 변수 ${missingNames.length}개:`);
    for (const name of missingNames) console.log(`- ${name}`);
  } else {
    console.log("환경 변수는 모두 설정되어 있습니다.");
  }
  console.log("");

  const reconnect = manifest.reconnect ?? [];
  console.log(`자격증명은 옮겨오지 않았습니다. 다시 연결할 대상 ${reconnect.length}개:`);
  for (const target of reconnect) console.log(`- ${target.kind} · ${target.displayName}`);
  console.log("");
  console.log("남은 단계: npm install, npm run playwright:install, 위 대상 재연결.");
  return Object.freeze({ restored, missingNames, missingFiles, reconnect, replacedBackupPath });
}

/**
 * Every stored secret reference, resolved back to the connection that owns it.
 * A bare reference string tells the destination machine nothing actionable;
 * the provider and display name tell it which screen to open.
 */
async function resolveReconnectTargets(studioDirectory) {
  const targets = [];
  const connections = await readJsonIfPresent(path.join(studioDirectory, "connections", "metadata.json"));
  for (const [id, connection] of recordEntries(connections?.data?.["platform-connections"])) {
    if (!connection?.secretReference) continue;
    targets.push(Object.freeze({
      kind: "Platform Connection",
      provider: connection.platform ?? connection.provider ?? "unknown",
      displayName: connection.displayName ?? connection.blogName ?? connection.siteUrl ?? id,
      secretReference: connection.secretReference,
    }));
  }

  const intelligence = await readJsonIfPresent(path.join(studioDirectory, "intelligence", "metadata.json"));
  for (const [id, connection] of recordEntries(intelligence?.data?.["data-source-connections"])) {
    if (!connection?.secretReference) continue;
    targets.push(Object.freeze({
      kind: "Data Source",
      provider: connection.provider ?? "unknown",
      displayName: connection.displayName ?? id,
      secretReference: connection.secretReference,
    }));
  }
  return Object.freeze(targets);
}

/**
 * Names only. The whole point of leaving `.env` untracked is that its values
 * stay out of files that get copied around, so recording them here would undo
 * that for the sake of a checklist.
 */
async function readEnvironmentVariableNames(environmentRoot) {
  const files = [];
  const names = new Set();
  for (const fileName of environmentFileNames) {
    const filePath = path.join(environmentRoot, fileName);
    if (!existsSync(filePath)) continue;
    files.push(fileName);
    for (const line of (await readFile(filePath, "utf8")).split(/\r?\n/)) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
      if (match) names.add(match[1]);
    }
  }
  return Object.freeze({ files, requiredNames: [...names].sort() });
}

async function copyTree(source, destination) {
  const info = await stat(source);
  if (!info.isDirectory()) {
    await mkdir(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.${process.pid}.tmp`;
    try {
      await copyFile(source, temporary);
      await rename(temporary, destination);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
    return { fileCount: 1, byteCount: info.size };
  }

  await mkdir(destination, { recursive: true });
  let fileCount = 0;
  let byteCount = 0;
  for (const child of await readdir(source, { withFileTypes: true })) {
    if (skippedEntries.includes(child.name)) continue;
    if (child.isFile() && skippedFilePattern.test(child.name)) continue;
    const copied = await copyTree(path.join(source, child.name), path.join(destination, child.name));
    fileCount += copied.fileCount;
    byteCount += copied.byteCount;
  }
  return { fileCount, byteCount };
}

function reconnectDocument(manifest) {
  const lines = [
    "# 다른 컴퓨터에서 이어서 작업하기",
    "",
    `내보낸 시각: ${manifest.exportedAt}`,
    "",
    "## 1. 저장소",
    "",
    "```",
    "git clone https://github.com/wooooman1-dev/Bright-Editor-Platform.git",
    "npm install",
    "npm run playwright:install",
    "```",
    "",
    "## 2. 환경 변수",
    "",
    `${manifest.environment.files.join(", ") || "(없음)"} 파일을 직접 옮겨 주세요. 저장소에 없고 여기에도 값을 담지 않았습니다.`,
    "비밀번호 관리자나 USB를 쓰고, git이나 메신저로 보내지 마세요.",
    "",
    "필요한 변수:",
    "",
    ...manifest.environment.requiredNames.map((name) => `- \`${name}\``),
    "",
    "## 3. 작업 데이터",
    "",
    "```",
    "node scripts/workspace-handoff.mjs import --from <이 디렉터리>",
    "```",
    "",
    "## 4. 다시 연결해야 하는 것",
    "",
    "저장된 자격증명은 Windows DPAPI로 이 컴퓨터의 Windows 계정에 묶여 암호화됐습니다.",
    "파일을 복사해도 다른 컴퓨터에서는 복호화되지 않으므로 옮기지 않았습니다.",
    "새 컴퓨터에서 아래를 다시 연결해 주세요.",
    "",
    "| 종류 | Provider | 이름 |",
    "|---|---|---|",
    ...manifest.reconnect.map((target) => `| ${target.kind} | ${target.provider} | ${target.displayName} |`),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function recordEntries(value) {
  return value && typeof value === "object" ? Object.entries(value) : [];
}

async function readJsonIfPresent(filePath) {
  if (!existsSync(filePath)) return undefined;
  return parseJson(await readFile(filePath, "utf8"), filePath);
}

function parseJson(raw, filePath) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`JSON을 읽을 수 없습니다: ${filePath} (${error instanceof Error ? error.message : error})`);
  }
}

function assertDevServerStopped(nextDevLockPath, reason) {
  if (nextDevLockPath && existsSync(nextDevLockPath)) {
    throw new Error(`Next.js 개발 서버가 실행 중입니다. ${reason} npm run dev를 종료한 뒤 다시 실행해 주세요.`);
  }
}

function megabytes(byteCount) {
  return `${(byteCount / 1024 / 1024).toFixed(1)}MB`;
}

export function parseWorkspaceHandoffArguments(argv) {
  const [command, ...rest] = argv;
  if (command !== "export" && command !== "import") {
    throw new Error("사용법: node scripts/workspace-handoff.mjs export --out <디렉터리> | import --from <디렉터리> [--force]");
  }
  const options = { force: false };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === "--force") options.force = true;
    else if (argument === "--out") options.outputDirectory = rest[index += 1];
    else if (argument === "--from") options.inputDirectory = rest[index += 1];
    else throw new Error(`알 수 없는 옵션입니다: ${argument}`);
  }
  return { command, options };
}

const isDirectExecution = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  Promise.resolve()
    .then(() => {
      const { command, options } = parseWorkspaceHandoffArguments(process.argv.slice(2));
      return command === "export"
        ? runWorkspaceHandoffExport(options)
        : runWorkspaceHandoffImport(options);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
