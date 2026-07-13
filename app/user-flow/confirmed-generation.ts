import type { ContentDocument } from "../../core/content";
import type { QualityReport } from "../../core/quality";
import { applyCanonicalDocument, updateContent, type UserData } from "./user-data";

export type ConfirmedGenerationResult = Readonly<{
  document: ContentDocument;
  quality?: QualityReport;
}>;

export async function completeConfirmedGeneration(
  data: UserData,
  input: Readonly<{ contentId: string; generated: ConfirmedGenerationResult; now: string }>,
  dependencies: Readonly<{
    persist: (next: UserData) => Promise<void>;
    openEditor: (contentId: string) => void;
  }>,
): Promise<UserData> {
  let next = applyCanonicalDocument(data, input.contentId, input.generated.document, "generation", input.now);
  next = updateContent(next, input.contentId, { quality: input.generated.quality });
  if (input.generated.quality) {
    next = {
      ...next,
      qualityReports: [
        ...(next.qualityReports ?? []).filter((item) => item.contentId !== input.contentId),
        { contentId: input.contentId, report: input.generated.quality },
      ],
    };
  }
  await dependencies.persist(next);
  dependencies.openEditor(input.contentId);
  return next;
}
