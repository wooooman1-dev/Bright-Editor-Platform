import { pruneLongFormStructure } from "../content";
import type { ContentBlock, ContentDocument } from "../content";
import type { GeneratedClaimLocation } from "./GeneratedClaimBinding";
import { verificationClaimId } from "./VerificationClaimFingerprint";
import type {
  VerificationClaimKind,
  VerificationClaimQualifiers,
  VerificationClaimRisk,
  VerificationTemporalRequirement,
} from "./VerificationClaim";

export type GeneratedFactualClaimOrigin = "planning" | "generation" | "quality_review";
export type GeneratedFactualClaimDisposition = "retained" | "removed";
export type GeneratedFactualClaimEvidenceStatus =
  | "critical_verified"
  | "verify_verified"
  | "unsupported"
  | "not_applicable";

export type GeneratedFactualClaimInventoryDraft = Readonly<{
  claimId: string;
  planningClaimId: string;
  origin: GeneratedFactualClaimOrigin;
  risk: Exclude<VerificationClaimRisk, "none">;
  surfaceText: string;
  statement: string;
  kind: VerificationClaimKind;
  normalizedValueJson: string;
  qualifiers: Readonly<{
    subject: string;
    scope: string;
    basis: string;
    note: string;
  }>;
  temporalRequirementJson: string;
  evidenceUrl: string;
  evidenceExcerpt: string;
}>;

export type GeneratedFactualClaimInventoryItem = Readonly<{
  claimId: string;
  planningClaimId?: string;
  origin: GeneratedFactualClaimOrigin;
  risk: Exclude<VerificationClaimRisk, "none">;
  surfaceText: string;
  statement: string;
  kind: VerificationClaimKind;
  normalizedValueJson: string;
  qualifiers: VerificationClaimQualifiers;
  temporalRequirement?: VerificationTemporalRequirement;
  locations: readonly GeneratedClaimLocation[];
  disposition: GeneratedFactualClaimDisposition;
  evidenceStatus: GeneratedFactualClaimEvidenceStatus;
  evidenceUrl?: string;
  evidenceExcerpt?: string;
  diagnosticCode?: string;
}>;

export type GeneratedFactualClaimInventoryRecord = Readonly<{
  schemaVersion: 1;
  items: readonly GeneratedFactualClaimInventoryItem[];
  retainedClaimIds: readonly string[];
  removedClaimCount: number;
}>;

export type GeneratedFactualClaimDecision = Readonly<{
  retained: boolean;
  evidenceStatus: GeneratedFactualClaimEvidenceStatus;
  diagnosticCode?: string;
  /**
   * Server-owned risk classification. The returned inventory declares a risk,
   * but only the stored Verification Plan decides whether a Claim is CRITICAL.
   * When the decision maker resolved the Claim against the Plan it reports the
   * canonical risk here so the stored item cannot disagree with the Plan.
   */
  risk?: Exclude<VerificationClaimRisk, "none">;
}>;

/**
 * Applies server-owned decisions to the factual inventory returned inside the
 * existing Generation call. Advice and checklists are deliberately absent from
 * this contract; only VERIFY/CRITICAL factual surfaces are represented.
 *
 * D-039 Write-time Fact Constraint: this stage **records** what could and could
 * not be verified. It does not edit the manuscript.
 *
 * The removed post-hoc withdrawal was never an approved design. D-037 decided
 * that a failed VERIFY Claim is handled "같은 Generation Prompt에서 해당 구체
 * Claim을 제거하거나 일반화" — inside generation, before the manuscript exists.
 * Cutting sentences out of a finished document instead produced every defect
 * this pipeline has been chasing: emptied comparison tables, numbers truncated
 * to `12,0`, whole paragraphs lost to one figure, the disclosure paragraph
 * deleted before the figures it disclosed, and `longFormStructure` left
 * pointing at blocks that no longer existed. Measured over the stored
 * workspace, 43 of 48 inventory items were withdrawn and only 6 of 1,499
 * sentences kept an amount, a rate, a date or an eligibility condition.
 *
 * An unverified surface therefore stays in the manuscript and is reported.
 * Deciding what to do about it belongs to the readiness verdict and to the
 * person reviewing the Draft — Review First and Draft Only remain enabled.
 */
