import type { AIProvider, AIUsageRecord } from "../../core/ai";
import {
  approvalPolicySnapshotFromEditorialContext,
  createApprovalRequiredEvidenceContract,
} from "../../core/approval";
import { createContentOpportunityCandidate } from "../../core/content";
import type { ContentPlanningResult, WorkspacePlatform } from "../user-flow/user-data";
import {
  ContentPlanningStrategy as BaseContentPlanningStrategy,
  type ContentPlanningContext,
} from "./ContentPlanningStrategyBase";

export * from "./ContentPlanningStrategyBase";

type UsageBox = { value?: AIUsageRecord };

export class ContentPlanningStrategy extends BaseContentPlanningStrategy {
  private readonly usageBox: UsageBox;

  constructor(provider: AIProvider) {
    const usageBox: UsageBox = {};
    super({
      generate: async (request) => {
        const response = await provider.generate(request);
        usageBox.value = response.diagnostics?.aiUsage;
        return response;
      },
    });
    this.usageBox = usageBox;
  }

  override async analyze(
    naturalLanguageRequest: string,
    enabledPlatforms?: readonly WorkspacePlatform[],
    context: ContentPlanningContext = { projectId: "planning-project", selectionMode: "userSpecified" },
  ): Promise<ContentPlanningResult> {
    this.usageBox.value = undefined;
    const approvalSnapshot = approvalPolicySnapshotFromEditorialContext(context.projectContext);
    const planningContext = approvalSnapshot
      ? Object.freeze({ ...context, explicitVerificationPlanningEnabled: true })
      : context;
    const plan = await super.analyze(naturalLanguageRequest, enabledPlatforms, planningContext);
    const withContract = approvalSnapshot
      ? attachApprovalEvidenceContracts(plan, approvalSnapshot)
      : plan;
    return this.usageBox.value
      ? Object.freeze({ ...withContract, aiUsage: this.usageBox.value }) as ContentPlanningResult
      : withContract;
  }
}

export function attachApprovalEvidenceContracts(
  plan: ContentPlanningResult,
  snapshot: import("../../core/approval").ApprovalPolicySnapshot,
): ContentPlanningResult {
  const opportunityCandidates = (plan.opportunityCandidates ?? []).map((candidate) => {
    return ensureApprovalEvidenceContract(candidate, snapshot);
  });
  return Object.freeze({
    ...plan,
    opportunityCandidates: Object.freeze(opportunityCandidates),
  });
}

export function ensureApprovalEvidenceContract(
  opportunity: import("../../core/content").ConfirmedContentOpportunity,
  snapshot: import("../../core/approval").ApprovalPolicySnapshot,
): import("../../core/content").ConfirmedContentOpportunity;
export function ensureApprovalEvidenceContract(
  opportunity: import("../../core/content").ContentOpportunityCandidate,
  snapshot: import("../../core/approval").ApprovalPolicySnapshot,
): import("../../core/content").ContentOpportunityCandidate;
export function ensureApprovalEvidenceContract(
  opportunity: import("../../core/content").ContentOpportunityCandidate,
  snapshot: import("../../core/approval").ApprovalPolicySnapshot,
): import("../../core/content").ContentOpportunityCandidate {
  const contract = opportunity.requiredEvidenceContract;
  const expected = createApprovalRequiredEvidenceContract(opportunity, snapshot);
  if (contract?.contractId === expected.contractId) return opportunity;
  const normalized = createContentOpportunityCandidate({
    ...opportunity,
    requiredEvidenceContract: expected,
  });
  if (!("workspaceId" in opportunity)) return normalized;
  const confirmed = opportunity as import("../../core/content").ConfirmedContentOpportunity;
  return Object.freeze({
    ...normalized,
    workspaceId: confirmed.workspaceId,
    contentId: confirmed.contentId,
    confirmedAt: confirmed.confirmedAt,
  }) as import("../../core/content").ConfirmedContentOpportunity;
}
