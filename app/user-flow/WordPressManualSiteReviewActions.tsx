"use client";

import type { ContentDocument } from "../../core/content";
import type { QualityReport } from "../../core/quality";
import type { UserData } from "./user-data";

/**
 * Legacy compatibility shim.
 *
 * WordPress site readiness is now evaluated by automatic public-site checks.
 * The previous checkbox-based manual review UI is intentionally disabled.
 */
export function WordPressManualSiteReviewActions(props: Readonly<{
  workspaceId: string;
  contentId: string;
  disabled?: boolean;
  refreshKey?: string;
  onCompleted: (result: Readonly<{
    data: UserData;
    document: ContentDocument;
    quality: QualityReport;
  }>) => Promise<void> | void;
}>): null {
  void props;
  return null;
}