export function applyGeneratedFactualClaimInventory(input: Readonly<{
  document: ContentDocument;
  drafts: readonly GeneratedFactualClaimInventoryDraft[];
  decisions: readonly GeneratedFactualClaimDecision[];
  fallbackTitle: string;
  /**
   * Semantic anchors of Claims the server already verified through explicit
   * Source Preflight. The best-effort inventory sweep may not delete them: they
   * are the same facts the persisted Claim verification record binds against.
   */
  protectedSurfaceTexts?: readonly string[];
}>): Readonly<{
  document: ContentDocument;
  record: GeneratedFactualClaimInventoryRecord;
}> {
  if (input.drafts.length !== input.decisions.length) {
    throw new Error("Generated factual Claim decisions do not match the returned inventory.");
  }

  const document = input.document;
  const items: GeneratedFactualClaimInventoryItem[] = [];
  for (const [index, draft] of input.drafts.entries()) {
    const surfaceText = cleanText(draft.surfaceText);
    if (!surfaceText) continue;
    const decision = input.decisions[index]!;
    const locations = locateGeneratedFactualSurface(document, surfaceText);
    const planningClaimId = cleanText(draft.planningClaimId);
    const qualifiers = compactQualifiers(draft.qualifiers);
    const temporalRequirement = parseTemporalRequirement(draft.temporalRequirementJson);
    const statement = cleanText(draft.statement) || surfaceText;
    const claimId = cleanText(draft.claimId) || verificationClaimId({
      field: `generated:${draft.kind}`,
      kind: draft.kind,
      statement,
      qualifiers,
      ...(temporalRequirement ? { temporalRequirement } : {}),
      required: draft.risk === "critical",
      risk: draft.risk,
    });
    const retained = decision.retained && locations.length > 0;
    items.push(Object.freeze({
      claimId,
      ...(planningClaimId ? { planningClaimId } : {}),
      origin: draft.origin,
      risk: decision.risk ?? draft.risk,
      surfaceText,
      statement,
      kind: draft.kind,
      normalizedValueJson: draft.normalizedValueJson,
      qualifiers,
      ...(temporalRequirement ? { temporalRequirement } : {}),
      locations,
      disposition: retained ? "retained" as const : "removed" as const,
      evidenceStatus: retained ? decision.evidenceStatus : "unsupported" as const,
      ...(cleanText(draft.evidenceUrl) ? { evidenceUrl: cleanText(draft.evidenceUrl) } : {}),
      ...(cleanText(draft.evidenceExcerpt) ? { evidenceExcerpt: cleanText(draft.evidenceExcerpt) } : {}),
      ...(!retained && (decision.diagnosticCode || locations.length === 0)
        ? { diagnosticCode: decision.diagnosticCode ?? "generated_claim_surface_missing" }
        : {}),
    }));
  }

  /**
   * Every surface generation already reported, whatever the server decided
   * about it.
   *
   * The allow-list used to hold only *retained* CRITICAL surfaces, which was
   * safe only because an unsupported surface was deleted a moment later and so
   * could not be seen again. Now that nothing is deleted, a reported surface
   * that failed verification is still in the document when the sweep runs, and
   * the sweep would file it a second time as `unreported_generated_critical` —
   * an entry saying generation never declared the exact sentence it did
   * declare, with a synthesized claimId beside the real one.
   *
   * "Untracked" has to keep meaning "generation never reported it", so the
   * allow-list is every reported surface.
   */
  const reportedSurfaces = [
    ...items.map((item) => item.surfaceText),
    ...(input.protectedSurfaceTexts ?? []),
  ];
  /**
   * Surfaces generation asserted without reporting them for verification.
   *
   * Under D-039 this sweep is a *report*, not an editor. It used to delete what
   * it matched, and measurement showed why that could never work: 38 of the 43
   * withdrawn items came from here, every one of them carrying a synthesized
   * claimId that `verifiedCriticalClaimIds` can never contain, so `removed` was
   * effectively a constant. What it actually deleted was the article's own
   * framing — its lead sentence, its checklist rows, its caution notes — because
   * `criticalSurfacePattern` matches value-free wording such as `우대 조건` and
   * `자격 요건`, which is exactly the vocabulary of this site's subject matter.
   *
   * `disposition: "removed"` is kept only because the field still has two
   * values; D-039 Phase 1 renames it to `unsupported`. Consumers already treat a
   * surface that is still present in the document as not withdrawn
   * (`deliberatelyRemovedGeneratedFactualClaimIds`, `optionalEvidenceCheck`), so
   * recording these no longer claims a withdrawal that did not happen.
   */
  for (const surface of findUntrackedCriticalSurfaces(document, reportedSurfaces)) {
    const locations = locateGeneratedFactualSurface(document, surface);
    const claimId = verificationClaimId({
      field: "generated:untracked-critical",
      kind: inferCriticalKind(surface),
      statement: surface,
      qualifiers: Object.freeze({}),
      required: true,
      risk: "critical",
    });
    items.push(Object.freeze({
      claimId,
      origin: "generation" as const,
      risk: "critical" as const,
      surfaceText: surface,
      statement: surface,
      kind: inferCriticalKind(surface),
      normalizedValueJson: "{}",
      qualifiers: Object.freeze({}),
      locations,
      disposition: "removed" as const,
      evidenceStatus: "unsupported" as const,
      diagnosticCode: "unreported_generated_critical",
    }));
  }

  const retainedClaimIds = items
    .filter((item) => item.disposition === "retained")
    .map((item) => item.claimId);
  const record = Object.freeze({
    schemaVersion: 1 as const,
    items: Object.freeze(items),
    retainedClaimIds: Object.freeze([...new Set(retainedClaimIds)]),
    removedClaimCount: items.filter((item) => item.disposition === "removed").length,
  });
  // Nothing here edits blocks any more, so `longFormStructure` cannot be left
  // pointing at a block this stage deleted. The prune is kept as a no-op guard
  // against a malformed structure arriving from generation; it is removed with
  // the rest of the withdrawal machinery in D-039 Phase 5.
  const pruned = pruneLongFormStructure(document);
  return Object.freeze({
    document: Object.freeze({
      ...pruned,
      metadata: Object.freeze({
        ...pruned.metadata!,
        generatedFactualClaimInventory: record,
      }),
    }),
    record,
  });
}

