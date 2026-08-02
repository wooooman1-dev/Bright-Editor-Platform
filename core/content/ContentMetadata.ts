import type { AIUsageRecord } from "../ai/AIUsageCost";
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
  approvalReadinessExecution?: Readonly<{
    version: "1.0" | "2.0";
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
