import type { SecretStore } from "../../../core/connections";
import type { ContentDocument } from "../../../core/content";
import { PublishingPermissionGate } from "../../../core/publishing";
import {
  WordPressCategoryAdapter,
  WordPressDraftPublishingAdapter,
  WordPressHtmlRenderer,
  WordPressMediaAdapter,
  type WordPressCategoryListResult,
  type WordPressConnectionInput,
  type WordPressDraftVerification,
} from "../../../apps/wordpress";
import type { PlatformConnection } from "../../../core/connections";
import type { UserContent, UserData, UserProject } from "../../user-flow/user-data";
import {
  assertWordPressCategoryLookupAllowed,
  calculateWordPressDraftReadiness,
  type WordPressDraftReadiness,
} from "./WordPressDraftReadiness";
import {
  applyWordPressMediaReplacements,
  prepareWordPressLocalMedia,
  type WordPressLocalMediaItem,
  type WordPressLocalMediaReader,
} from "./WordPressMediaPreparation";

export type WordPressDraftMediaResult = Readonly<{
  assetId: string;
  blockId: string;
  externalMediaId: string;
  sourceUrl: string;
  alt: string;
  verified: boolean;
}>;

export type WordPressDraftExecutionResult = Readonly<{
  status: "verified" | "failed" | "verification_failed";
  stage: "readiness" | "media" | "draft_create" | "draft_verify" | "complete";
  cleanupRequired: boolean;
  uploadedMedia: readonly WordPressDraftMediaResult[];
  externalId?: string;
  verification?: WordPressDraftVerification;
  readiness?: WordPressDraftReadiness;
  error?: string;
}>;

export type WordPressDraftExecutionInput = Readonly<{
  data: UserData;
  projectId: string;
  contentId: string;
  connection: PlatformConnection;
  selectedTarget: boolean;
  finalConfirmation: boolean;
  slug?: string;
}>;

type CategoryReader = Pick<WordPressCategoryAdapter, "listAllCategories">;
type MediaWriter = Pick<WordPressMediaAdapter, "uploadMedia" | "storeAlt" | "readMedia" | "verifyMedia">;
type DraftWriter = Pick<WordPressDraftPublishingAdapter, "prepare" | "createDraft" | "readDraft" | "verifyDraft">;

export type WordPressDraftApplicationDependencies = Readonly<{
  secrets: Pick<SecretStore, "readSecret">;
  categories?: CategoryReader;
  media?: MediaWriter;
  drafts?: DraftWriter;
  localMedia?: WordPressLocalMediaReader;
  renderer?: WordPressHtmlRenderer;
  maxMediaBytes?: number;
}>;

type PreparedExecution = Readonly<{
  project: UserProject;
  content: UserContent & Readonly<{ document: ContentDocument }>;
  credentials: WordPressConnectionInput;
  categoryResult: WordPressCategoryListResult;
  mediaPlan: readonly WordPressLocalMediaItem[];
  readiness: WordPressDraftReadiness;
}>;

export class WordPressDraftApplicationService {
  private readonly categories: CategoryReader;
  private readonly media: MediaWriter;
  private readonly drafts: DraftWriter;

  constructor(private readonly dependencies: WordPressDraftApplicationDependencies) {
    this.categories = dependencies.categories ?? new WordPressCategoryAdapter();
    this.media = dependencies.media ?? new WordPressMediaAdapter();
    this.drafts = dependencies.drafts ?? new WordPressDraftPublishingAdapter(undefined, dependencies.renderer);
  }

  async readiness(input: WordPressDraftExecutionInput): Promise<WordPressDraftReadiness> {
    return (await this.prepare(input)).readiness;
  }