export function locateGeneratedFactualSurface(
  document: ContentDocument,
  surfaceText: string,
): readonly GeneratedClaimLocation[] {
  const needle = cleanText(surfaceText);
  if (!needle) return Object.freeze([]);
  const locations: GeneratedClaimLocation[] = [];
  if (cleanText(document.title).includes(needle)) {
    locations.push(Object.freeze({ kind: "title" as const }));
  }
  for (const block of document.blocks) {
    if (blockTextSurfaces(block).some((value) => cleanText(value).includes(needle))) {
      locations.push(Object.freeze({ kind: "block" as const, blockId: block.id }));
    }
  }
  if (cleanText(document.metadata?.seoTitle ?? "").includes(needle)) {
    locations.push(Object.freeze({ kind: "metadata" as const, field: "seoTitle" as const }));
  }
  if (cleanText(document.metadata?.metaDescription ?? "").includes(needle)) {
    locations.push(Object.freeze({ kind: "metadata" as const, field: "metaDescription" as const }));
  }
  return Object.freeze(locations);
}

export function removeGeneratedFactualSurface(
  document: ContentDocument,
  surfaceText: string,
  fallbackTitle: string,
): ContentDocument {
  const needle = cleanText(surfaceText);
  if (!needle) return document;
  const blocks = document.blocks.flatMap((block): ContentBlock[] => {
    if (block.type === "heading" || block.type === "paragraph") {
      const text = removeExactSurface(block.text, needle);
      return text ? [Object.freeze({ ...block, text })] : [];
    }
    if (block.type === "list") {
      const items = block.items.map((item) => removeExactSurface(item, needle)).filter(Boolean);
      return items.length ? [Object.freeze({ ...block, items: Object.freeze(items) })] : [];
    }
    if (block.type === "table") {
      const headers = block.headers.map((item) => removeExactSurface(item, needle));
      const rows = block.rows
        .map((row) => Object.freeze(row.map((item) => removeExactSurface(item, needle))))
        .filter((row) => rowStillCarriesData(row, block.headers.length));
      return rows.length ? [Object.freeze({ ...block, headers: Object.freeze(headers), rows: Object.freeze(rows) })] : [];
    }
    if (block.type === "image") {
      const alt = removeExactSurface(block.alt, needle);
      const caption = block.caption ? removeExactSurface(block.caption, needle) : undefined;
      return [Object.freeze({ ...block, alt, ...(caption ? { caption } : { caption: undefined }) })];
    }
    if (block.type === "button") {
      const label = removeExactSurface(block.label, needle);
      return label ? [Object.freeze({ ...block, label })] : [];
    }
    return [block];
  });
  const title = removeExactSurface(document.title, needle) || cleanText(fallbackTitle) || "콘텐츠";
  const metadata = document.metadata ? Object.freeze({
    ...document.metadata,
    ...(document.metadata.seoTitle
      ? { seoTitle: removeExactSurface(document.metadata.seoTitle, needle) || title }
      : {}),
    ...(document.metadata.metaDescription
      ? { metaDescription: removeExactSurface(document.metadata.metaDescription, needle) }
      : {}),
  }) : undefined;
  return Object.freeze({ ...document, title, blocks: Object.freeze(blocks), ...(metadata ? { metadata } : {}) });
}

