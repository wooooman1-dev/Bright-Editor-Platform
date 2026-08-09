import type { ContentOpportunityCandidate } from "../content";
import {
  hasConcreteApprovalSourcePreflightPlannedValue,
  requiredApprovalSourcePreflightClaims,
  type ApprovalRequiredEvidenceContract,
  type ApprovalSourcePreflightRequirement,
} from "./ApprovalSourcePreflightCoverage";
import type { ApprovalPolicySnapshot } from "./ApprovalPolicy";
import { isCriticalVerificationClaim } from "./VerificationClaim";

export function createApprovalRequiredEvidenceContract(
  opportunity: ContentOpportunityCandidate,
  snapshot: ApprovalPolicySnapshot,
): ApprovalRequiredEvidenceContract {
  const scopedClaims = scopeApprovalSourcePreflightRequirements(
    opportunity,
    requiredApprovalSourcePreflightClaims(opportunity, snapshot.profileId),
  );
  const requiredClaims = scopedClaims;
  const identity = JSON.stringify({
    schemaVersion: 1,
    policyId: snapshot.policyId,
    policyVersion: snapshot.policyVersion,
    profileId: snapshot.profileId,
    profileVersion: snapshot.profileVersion,
    profileSourceRequirementApplicable: requiredClaims.length > 0,
    explicitVerificationRequired: Boolean(opportunity.verificationPlan?.claims.some(isCriticalVerificationClaim)),
    sourceRequirements: snapshot.sourceRequirements,
    requiredClaims,
  });
  return Object.freeze({
    schemaVersion: 1,
    contractId: stableContractId(identity),
    policyId: snapshot.policyId,
    policyVersion: snapshot.policyVersion,
    profileId: snapshot.profileId,
    profileVersion: snapshot.profileVersion,
    profileSourceRequirementApplicable: requiredClaims.length > 0,
    explicitVerificationRequired: Boolean(opportunity.verificationPlan?.claims.some(isCriticalVerificationClaim)),
    sourceRequirements: Object.freeze([...snapshot.sourceRequirements]),
    requiredClaims: Object.freeze([...requiredClaims]),
  });
}

export function scopeApprovalSourcePreflightRequirements(
  opportunity: ContentOpportunityCandidate,
  requirements: readonly ApprovalSourcePreflightRequirement[],
): readonly ApprovalSourcePreflightRequirement[] {
  const topicText = primaryTopicText(opportunity);
  return Object.freeze(requirements.filter((requirement) => {
    if (requirement.plannedValue?.trim()) {
      return !genericScalarFields.has(requirement.field)
        || hasConcreteApprovalSourcePreflightPlannedValue(
          opportunity,
          requirement,
        );
    }
    if (requirement.field.startsWith("genericClaim:")) return true;
    if (genericScalarFields.has(requirement.field)) return false;
    if (depositProtectionFields.has(requirement.field)) {
      return depositProtectionTopicPattern.test(topicText);
    }
    if (retirementFields.has(requirement.field)) {
      return retirementTopicPattern.test(topicText);
    }
    if (revolvingFields.has(requirement.field)) {
      return revolvingTopicPattern.test(topicText);
    }
    if (continuingTransactionFields.has(requirement.field)) {
      return continuingTransactionTopicPattern.test(topicText);
    }
    return true;
  }));
}

function primaryTopicText(opportunity: ContentOpportunityCandidate): string {
  return [
    opportunity.sourceRequest,
    opportunity.selectedTopic,
    opportunity.primaryKeyword,
    ...opportunity.secondaryKeywords,
    opportunity.searchIntent,
    opportunity.contentAngle,
    opportunity.readerProblem,
  ].join("\n");
}

function stableContractId(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `approval-evidence-contract-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

const genericScalarFields = new Set([
  "eligibility",
  "period",
  "amount",
  "incomeThreshold",
  "interestRate",
  "taxRate",
  "exceptions",
  "statutoryBasis",
]);

const retirementFields = new Set([
  "continuousServicePeriod",
  "averageWage",
  "retirementPayFormula",
  "paymentDeadline",
  "leaveTreatment",
  "interimSettlement",
]);

const depositProtectionFields = new Set([
  "depositProtectedProducts",
  "depositProtectionLimit",
  "depositProtectionUnit",
  "depositProtectionExclusions",
  "depositProtectionCheckPath",
  "depositProtectionEffectiveDate",
  "depositProtectionStatutoryBasis",
]);

const revolvingFields = new Set([
  "revolvingDefinition",
  "revolvingInstallmentDifference",
  "revolvingPaymentStructure",
  "revolvingFeeRisk",
  "revolvingDisclosureDuty",
  "revolvingFeeDisclosure",
  "revolvingMinimumPaymentRatio",
  "revolvingCancellationGuidance",
]);

const continuingTransactionFields = new Set([
  "continuingTransactionDefinition",
  "continuingTransactionArticle30Threshold",
  "continuingTransactionContractDocument",
  "excessiveTerminationPenalty",
  "excessPaymentRefund",
]);

const retirementTopicPattern = /퇴직금|퇴직급여|계속\s*근로|평균\s*임금/iu;
const depositProtectionTopicPattern =
  /예금자\s*보호|예금\s*보호|예금보험|보호\s*한도|보호\s*대상\s*금융상품/iu;
const revolvingTopicPattern =
  /리볼빙|일부결제금액이월약정|약정결제비율|이월잔액/iu;
const continuingTransactionTopicPattern =
  /계속거래[^\n.]{0,260}(?:계약서|설명|위약금|환급|해지)|(?:계약서|위약금|환급)[^\n.]{0,260}계속거래/iu;
