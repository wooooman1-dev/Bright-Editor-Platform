/**
 * D-039 Phase 4 — 사후 삭제로 사라진 문장을 되돌린다.
 *
 * 삭제기가 지운 문장의 원문은 `generatedFactualClaimInventory.items[].surfaceText`
 * 에, 그 문장이 있던 블록 ID 는 `locations` 에 그대로 남아 있다. 재생성 없이,
 * AI 호출 없이 복원할 수 있는 이유다.
 *
 * 복원 대상은 **블록이 통째로 사라진 경우로 한정한다.** 그때는 지워진 문장이
 * 곧 그 문단 전체이고, 블록 ID(`section-3-paragraph-2`)가 문서 안에서의 자리를
 * 그대로 알려 준다. 되돌릴 위치를 추측할 일이 없다.
 *
 * 문단 일부만 지워진 경우와 표 셀은 건드리지 않는다. 지워진 문장이 문단의 몇
 * 번째였는지, 비어 있는 셀 중 어느 것이었는지는 저장된 어디에도 없다. 그 자리를
 * 찍어 넣으면 되살리는 게 아니라 새로 쓰는 것이고, 이미 발행된 원고에 그렇게
 * 하는 것은 훼손을 한 번 더 하는 일이다. 대신 원문을 그대로 출력해 사람이
 * 편집기에서 넣을 수 있게 한다.
 *
 *   node scripts/restore-withdrawn-surfaces.mjs            # 계획만 출력
 *   node scripts/restore-withdrawn-surfaces.mjs --apply    # 백업 후 실제 적용
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(root, ".bright-studio", "studio-data.json");
const apply = process.argv.includes("--apply");

const raw = fs.readFileSync(dataPath, "utf8");
const parsed = JSON.parse(raw);
const data = parsed.data.application["user-data"];

const clean = (value) => String(value ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim();

function blockSurfaces(block) {
  if (block.type === "heading" || block.type === "paragraph") return [block.text];
  if (block.type === "list") return block.items ?? [];
  if (block.type === "table") return [block.caption ?? "", ...(block.headers ?? []), ...(block.rows ?? []).flat()];
  if (block.type === "image") return [block.alt ?? "", block.caption ?? ""];
  if (block.type === "button") return [block.label ?? "", block.description ?? ""];
  return [];
}

const present = (document, surface) => {
  const needle = clean(surface);
  if (!needle) return true;
  if (clean(document.title).includes(needle)) return true;
  return (document.blocks ?? []).some((block) =>
    blockSurfaces(block).some((value) => clean(value).includes(needle)));
};

/**
 * 블록 ID 에서 문서 안의 자리를 읽는다.
 *
 * 생성기가 `introduction-1`, `section-3-paragraph-2`, `conclusion-1` 처럼 자리를
 * 담은 ID 를 붙여 두었기 때문에, 사라진 블록을 어디에 끼워 넣을지 추측하지 않아도
 * 된다. 순서 키만 비교하면 남아 있는 블록 사이의 정확한 자리가 나온다.
 */
