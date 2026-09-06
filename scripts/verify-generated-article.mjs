/**
 * D-039 Phase 0·1 판정기.
 *
 * 원고를 한 편 생성한 뒤 이 스크립트를 돌리면, 사후 삭제가 정말 멈췄는지와
 * 새 사실 분류가 실제 원고에서 어떻게 동작하는지를 저장 데이터로 판정한다.
 * 사람의 인상이 아니라 실측으로 통과·실패를 말하는 것이 목적이다.
 *
 *   node scripts/verify-generated-article.mjs            # 가장 최근 원고
 *   node scripts/verify-generated-article.mjs content-xxxx-yyyy
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(root, ".bright-studio", "studio-data.json");
const { factualSurfaceCandidates, statesAValue } =
  await import(path.join(root, "core", "approval", "FactualSurfaceTaxonomy.ts"));

if (!fs.existsSync(dataPath)) {
  console.error(`저장 데이터를 찾지 못했습니다: ${dataPath}`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(dataPath, "utf8")).data.application["user-data"];
const requested = process.argv[2];
const content = requested
  ? data.contents.find((item) => item.id === requested)
  : [...data.contents]
      .filter((item) => item.document?.blocks?.length)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
      .at(-1);

if (!content) {
  console.error(requested ? `콘텐츠를 찾지 못했습니다: ${requested}` : "본문이 있는 콘텐츠가 없습니다.");
  process.exit(1);
}

const document = content.document;
const metadata = document.metadata ?? {};
const inventory = metadata.generatedFactualClaimInventory;
const clean = (value) => String(value ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim();

function blockSurfaces(block) {
  if (block.type === "heading" || block.type === "paragraph") return [block.text];
  if (block.type === "list") return block.items ?? [];
  if (block.type === "table") return [block.caption ?? "", ...(block.headers ?? []), ...(block.rows ?? []).flat()];
  if (block.type === "image") return [block.alt ?? "", block.caption ?? ""];
  if (block.type === "button") return [block.label ?? "", block.description ?? ""];
  return [];
}

function present(surface) {
  const needle = clean(surface);
  if (!needle) return false;
  if (clean(document.title).includes(needle)) return true;
  return (document.blocks ?? []).some((block) =>
    blockSurfaces(block).some((value) => clean(value).includes(needle)));
}

const results = [];
const check = (name, passed, detail) => results.push({ name, passed, detail });

console.log("=".repeat(72));
console.log(`대상  ${content.id}`);
console.log(`제목  ${content.title}`);
console.log(`생성  ${content.createdAt}   상태  ${content.status}`);
console.log("=".repeat(72));

// ── 1. 사후 삭제가 멈췄는가 (Phase 0 의 핵심 조건)
const items = inventory?.items ?? [];
const recorded = items.filter((item) => item.disposition === "removed");
const vanished = recorded.filter((item) => !present(item.surfaceText));
check(
  "기록된 문장이 본문에 남아 있다 (사후 삭제 중단)",
  vanished.length === 0,
  `기록 ${recorded.length}건 중 사라진 것 ${vanished.length}건`,
);
vanished.slice(0, 5).forEach((item) => console.log(`     사라짐: ${item.surfaceText.slice(0, 70)}`));

// ── 2. 표가 온전한가
const tables = (document.blocks ?? []).filter((block) => block.type === "table");
const emptyCells = tables.reduce((sum, table) =>
  sum + (table.rows ?? []).flat().filter((cell) => !String(cell).trim()).length, 0);
const totalCells = tables.reduce((sum, table) => sum + (table.rows ?? []).flat().length, 0);
check("표 빈칸 0개", emptyCells === 0, `표 ${tables.length}개 / 빈칸 ${emptyCells} / 전체 셀 ${totalCells}`);

// ── 3. 구조 참조가 온전한가
const structure = metadata.longFormStructure;
let dangling = [];
if (structure) {
  const presentIds = new Set((document.blocks ?? []).map((block) => block.id));
  const referenced = [
    ...(structure.introductionBlockIds ?? []),
    ...(structure.sections ?? []).flatMap((section) => [section.headingBlockId, ...(section.paragraphBlockIds ?? [])]),
    ...(structure.conclusionBlockIds ?? []),
  ];
  dangling = referenced.filter((id) => !presentIds.has(id));
}
check("longFormStructure dangling 참조 0개", dangling.length === 0,
  structure ? `dangling ${dangling.length}건` : "longFormStructure 없음");

// ── 4. 본문 분량이 정상 범위인가
const paragraphs = (document.blocks ?? []).filter((block) => block.type === "paragraph");
const prose = paragraphs.reduce((sum, block) => sum + clean(block.text).length, 0);
check("본문 분량 3,000자 이상", prose >= 3000,
  `문단 ${paragraphs.length}개 / ${prose}자 (훼손된 원고는 1,157자였다)`);

// ── 5. 새 분류가 실제 원고에서 어떻게 나뉘는가
const candidates = factualSurfaceCandidates(document);
const distribution = {};
for (const candidate of candidates) {
  distribution[candidate.classification] = (distribution[candidate.classification] ?? 0) + 1;
}
const valued = candidates.filter((candidate) => statesAValue(candidate.classification));
console.log("\n── 사실 분류 (FactualSurfaceTaxonomy) ──");
for (const [key, count] of Object.entries(distribution).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${String(count).padStart(4)}  ${key}`);
}
console.log("   값을 주장하는 문장:");
valued.slice(0, 8).forEach((item) =>
  console.log(`     [${item.classification}] ${item.surface.slice(0, 62)}`));

// ── 6. 승인 정책이 요구하는 것이 본문에 있는가 (Phase 2 필요성)
const bodyText = [document.title, ...(document.blocks ?? []).flatMap(blockSurfaces)].map(clean).join(" ");
const hasInformationDate = /(?:정보\s*기준일|최종\s*검토일)\s*[:：]/u.test(bodyText);
const hasSourceRoute = /(?:출처|상품설명서|약관|공고문|계약서|https?:\/\/|국세청|공단|금융감독원|금융위원회)/u.test(bodyText);
check("본문에 정보 기준일 표시", hasInformationDate, hasInformationDate ? "있음" : "없음 — Phase 2 대상");
check("본문에 확인 경로 표시", hasSourceRoute, hasSourceRoute ? "있음" : "없음 — Phase 2 대상");

// ── 7. 게이트 상태
const report = (data.qualityReports ?? []).find((item) => item.contentId === content.id)?.report;
console.log("\n── 게이트 ──");
if (report) {
  console.log(`   품질 ${report.overallScore} / approved=${report.approved} / ${report.approvalState}`);
  const blocking = (report.findings ?? []).filter((finding) => finding.severity === "error");
  if (blocking.length) {
    console.log("   차단 사유:");
    blocking.forEach((finding) => console.log(`     · ${String(finding.message).slice(0, 100)}`));
  } else {
    console.log("   차단 사유 없음");
  }
} else {
  console.log("   품질 보고 없음");
}
const readiness = metadata.siteApprovalReadiness;
if (readiness?.checks) {
  const failed = readiness.checks.filter((item) => item.status && item.status !== "passed");
  console.log(`   사이트 준비 검사 ${readiness.checks.length}건 / 미통과 ${failed.length}건`);
  failed.slice(0, 4).forEach((item) => console.log(`     · [${item.status}] ${String(item.action ?? item.message).slice(0, 90)}`));
}

// ── 판정
console.log(`\n${"=".repeat(72)}`);
let failures = 0;
for (const result of results) {
  if (!result.passed) failures += 1;
  console.log(`  ${result.passed ? "통과" : "실패"}  ${result.name}  —  ${result.detail}`);
}
console.log("=".repeat(72));
console.log(failures === 0
  ? "판정: Phase 0·1 통과. 원고가 훼손 없이 나왔다."
  : `판정: ${failures}건 실패. 위 항목을 그대로 보고할 것.`);
console.log("\n참고: 정보 기준일·확인 경로가 없는 것은 Phase 2 미착수 때문이며 Phase 0·1 결함이 아니다.");
process.exit(0);
