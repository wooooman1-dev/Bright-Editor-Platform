import type { ContentDocument } from "../content";
import {
  activeGeneratedFactualClaims,
  findUntrackedCriticalSurfaces,
  locateGeneratedFactualSurface,
  type GeneratedFactualClaimInventoryDraft,
} from "./GeneratedFactualClaimInventory";

export type QualityReviewFactualGuardResult = Readonly<{
  passed: boolean;
  document: ContentDocument;
  reason?: string;
}>;

/**
 * Quality Review may edit prose but cannot become a second Claim-authoring or
 * evidence-acquisition phase. Its inventory must be a complete subset-preserving
 * projection of the server-owned verified Generation inventory.
 */
export function guardQualityReviewFactualClaims(input: Readonly<{
  current: ContentDocument;
  candidate: ContentDocument;
  drafts: readonly GeneratedFactualClaimInventoryDraft[];
}>): QualityReviewFactualGuardResult {
  const record = input.current.metadata?.generatedFactualClaimInventory;
  if (!record) return failed(input.candidate, "quality_factual_inventory_missing_on_current");
  const active = activeGeneratedFactualClaims(record);
  const byClaimId = new Map(active.map((item) => [item.claimId, item]));
  const returnedIds = new Set<string>();

  for (const draft of input.drafts) {
    const canonical = byClaimId.get(draft.claimId);
    if (!canonical) return failed(input.candidate, "quality_new_factual_claim_added");
    if (draft.origin === "quality_review" || draft.risk !== canonical.risk) {
      return failed(input.candidate, "quality_factual_claim_contract_changed");
    }
    if (draft.surfaceText.trim() !== canonical.surfaceText
      || draft.statement.trim() !== canonical.statement
      || draft.normalizedValueJson.trim() !== canonical.normalizedValueJson
      || draft.temporalRequirementJson.trim() !== (canonical.temporalRequirement ? JSON.stringify(canonical.temporalRequirement) : "null")
      || JSON.stringify(draft.qualifiers) !== JSON.stringify({
        subject: canonical.qualifiers.subject ?? "",
        scope: canonical.qualifiers.scope ?? "",
        basis: canonical.qualifiers.basis ?? "",
        note: canonical.qualifiers.note ?? "",
      })
      || draft.evidenceUrl.trim() !== (canonical.evidenceUrl ?? "")
      || draft.evidenceExcerpt.trim() !== (canonical.evidenceExcerpt ?? "")) {
      return failed(input.candidate, "quality_verified_factual_surface_changed");
    }
    if (!locateGeneratedFactualSurface(input.candidate, canonical.surfaceText).length) {
      return failed(input.candidate, "quality_verified_factual_surface_missing");
    }
    returnedIds.add(canonical.claimId);
  }

  if (active.some((item) => !returnedIds.has(item.claimId))) {
    return failed(input.candidate, "quality_verified_factual_claim_omitted");
  }
  const allowedCritical = active.filter((item) => item.risk === "critical").map((item) => item.surfaceText);
  if (findUntrackedCriticalSurfaces(input.candidate, allowedCritical).length) {
    return failed(input.candidate, "quality_unverified_critical_surface_added");
  }

  return Object.freeze({
    passed: true,
    document: Object.freeze({
      ...input.candidate,
      metadata: Object.freeze({
        ...input.candidate.metadata!,
        generatedFactualClaimInventory: record,
      }),
    }),
  });
}

function failed(document: ContentDocument, reason: string): QualityReviewFactualGuardResult {
  return Object.freeze({ passed: false, document, reason });
}