export function activeGeneratedFactualClaims(
  record: GeneratedFactualClaimInventoryRecord | undefined,
): readonly GeneratedFactualClaimInventoryItem[] {
  return Object.freeze(record?.items.filter((item) => item.disposition === "retained") ?? []);
}

/**
 * Claim IDs the factual inventory deliberately withdrew from the manuscript.
 *
 * The inventory is the last stage that edits the canonical document, so it owns
 * the final answer about which Claims the reader actually sees. Other Claim
 * structures — the persisted VerificationSnapshot above all — are computed
 * earlier and cannot know about a later withdrawal, so they must read it here
 * instead of assuming every verified Claim survived into the manuscript.
 *
 * A withdrawal only counts when it really happened: the recorded surface must be
 * absent from the current document. An inventory that claims a Claim was removed
 * while its text is still published grants no exemption.
 */
export function deliberatelyRemovedGeneratedFactualClaimIds(
  document: ContentDocument,
): ReadonlySet<string> {
  const removed = new Set<string>();
  for (const item of document.metadata?.generatedFactualClaimInventory?.items ?? []) {
    if (item.disposition !== "removed") continue;
    if (locateGeneratedFactualSurface(document, item.surfaceText).length) continue;
    removed.add(item.claimId);
    if (item.planningClaimId) removed.add(item.planningClaimId);
  }
  return removed;
}

export function generatedFactualInventoryIntegrityReason(
  document: ContentDocument,
): string | undefined {
  const record = document.metadata?.generatedFactualClaimInventory;
  if (!record) return undefined;
  for (const item of activeGeneratedFactualClaims(record)) {
    if (!locateGeneratedFactualSurface(document, item.surfaceText).length) {
      return `generated_factual_surface_missing:${item.claimId}`;
    }
    if (item.evidenceStatus !== "verify_verified" && item.evidenceStatus !== "critical_verified") {
      return `generated_factual_evidence_invalid:${item.claimId}`;
    }
  }
  return undefined;
}

export function findUntrackedCriticalSurfaces(
  document: ContentDocument,
  allowedSurfaceTexts: readonly string[],
): readonly string[] {
  const allowed = allowedSurfaceTexts.map(cleanText).filter(Boolean);
  const disclosed = disclosedSurfaces(document);
  const candidates = readerVisibleSurfaces(document)
    .map(cleanText)
    .filter((surface) => surface && criticalSurfacePattern.test(surface))
    .filter((surface) => !allowed.some((known) => surface.includes(known) || known.includes(surface)))
    .filter((surface) => !disclosed.has(surface));
  return Object.freeze([...new Set(candidates)]);
}