  async execute(input: WordPressDraftExecutionInput): Promise<WordPressDraftExecutionResult> {
    let prepared: PreparedExecution;
    try { prepared = await this.prepare(input); }
    catch {
      return failure("readiness", [], false, "WordPress Draft readiness could not be verified.");
    }
    if (!prepared.readiness.executable || !prepared.readiness.categorySelection.valid) {
      return Object.freeze({
        ...failure("readiness", [], false, "WordPress Draft readiness is blocked."),
        readiness: prepared.readiness,
      });
    }

    const uploadedMedia: WordPressDraftMediaResult[] = [];
    let mediaUploadAttempted = false;
    for (const item of prepared.mediaPlan) {
      try {
        this.authorize("media.upload", input);
        mediaUploadAttempted = true;
        const uploaded = await this.media.uploadMedia({ ...prepared.credentials, ...item });
        uploadedMedia.push(Object.freeze({
          assetId: item.assetId,
          blockId: item.blockId,
          externalMediaId: uploaded.externalMediaId,
          sourceUrl: uploaded.sourceUrl,
          alt: item.alt,
          verified: false,
        }));
        await this.media.storeAlt({
          ...prepared.credentials,
          externalMediaId: uploaded.externalMediaId,
          alt: item.alt,
        });
        const external = await this.media.readMedia({
          ...prepared.credentials,
          externalMediaId: uploaded.externalMediaId,
        });
        this.media.verifyMedia(external, { ...uploaded, alt: item.alt });
        uploadedMedia[uploadedMedia.length - 1] = Object.freeze({
          ...uploadedMedia[uploadedMedia.length - 1],
          verified: true,
        });
      } catch {
        return failure("media", uploadedMedia, mediaUploadAttempted, "WordPress Media upload and verification failed.");
      }
    }

    let executionReadiness = prepared.readiness;
    if (prepared.mediaPlan.length) {
      try { executionReadiness = await this.revalidateAfterMedia(input, prepared); }
      catch {
        return failure("readiness", uploadedMedia, uploadedMedia.length > 0, "WordPress Category revalidation failed.");
      }
      if (!executionReadiness.executable || !executionReadiness.categorySelection.valid) {
        return Object.freeze({
          ...failure("readiness", uploadedMedia, uploadedMedia.length > 0, "WordPress Category revalidation blocked Draft creation."),
          readiness: executionReadiness,
        });
      }
    }
    const categorySelection = executionReadiness.categorySelection;
    if (!categorySelection.valid) {
      return Object.freeze({
        ...failure("readiness", uploadedMedia, uploadedMedia.length > 0, "WordPress Category revalidation blocked Draft creation."),
        readiness: executionReadiness,
      });
    }

    const renderedDocument = applyWordPressMediaReplacements(prepared.content.document, uploadedMedia);
    const renderArtifact = await this.drafts.prepare({ content: renderedDocument, platform: "wordpress" });
    const html = renderArtifact.payload.html;
    const featuredImageAssetId = prepared.content.publishingPreparation?.wordpress?.publishingAccountId === input.connection.id
      ? prepared.content.publishingPreparation.wordpress.featuredImageAssetId
      : undefined;
    const featuredMediaId = featuredImageAssetId
      ? uploadedMedia.find((media) => media.assetId === featuredImageAssetId && media.verified)?.externalMediaId
      : undefined;
    if (featuredImageAssetId && !featuredMediaId) {
      return failure("media", uploadedMedia, uploadedMedia.length > 0, "The selected WordPress Featured Image was not verified.");
    }

    let externalId: string;
    try {
      this.authorize("draft.create", input);
      const created = await this.drafts.createDraft({
        ...prepared.credentials,
        payload: {
          title: prepared.content.document.title,
          content: html,
          excerpt: excerpt(prepared.content.document),
          status: "draft",
          categories: categorySelection.categoryIds,
          ...(input.slug?.trim() ? { slug: input.slug.trim() } : {}),
          ...(featuredMediaId ? { featuredMediaId } : {}),
        },
      });
      externalId = created.externalId;
    } catch {
      return failure("draft_create", uploadedMedia, uploadedMedia.length > 0, "WordPress Draft creation failed.");
    }

    try {
      this.authorize("draft.verify", input);
      const draft = await this.drafts.readDraft({ ...prepared.credentials, externalId });
      const verification = this.drafts.verifyDraft(draft, {
        externalId,
        title: prepared.content.document.title,
        content: html,
        categoryIds: categorySelection.categoryIds,
        mediaUrls: uploadedMedia.map((media) => media.sourceUrl),
        ...(featuredMediaId ? { featuredMediaId } : {}),
      });
      if (!verification.verified) {
        return Object.freeze({
          status: "verification_failed",
          stage: "draft_verify",
          cleanupRequired: uploadedMedia.length > 0,
          uploadedMedia: Object.freeze([...uploadedMedia]),
          externalId,
          verification,
          readiness: executionReadiness,
          error: "WordPress Draft external re-read verification failed.",
        });
      }
      return Object.freeze({
        status: "verified",
        stage: "complete",
        cleanupRequired: false,
        uploadedMedia: Object.freeze([...uploadedMedia]),
        externalId,
        verification,
        readiness: executionReadiness,
      });
    } catch {
      return Object.freeze({
        ...failure("draft_verify", uploadedMedia, uploadedMedia.length > 0, "WordPress Draft external re-read verification failed."),
        externalId,
        readiness: executionReadiness,
      });
    }
  }