function orderKey(blockId) {
  const id = String(blockId);
  let match = /^introduction-(\d+)$/.exec(id);
  if (match) return [0, 0, Number(match[1]), 0];
  match = /^section-(\d+)-heading$/.exec(id);
  if (match) return [1, Number(match[1]), 0, 0];
  match = /^section-(\d+)-paragraph-(\d+)(?:-(?:list|table)-(\d+))?$/.exec(id);
  if (match) return [1, Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
  match = /^conclusion-(\d+)$/.exec(id);
  if (match) return [2, 0, Number(match[1]), 0];
  return undefined;
}

const compareKeys = (a, b) => {
  for (let index = 0; index < 4; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
};

const report = [];
let restoredBlocks = 0;
let manualItems = 0;

for (const content of data.contents) {
  const document = content.document;
  const inventory = document?.metadata?.generatedFactualClaimInventory;
  if (!inventory) continue;

  const missing = (inventory.items ?? []).filter((item) =>
    item.disposition === "removed" && !present(document, item.surfaceText));
  if (!missing.length) continue;

  const existing = new Set((document.blocks ?? []).map((block) => block.id));
  const restorable = new Map();
  const manual = [];

  for (const item of missing) {
    const blockLocations = (item.locations ?? []).filter((location) => location.kind === "block");
    const gone = blockLocations.filter((location) => !existing.has(location.blockId));
    const target = gone.find((location) => orderKey(location.blockId));
    if (gone.length && target) {
      const list = restorable.get(target.blockId) ?? [];
      list.push(item.surfaceText);
      restorable.set(target.blockId, list);
    } else {
      manual.push(item);
    }
  }

  const entry = {
    id: content.id,
    title: content.title,
    status: content.status,
    restored: [...restorable.entries()].map(([blockId, texts]) => ({ blockId, text: texts.join(" ") })),
    manual: manual.map((item) => ({
      surfaceText: item.surfaceText,
      blockId: (item.locations ?? []).find((location) => location.kind === "block")?.blockId ?? "(위치 없음)",
      reason: item.diagnosticCode ?? "-",
    })),
  };
  entry.restored.sort((a, b) => compareKeys(orderKey(a.blockId), orderKey(b.blockId)));
  restoredBlocks += entry.restored.length;
  manualItems += entry.manual.length;
  report.push(entry);

  if (!apply || !entry.restored.length) continue;

  // ── 실제 삽입: 순서 키가 앞선 마지막 블록 뒤에 넣는다.
  const blocks = [...document.blocks];
  for (const { blockId, text } of entry.restored) {
    const key = orderKey(blockId);
    let insertAt = blocks.length;
    for (let index = 0; index < blocks.length; index += 1) {
      const other = orderKey(blocks[index].id);
      if (other && compareKeys(other, key) > 0) { insertAt = index; break; }
    }
    blocks.splice(insertAt, 0, { id: blockId, type: "paragraph", text });
  }
  document.blocks = blocks;

  // ── longFormStructure 되돌리기: 스윕이 지운 참조를 다시 넣는다.
  const structure = document.metadata?.longFormStructure;
  if (structure) {
    const restoredIds = entry.restored.map((item) => item.blockId);
    const order = (id) => orderKey(id) ?? [9, 9, 9, 9];
    const sortIds = (ids) => [...new Set(ids)].sort((a, b) => compareKeys(order(a), order(b)));
    for (const id of restoredIds) {
      if (/^introduction-/.test(id)) {
        structure.introductionBlockIds = sortIds([...(structure.introductionBlockIds ?? []), id]);
      } else if (/^conclusion-/.test(id)) {
        structure.conclusionBlockIds = sortIds([...(structure.conclusionBlockIds ?? []), id]);
      } else {
        const match = /^section-(\d+)-paragraph-/.exec(id);
        if (!match) continue;
        const headingId = `section-${match[1]}-heading`;
        const section = (structure.sections ?? []).find((item) => item.headingBlockId === headingId);
        if (section) section.paragraphBlockIds = sortIds([...(section.paragraphBlockIds ?? []), id]);
      }
    }
  }
}

console.log("=".repeat(74));
console.log(apply ? "복구 적용" : "복구 계획 (미적용 — 적용하려면 --apply)");
console.log("=".repeat(74));
for (const entry of report) {
  console.log(`\n#### ${entry.id} [${entry.status}]`);
  console.log(`     ${String(entry.title).slice(0, 50)}`);
  console.log(`     되돌릴 문단 ${entry.restored.length}건 / 수동 확인 ${entry.manual.length}건`);
  for (const item of entry.restored) {
    console.log(`       + ${item.blockId}  "${item.text.slice(0, 58)}${item.text.length > 58 ? "…" : ""}"`);
  }
  for (const item of entry.manual) {
    console.log(`       ? ${item.blockId}  "${item.surfaceText.slice(0, 58)}${item.surfaceText.length > 58 ? "…" : ""}"`);
  }
}
console.log("\n" + "=".repeat(74));
console.log(`문단 복원 ${restoredBlocks}건 / 수동 확인 필요 ${manualItems}건 / 콘텐츠 ${report.length}편`);

if (!apply) {
  console.log("\n적용하려면: node scripts/restore-withdrawn-surfaces.mjs --apply");
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = `${dataPath}.pre-restore-${stamp}.json`;
fs.writeFileSync(backup, raw, "utf8");
fs.writeFileSync(dataPath, JSON.stringify(parsed, null, 2), "utf8");
console.log(`\n백업: ${path.basename(backup)}`);
console.log("적용 완료. 개발 서버가 떠 있으면 화면을 새로고침해야 반영됩니다.");