/**
 * Surfaces the sweep must leave alone because the manuscript already states
 * where they come from.
 *
 * This sweep exists to catch facts about the world that generation asserted
 * without reporting them for verification. Two kinds of number are not that:
 *
 * The `정보 기준일` line is publication metadata, not a claim — and the approval
 * content policy positively requires it in the body. Deleting it meant the
 * system removed what the policy demands, then reported the article as ready
 * without it.
 *
 * Figures inside a disclosed calculation example are derived from assumptions
 * the article prints next to them, so their source is that disclosure and the
 * arithmetic, not an external document no institution publishes. The 대출
 * 상환방식 비교 article showed what happens otherwise: the disclosure paragraph
 * was swept first, then every value of the comparison table was swept for
 * lacking a source — the source having just been deleted. The exemption is
 * scoped to the section holding the disclosure so a disclosure in one section
 * cannot shelter unrelated claims elsewhere.
 */
function disclosedSurfaces(document: ContentDocument): ReadonlySet<string> {
  const exempt = new Set<string>();
  let sectionStart = 0;
  const sections: ContentBlock[][] = [];
  document.blocks.forEach((block, index) => {
    if (block.type === "heading" && index > sectionStart) {
      sections.push(document.blocks.slice(sectionStart, index));
      sectionStart = index;
    }
  });
  sections.push(document.blocks.slice(sectionStart));

  for (const section of sections) {
    const hasCalculationDisclosure = section.some((block) =>
      blockTextSurfaces(block).some((value) => calculationDisclosurePattern.test(cleanText(value))));
    for (const block of section) {
      for (const value of blockTextSurfaces(block)) {
        for (const surface of sentenceSurfaces(value)) {
          if (hasCalculationDisclosure || informationDatePattern.test(surface)) exempt.add(surface);
        }
      }
    }
  }
  return exempt;
}

/**
 * Matches a paragraph that both names its assumptions and disclaims that the
 * figures stand for real amounts. Both halves are required: a sentence that
 * merely contains the word `예시` states nothing about where its numbers came
 * from and must still face the sweep.
 */
const calculationDisclosurePattern =
  /(?=.*(?:계산\s*예시|예시\s*계산|가정))(?=.*(?:산출|계산))(?=.*(?:대신하지\s*않|반영하지\s*않|다를\s*수\s*있))/u;

const informationDatePattern = /(?:정보\s*기준일|최종\s*검토일)\s*[:：]/u;

function blockTextSurfaces(block: ContentBlock): readonly string[] {
  if (block.type === "heading" || block.type === "paragraph") return [block.text];
  if (block.type === "list") return block.items;
  if (block.type === "table") return [block.caption ?? "", ...block.headers, ...block.rows.flat()];
  if (block.type === "image") return [block.alt, block.caption ?? ""];
  if (block.type === "button") return [block.label, block.description ?? ""];
  return [];
}

function readerVisibleSurfaces(document: ContentDocument): readonly string[] {
  return [
    document.title,
    document.metadata?.seoTitle ?? "",
    document.metadata?.metaDescription ?? "",
    ...document.blocks.flatMap(blockTextSurfaces),
  ].flatMap(sentenceSurfaces);
}

/**
 * Splits a reader-visible value into the units the sweep may withdraw.
 *
 * The sweep deletes whatever it flags, so the size of a flagged surface is the
 * size of the damage. Handing it whole paragraphs meant one unsourced figure
 * took its entire paragraph with it — in the 정부지원금 article that cost eight
 * blocks, including prose that only explained how to read a public notice and
 * carried no facts at all. Flagging sentences keeps the withdrawal the size of
 * the claim.
 *
 * A terminator only ends a sentence when whitespace or the end of the value
 * follows it, so decimal figures such as `12.5%` are never split in half.
 */
function sentenceSurfaces(value: string): readonly string[] {
  const text = cleanText(value);
  if (!text) return [];
  const sentences: string[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (!".!?。".includes(text[index]!)) continue;
    const next = text[index + 1];
    if (next !== undefined && next !== " ") continue;
    sentences.push(text.slice(start, index + 1));
    start = index + 1;
  }
  if (start < text.length) sentences.push(text.slice(start));
  const cleaned = sentences.map(cleanText).filter(Boolean);
  return cleaned.length > 1 ? cleaned : [text];
}