  private async prepare(input: WordPressDraftExecutionInput): Promise<PreparedExecution> {
    const project = input.data.projects.find((item) => item.id === input.projectId);
    const content = input.data.contents.find((item) => item.id === input.contentId);
    if (!project || !content) throw new Error("WordPress publishing Project or Content was not found.");
    assertWordPressCategoryLookupAllowed({ data: input.data, project, content, connection: input.connection });
    if (!content.document) throw new Error("Canonical ContentDocument is required.");
    const credentials = await this.credentials(input.connection);
    const categoryResult = await this.categories.listAllCategories({
      ...credentials,
      platformConnectionId: input.connection.id,
      pageSize: 100,
    });
    if (categoryResult.platformConnectionId !== input.connection.id) {
      throw new Error("WordPress category result belongs to a different connection.");
    }
    const preparation = content.publishingPreparation?.wordpress;
    const mediaPlan = await prepareWordPressLocalMedia({
      document: content.document,
      mediaAssets: input.data.mediaMetadata ?? [],
      workspaceId: input.data.workspace!.id,
      projectId: project.id,
      contentId: content.id,
      ...(preparation?.publishingAccountId === input.connection.id && preparation.featuredImageAssetId
        ? { featuredImageAssetId: preparation.featuredImageAssetId }
        : {}),
      ...(this.dependencies.localMedia ? { reader: this.dependencies.localMedia } : {}),
      ...(this.dependencies.maxMediaBytes ? { maxBytes: this.dependencies.maxMediaBytes } : {}),
    });
    const readiness = calculateWordPressDraftReadiness({
      data: input.data,
      project,
      content,
      connection: input.connection,
      categoryResult,
      selectedTarget: input.selectedTarget,
      finalConfirmation: input.finalConfirmation,
      mediaValidationPassed: true,
    });
    return Object.freeze({
      project,
      content: content as UserContent & Readonly<{ document: ContentDocument }>,
      credentials,
      categoryResult,
      mediaPlan,
      readiness,
    });
  }

  private async revalidateAfterMedia(
    input: WordPressDraftExecutionInput,
    prepared: PreparedExecution,
  ): Promise<WordPressDraftReadiness> {
    assertWordPressCategoryLookupAllowed({
      data: input.data,
      project: prepared.project,
      content: prepared.content,
      connection: input.connection,
    });
    const categoryResult = await this.categories.listAllCategories({
      ...prepared.credentials,
      platformConnectionId: input.connection.id,
      pageSize: 100,
    });
    if (categoryResult.platformConnectionId !== input.connection.id) {
      throw new Error("WordPress category result belongs to a different connection.");
    }
    return calculateWordPressDraftReadiness({
      data: input.data,
      project: prepared.project,
      content: prepared.content,
      connection: input.connection,
      categoryResult,
      selectedTarget: input.selectedTarget,
      finalConfirmation: input.finalConfirmation,
      mediaValidationPassed: true,
    });
  }

  private authorize(
    workflow: "media.upload" | "draft.create" | "draft.verify",
    input: WordPressDraftExecutionInput,
  ): void {
    new PublishingPermissionGate().authorize({
      workspaceId: input.data.workspace?.id ?? "",
      projectId: input.projectId,
      contentId: input.contentId,
      platformConnectionId: input.connection.id,
      workflow,
      finalConfirmation: input.finalConfirmation,
    }, input.connection);
  }

  private async credentials(connection: PlatformConnection): Promise<WordPressConnectionInput> {
    const siteUrl = publicString(connection, "siteUrl");
    const username = publicString(connection, "username");
    if (!siteUrl || !username || !connection.secretReference) throw new Error("WordPress reconnect is required.");
    let applicationPassword: string;
    try { applicationPassword = await this.dependencies.secrets.readSecret(connection.secretReference); }
    catch { throw new Error("WordPress reconnect is required."); }
    if (!applicationPassword.trim()) throw new Error("WordPress reconnect is required.");
    return Object.freeze({ siteUrl, username, applicationPassword });
  }
}

function excerpt(document: ContentDocument): string {
  const metadata = document.metadata?.metaDescription?.trim();
  if (metadata) return metadata;
  const paragraph = document.blocks.find((block) => block.type === "paragraph");
  return paragraph?.type === "paragraph" ? paragraph.text.trim().slice(0, 300) : "";
}

function publicString(connection: PlatformConnection, key: string): string | undefined {
  const value = connection.publicMetadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function failure(
  stage: WordPressDraftExecutionResult["stage"],
  uploadedMedia: readonly WordPressDraftMediaResult[],
  cleanupRequired: boolean,
  error: string,
): WordPressDraftExecutionResult {
  return Object.freeze({
    status: "failed",
    stage,
    cleanupRequired,
    uploadedMedia: Object.freeze([...uploadedMedia]),
    error,
  });
}
