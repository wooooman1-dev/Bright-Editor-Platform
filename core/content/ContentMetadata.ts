import type { AIUsageRecord } from "../ai/AIUsageCost";
import type { GeneratedClaimVerificationRecord } from "../approval/GeneratedClaimBinding";
import type { GeneratedFactualClaimInventoryRecord } from "../approval/GeneratedFactualClaimInventory";
import type {
  ApprovalDuplicateCheckSnapshot,
  ApprovalEvidencePack,
  ApprovalPolicySnapshot,
  SiteApprovalReadinessSnapshot,
} from "../approval";
import type { ContentPlanQualityTarget, ContentSectionType } from "./ContentDepthPolicy";
import type { LongFormDiagnostic } from "./LongFormDiagnostics";

export type ContentMetadata = Readonly<{
  buttonCount: number;
  createdAt: string;
  generator: string;
  imageCount: number;
  language: string;
  readingTime: number;
  source: string;
  updatedAt: string;
  version: number;
  videoCount: number;
  wordCount: number;
  seoTitle?: string;
  metaDescription?: string;
  primarySearchIntent?: string;
  secondaryIntent?: string;
  secondaryKeywords?: readonly string[];
  relatedTerms?: readonly string[];
  tags?: readonly string[];
  aiUsage?: readonly AIUsageRecord[];
  availableRelatedContentCandidates?: number;
  internalLinkCatalogStatus?: "evaluated" | "category_missing" | "catalog_unavailable";
  internalLinkCatalogContextKey?: string;
  approvalPolicy?: ApprovalPolicySnapshot;
  approvalEvidence?: ApprovalEvidencePack;
  approvalDuplicateCheck?: ApprovalDuplicateCheckSnapshot;
  siteApprovalReadiness?: SiteApprovalReadinessSnapshot;
  generatedClaimVerification?: GeneratedClaimVerificationRecord;
  generatedFactualClaimInventory?: GeneratedFactualClaimInventoryRecord;
  approvalReadinessExecution?: Readonly<{
    // 과거 버전은 남겨 둔다 — 저장된 스냅샷이 그 값을 그대로 들고 있고,
    // 현재 계약과 다르다는 사실 자체가 재검사 신호이기 때문이다.
    version: "1.0" | "2.0" | "3.0" | "4.0" | "4.1";
    key: string;
    editorialRevisionId: string;
    publishingContextKey: string;
    evidenceFingerprint: string;
    status: "completed";
    checkedAt: string;
  }>;
  qualityTarget?: ContentPlanQualityTarget;
  generationDiagnostic?: LongFormDiagnostic;
  reviewDiagnostic?: LongFormDiagnostic;
  longFormStructure?: Readonly<{
    introductionBlockIds: readonly string[];
    sections: readonly Readonly<{
      headingBlockId: string;
      paragraphBlockIds: readonly string[];
      sectionType?: ContentSectionType;
    }>[];
    conclusionBlockIds: readonly string[];
  }>;
}>;
