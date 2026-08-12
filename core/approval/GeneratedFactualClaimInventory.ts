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

  let document = input.document;
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
    if (!retained && locations.length) {
      document = removeGeneratedFactualSurface(document, surfaceText, input.fallbackTitle);
    }
  }

  const retainedCriticalSurfaces = [
    ...items
      .filter((item) => item.disposition === "retained" && item.risk === "critical")
      .map((item) => item.surfaceText),
    ...(input.protectedSurfaceTexts ?? []),
  ];
  for (const surface of findUntrackedCriticalSurfaces(document, retainedCriticalSurfaces)) {
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
    document = removeGeneratedFactualSurface(document, surface, input.fallbackTitle);
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
  return Object.freeze({
    document: Object.freeze({
      ...document,
      metadata: Object.freeze({
        ...document.metadata!,
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
        .filter((row) => row.some(Boolean));
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
  const candidates = readerVisibleSurfaces(document)
    .map(cleanText)
    .filter((surface) => surface && criticalSurfacePattern.test(surface))
    .filter((surface) => !allowed.some((known) => surface.includes(known) || known.includes(surface)));
  return Object.freeze([...new Set(candidates)]);
}

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
  ];
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

function removeExactSurface(value: string, surfaceText: string): string {
  return value.replace(surfaceText, " ")
    .replace(/\s+([,.!?。，！？])/gu, "$1")
    .replace(/\s{2,}/gu, " ")
    .trim();
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