const criticalSurfacePattern = /(?:[$€£¥₩]\s*\d|\d[\d,.]*\s*(?:원|달러|유로)|\d+(?:\.\d+)?\s*(?:%|퍼센트)|\d{4}\s*[년.-]\s*\d{1,2}(?:\s*[월.-]\s*\d{1,2})?|(?:법률|법령|세법|법적 의무|법적 금지|[가-힣]+법(?:상|에 따라|\s*제\d+조)|자격\s*요건|(?:신청|지원)\s*(?:자격|조건|대상)|공식 조건|상품 조건|가입 조건|해지 조건|연회비|우대 조건)|(?:금리|세율)\s*(?:은|는|이|가|:)?\s*\d)/u;

function inferCriticalKind(surface: string): VerificationClaimKind {
  if (/(?:[$€£¥₩]\s*\d|\d[\d,.]*\s*(?:원|달러|유로))/u.test(surface)) return "money";
  if (/(?:%|퍼센트|금리|세율)/u.test(surface)) return "ratio";
  if (/\d{4}\s*[년.-]/u.test(surface)) return "date";
  if (/(?:자격 요건|신청 조건|지원 대상)/u.test(surface)) return "eligibility";
  if (/(?:법률|법령|세법|법적)/u.test(surface)) return "legal";
  return "general";
}

/**
 * True when a table row still says something after a withdrawal.
 *
 * Withdrawing every measured value from a comparison table leaves rows that hold
 * only their leading label — `원리금균등상환 | | | |` — and an empty table shell
 * is not a weaker version of the table, it is a broken one: the surrounding
 * prose keeps explaining figures the reader can no longer see. A multi-column
 * row therefore has to keep at least one value next to its label, and a table
 * whose rows all fail that test is dropped by the caller.
 */
function rowStillCarriesData(row: readonly string[], columnCount: number): boolean {
  const filled = row.filter(Boolean).length;
  return columnCount >= 2 ? filled >= 2 : filled >= 1;
}

/**
 * Removes a factual surface without corrupting the values around it.
 *
 * A withdrawn surface is often a bare amount such as `60,000원`, and the same
 * digits appear inside larger amounts such as `12,060,000원`. A plain substring
 * replace turns that neighbour into the fragment `12,0`, which is worse than
 * either keeping or dropping it: the manuscript then publishes a number nobody
 * generated. Only occurrences that are not part of a longer number are removed.
 */
function removeExactSurface(value: string, surfaceText: string): string {
  if (!surfaceText) return value.trim();
  let kept = "";
  let rest = value;
  for (;;) {
    const index = rest.indexOf(surfaceText);
    if (index < 0) {
      kept += rest;
      break;
    }
    const end = index + surfaceText.length;
    if (splitsAdjacentNumber(surfaceText, rest[index - 1] ?? "", rest[end] ?? "")) {
      kept += rest.slice(0, end);
    } else {
      kept += `${rest.slice(0, index)} `;
    }
    rest = rest.slice(end);
  }
  return kept
    .replace(/\s+([,.!?。，！？])/gu, "$1")
    .replace(/\s{2,}/gu, " ")
    .trim();
}

/**
 * True when removing this occurrence would cut a longer number in half, which
 * happens whenever a shorter amount is a digit-aligned suffix or prefix of the
 * value actually printed at this position.
 */
function splitsAdjacentNumber(surfaceText: string, before: string, after: string): boolean {
  if (/^\d/u.test(surfaceText) && /[\d.,]/u.test(before)) return true;
  if (/\d$/u.test(surfaceText) && /\d/u.test(after)) return true;
  return false;
}

function compactQualifiers(value: GeneratedFactualClaimInventoryDraft["qualifiers"]): VerificationClaimQualifiers {
  return Object.freeze(Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => cleanText(item) ? [[key, cleanText(item)]] : []),
  ));
}

function parseTemporalRequirement(value: string): VerificationTemporalRequirement | undefined {
  if (!value.trim() || value.trim() === "null") return undefined;
  try {
    const parsed = JSON.parse(value) as VerificationTemporalRequirement;
    if (parsed.mode === "current" || parsed.mode === "notRequired" || parsed.mode === "unknown") return Object.freeze(parsed);
    if (parsed.mode === "asOf" && typeof parsed.date === "string") return Object.freeze(parsed);
    if (parsed.mode === "period" && typeof parsed.start === "string" && typeof parsed.end === "string") return Object.freeze(parsed);
  } catch {
    return undefined;
  }
  return undefined;
}

function cleanText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}
