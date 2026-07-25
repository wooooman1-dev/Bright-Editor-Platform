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
  metaDescription?: string;
  primarySearchIntent?: string;
  secondaryIntent?: string;
  secondaryKeywords?: readonly string[];
  relatedTerms?: readonly string[];
  tags?: readonly string[];
  availableRelatedContentCandidates?: number;
  internalLinkCatalogStatus?: "evaluated" | "category_missing" | "catalog_unavailable";
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
