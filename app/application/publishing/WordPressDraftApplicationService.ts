import type { SecretStore } from "../../../core/connections";
import type { ContentDocument } from "../../../core/content";
import { contentRevisionId, evaluateHtmlIntegrity } from "../../../core/quality";
import {
  createDraftCreateIdempotencyKey,
  PublishingPermissionGate,
  type PublishingExecutionRecord,
  type PublishingExecutionStatus,
} from "../../../core/publishing";
import {
  WordPressCategoryAdapter,
  WordPressDraftCreateUncertainError,
  WordPressDraftNotFoundError,
  WordPressDraftPublishingAdapter,
  WordPressHtmlRenderer,
  WordPressMediaAdapter,
  WordPressMediaUploadUncertainError,
  type WordPressCategoryListResult,
  type WordPressConnectionInput,
  type WordPressDraftVerification,
  type WordPressSeoMetadata,
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
import {
  legacyWordPressContentRevisionId,
  projectWordPressBodyDocument,
  resolveWordPressFeaturedImageAssetId,
  resolveWordPressSeoMetadata,
  wordpressBodyMediaUrls,
  wordpressDraftExecutionRevisionId,
} from "./WordPressDraftProjection";
import {
  InMemoryWordPressPublishingRecordRepository,
  type WordPressPublishingRecordRepository,
} from "./WordPressPublishingRecordRepository";

export type WordPressDraftMediaResult = Readonly<{
  assetId: string;
  blockId: string;
  externalMediaId: string;
  sourceUrl: string;
  alt: string;
  verified: boolean;
}>;

export type WordPressDraftExecutionResult = Readonly<{
  status: "verified" | "failed" | "verification_failed" | "cleanup_required" | "unknown_result" | "in_progress";
  stage: "readiness" | "media" | "draft_create" | "draft_verify" | "complete";
  cleanupRequired: boolean;
  uploadedMedia: readonly WordPressDraftMediaResult[];
  idempotencyKey?: string;
  contentRevisionId?: string;
  reused?: boolean;
  duplicateBlocked?: boolean;
  externalId?: string;
  verification?: WordPressDraftVerification;
  readiness?: WordPressDraftReadiness;
  record?: PublishingExecutionRecord;
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
  /**
   * Explicit user-confirmed retry: only when true will a "verified" record
   * be re-checked against WordPress before being reused. Kept opt-in so an
   * ordinary duplicate submit never performs a live WordPress round trip.
   */
  explicitNewAttempt?: boolean;
}>;

type CategoryReader = Pick<WordPressCategoryAdapter, "listAllCategories">;
type MediaWriter = Pick<WordPressMediaAdapter, "uploadMedia" | "storeAlt" | "readMedia" | "verifyMedia">;
type DraftWriter =
  & Pick<WordPressDraftPublishingAdapter, "prepare" | "createDraft" | "readDraft" | "verifyDraft">
  & Partial<Pick<WordPressDraftPublishingAdapter, "capabilities">>;

export type WordPressDraftApplicationDependencies = Readonly<{
  secrets: Pick<SecretStore, "readSecret">;
  categories?: CategoryReader;
  media?: MediaWriter;
  drafts?: DraftWriter;
  localMedia?: WordPressLocalMediaReader;
  renderer?: WordPressHtmlRenderer;
  maxMediaBytes?: number;
  records?: WordPressPublishingRecordRepository;
  now?: () => Date;
}>;

type PreparedExecution = Readonly<{
  project: UserProject;
  content: UserContent & Readonly<{ document: ContentDocument }>;
  credentials: WordPressConnectionInput;
  categoryResult: WordPressCategoryListResult;
  mediaPlan: readonly WordPressLocalMediaItem[];
  readiness: WordPressDraftReadiness;
  featuredImageAssetId?: string;
  seoMetadata?: WordPressSeoMetadata;
}>;

type WordPressDraftExecutionIdentity = Readonly<{
  workspaceId: string;
  projectId: string;
  contentId: string;
  contentRevisionId: string;
  executionRevisionId: string;
  platformConnectionId: string;
  idempotencyKey: string;
  legacyIdempotencyKey: string;
}>;

type PublishingRecordUpdate = Partial<Omit<PublishingExecutionRecord,
  "id" | "idempotencyKey" | "workspaceId" | "projectId" | "contentId" | "contentRevisionId"
  | "executionRevisionId" | "platformConnectionId" | "platform" | "workflow" | "schemaVersion" | "createdAt" | "updatedAt">>;

export class WordPressDraftApplicationService {
  private readonly categories: CategoryReader;
  private readonly media: MediaWriter;
  private readonly drafts: DraftWriter;
  private readonly records: WordPressPublishingRecordRepository;
  private readonly now: () => Date;

  constructor(private readonly dependencies: WordPressDraftApplicationDependencies) {
    this.categories = dependencies.categories ?? new WordPressCategoryAdapter();
    this.media = dependencies.media ?? new WordPressMediaAdapter();
    this.drafts = dependencies.drafts ?? new WordPressDraftPublishingAdapter(undefined, dependencies.renderer);
    this.records = dependencies.records ?? new InMemoryWordPressPublishingRecordRepository();
    this.now = dependencies.now ?? (() => new Date());
  }

  async readiness(input: WordPressDraftExecutionInput): Promise<WordPressDraftReadiness> {
    return (await this.prepare(input)).readiness;
  }

  async existingRecord(input: WordPressDraftExecutionInput): Promise<PublishingExecutionRecord | undefined> {
    return this.records.findByIdempotencyKey(this.identity(input).idempotencyKey);
  }

  async execute(input: WordPressDraftExecutionInput): Promise<WordPressDraftExecutionResult> {
    let identity: WordPressDraftExecutionIdentity;
    try { identity = this.identity(input); }
    catch {
      return failure("readiness", [], false, "WordPress Draft readiness could not be verified.");
    }
    const existing = await this.records.findByIdempotencyKey(identity.idempotencyKey);
    let supersede: PublishingExecutionRecord | undefined;
    if (existing) {
      if (!input.explicitNewAttempt || existing.status !== "verified") return duplicateResult(existing);
      const liveness = await this.verifyExternalLiveness(input.connection, existing);
      if (liveness === "present") return duplicateResult(existing);
      if (liveness === "unknown") return inconclusiveLivenessResult(existing);
      supersede = existing;
    }
    const legacy = await this.records.findByIdempotencyKey(identity.legacyIdempotencyKey);
    if (legacy) return legacyIdentityBlockedResult(identity, legacy);

    let prepared: PreparedExecution;
    try { prepared = await this.prepare(input); }
    catch {
      return withIdentity(failure("readiness", [], false, "WordPress Draft readiness could not be verified."), identity);
    }
    if (!prepared.readiness.executable || !prepared.readiness.categorySelection.valid) {
      return Object.freeze({
        ...withIdentity(failure("readiness", [], false, "WordPress Draft readiness is blocked."), identity),
        readiness: prepared.readiness,
      });
    }

    let record = this.initialRecord(identity, prepared);
    const claim = supersede
      ? await this.records.replaceStale(supersede, record)
      : await this.records.claim(record);
    if (!claim.claimed) return duplicateResult(claim.record, prepared.readiness);
    record = claim.record;

    try {
      const preflightDocument = projectWordPressBodyDocument(
        prepared.content.document,
        prepared.featuredImageAssetId,
      );
      const preflightArtifact = await this.drafts.prepare({ content: preflightDocument, platform: "wordpress" });
      const preflightIntegrity = evaluateHtmlIntegrity(preflightDocument, preflightArtifact.payload.html);
      if (!preflightIntegrity.passed) {
        return this.persistedFailure(
          record,
          identity,
          "draft_create",
          [],
          "HTML_INTEGRITY_BLOCKED",
          `WordPress Draft HTML integrity blocked: ${preflightIntegrity.issues.map((item) => item.code).join(", ")}.`,
          prepared.readiness,
        );
      }
    } catch {
      return this.persistedFailure(record, identity, "draft_create", [],
        "DRAFT_RENDER_FAILED", "WordPress Draft rendering failed.", prepared.readiness);
    }

    const uploadedMedia: WordPressDraftMediaResult[] = [];
    for (const item of prepared.mediaPlan) {
      try {
        this.authorize("media.upload", input);
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
        record = await this.persist(record, {
          status: "media_uploaded",
          stage: "media",
          uploadedMedia,
        });
      } catch (error) {
        if (error instanceof WordPressMediaUploadUncertainError) {
          record = await this.persist(record, {
            status: "unknown_result",
            stage: "media",
            uploadedMedia,
            cleanupRequired: true,
            safeErrorCode: error.code,
            safeMessage: "WordPress Media upload result is unknown. Check the WordPress Media Library before any new attempt.",
          });
          return resultFromRecord(record, prepared.readiness, undefined, uploadedMedia);
        }
        return this.persistedFailure(record, identity, "media", uploadedMedia,
          "MEDIA_UPLOAD_FAILED", "WordPress Media upload and verification failed.");
      }
    }

    let executionReadiness = prepared.readiness;
    if (prepared.mediaPlan.length) {
      try { executionReadiness = await this.revalidateAfterMedia(input, prepared); }
      catch {
        return this.persistedFailure(record, identity, "readiness", uploadedMedia,
          "CATEGORY_REVALIDATION_FAILED", "WordPress Category revalidation failed.");
      }
      if (!executionReadiness.executable || !executionReadiness.categorySelection.valid) {
        return this.persistedFailure(record, identity, "readiness", uploadedMedia,
          "CATEGORY_REVALIDATION_BLOCKED", "WordPress Category revalidation blocked Draft creation.", executionReadiness);
      }
    }
    const categorySelection = executionReadiness.categorySelection;
    if (!categorySelection.valid) {
      return this.persistedFailure(record, identity, "readiness", uploadedMedia,
        "CATEGORY_REVALIDATION_BLOCKED", "WordPress Category revalidation blocked Draft creation.", executionReadiness);
    }

    let html: string;
    let bodyMediaUrls: readonly string[] = Object.freeze([]);
    let featuredMediaId: string | undefined;
    try {
      const renderedDocument = applyWordPressMediaReplacements(prepared.content.document, uploadedMedia);
      const bodyDocument = projectWordPressBodyDocument(
        renderedDocument,
        prepared.featuredImageAssetId,
      );
      const renderArtifact = await this.drafts.prepare({ content: bodyDocument, platform: "wordpress" });
      html = renderArtifact.payload.html;
      bodyMediaUrls = wordpressBodyMediaUrls(bodyDocument);
      const htmlIntegrity = evaluateHtmlIntegrity(bodyDocument, html);
      if (!htmlIntegrity.passed) {
        return this.persistedFailure(
          record,
          identity,
          "draft_create",
          uploadedMedia,
          "HTML_INTEGRITY_BLOCKED",
          `WordPress Draft HTML integrity blocked: ${htmlIntegrity.issues.map((item) => item.code).join(", ")}.`,
          executionReadiness,
        );
      }
      featuredMediaId = prepared.featuredImageAssetId
        ? uploadedMedia.find((media) =>
          media.assetId === prepared.featuredImageAssetId && media.verified)?.externalMediaId
        : undefined;
    } catch {
      return this.persistedFailure(record, identity, "draft_create", uploadedMedia,
        "DRAFT_RENDER_FAILED", "WordPress Draft rendering failed.", executionReadiness);
    }
    if (prepared.featuredImageAssetId && !featuredMediaId) {
      return this.persistedFailure(record, identity, "media", uploadedMedia,
        "FEATURED_IMAGE_NOT_VERIFIED", "The selected WordPress Featured Image was not verified.");
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
          ...(prepared.seoMetadata ? { seoMetadata: prepared.seoMetadata } : {}),
        },
      });
      externalId = created.externalId;
      record = await this.persist(record, {
        status: "draft_created",
        stage: "draft_create",
        uploadedMedia,
        externalPostId: externalId,
        featuredImageAssigned: featuredMediaId !== undefined,
      });
    } catch (error) {
      if (error instanceof WordPressDraftCreateUncertainError) {
        record = await this.persist(record, {
          status: "unknown_result",
          stage: "draft_create",
          uploadedMedia,
          cleanupRequired: uploadedMedia.length > 0,
          safeErrorCode: error.code,
          safeMessage: "WordPress may have created the Draft. Check WordPress before any new attempt.",
        });
        return resultFromRecord(record, executionReadiness, undefined, uploadedMedia);
      }
      return this.persistedFailure(record, identity, "draft_create", uploadedMedia,
        "DRAFT_CREATE_FAILED", "WordPress Draft creation failed.", executionReadiness);
    }

    try {
      this.authorize("draft.verify", input);
      const draft = await this.drafts.readDraft({ ...prepared.credentials, externalId });
      const verification = this.drafts.verifyDraft(draft, {
        externalId,
        title: prepared.content.document.title,
        content: html,
        categoryIds: categorySelection.categoryIds,
        mediaUrls: bodyMediaUrls,
        ...(featuredMediaId ? { featuredMediaId } : {}),
        ...(prepared.seoMetadata ? { seoMetadata: prepared.seoMetadata } : {}),
      });
      if (!verification.verified) {
        record = await this.persist(record, {
          status: "verification_failed",
          stage: "draft_verify",
          uploadedMedia,
          externalPostId: externalId,
          cleanupRequired: uploadedMedia.length > 0,
          verificationChecks: verification.checks,
          safeErrorCode: "DRAFT_VERIFICATION_MISMATCH",
          safeMessage: "WordPress Draft external re-read verification failed.",
        });
        return resultFromRecord(record, executionReadiness, verification, uploadedMedia);
      }
      record = await this.persist(record, {
        status: "verified",
        stage: "complete",
        uploadedMedia,
        externalPostId: externalId,
        verified: true,
        cleanupRequired: false,
        verificationChecks: verification.checks,
      });
      return resultFromRecord(record, executionReadiness, verification, uploadedMedia);
    } catch {
      record = await this.persist(record, {
        status: "unknown_result",
        stage: "draft_verify",
        uploadedMedia,
        externalPostId: externalId,
        cleanupRequired: uploadedMedia.length > 0,
        safeErrorCode: "DRAFT_VERIFICATION_UNKNOWN",
        safeMessage: "The WordPress Draft exists, but its external verification result is unknown. Check WordPress before any new attempt.",
      });
      return resultFromRecord(record, executionReadiness, undefined, uploadedMedia);
    }
  }

  private identity(input: WordPressDraftExecutionInput): WordPressDraftExecutionIdentity {
    const workspaceId = input.data.workspace?.id;
    const project = input.data.projects.find((item) => item.id === input.projectId && item.workspaceId === workspaceId);
    const content = input.data.contents.find((item) => item.id === input.contentId
      && item.projectId === input.projectId
      && item.workspaceId === workspaceId);
    if (!workspaceId || !project || !content?.document
      || input.connection.workspaceId !== workspaceId || input.connection.platform !== "wordpress") {
      throw new Error("WordPress publishing identity could not be verified.");
    }
    const revisionId = contentRevisionId(content.document);
    const legacyRevisionId = legacyWordPressContentRevisionId(content.document);
    const canonicalContent = content as UserContent & Readonly<{ document: ContentDocument }>;
    const executionRevisionId = wordpressDraftExecutionRevisionId(
      canonicalContent,
      input.connection.id,
      input.slug,
    );
    const legacyIdempotencyKey = createDraftCreateIdempotencyKey({
      workspaceId,
      projectId: project.id,
      contentId: content.id,
      contentRevisionId: legacyRevisionId,
      platformConnectionId: input.connection.id,
    });
    const idempotencyKey = createDraftCreateIdempotencyKey({
      workspaceId,
      projectId: project.id,
      contentId: content.id,
      contentRevisionId: revisionId,
      executionRevisionId,
      platformConnectionId: input.connection.id,
    });
    return Object.freeze({
      workspaceId,
      projectId: project.id,
      contentId: content.id,
      contentRevisionId: revisionId,
      executionRevisionId,
      platformConnectionId: input.connection.id,
      idempotencyKey,
      legacyIdempotencyKey,
    });
  }

  private initialRecord(identity: WordPressDraftExecutionIdentity, prepared: PreparedExecution): PublishingExecutionRecord {
    const now = this.now().toISOString();
    const selection = prepared.readiness.categorySelection;
    return Object.freeze({
      schemaVersion: 1,
      id: identity.idempotencyKey,
      idempotencyKey: identity.idempotencyKey,
      workspaceId: identity.workspaceId,
      projectId: identity.projectId,
      contentId: identity.contentId,
      contentRevisionId: identity.contentRevisionId,
      executionRevisionId: identity.executionRevisionId,
      platformConnectionId: identity.platformConnectionId,
      platform: "wordpress",
      workflow: "draft.create",
      status: "preparing",
      stage: "readiness",
      verified: false,
      uploadedMedia: Object.freeze([]),
      cleanupRequired: false,
      verificationChecks: Object.freeze([]),
      categoryIds: selection.valid ? selection.categoryIds : Object.freeze([]),
      categoryNames: selection.valid ? selection.categoryNames : Object.freeze([]),
      localImageCount: prepared.readiness.localImageCount,
      featuredImageAssigned: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  private async persist(
    current: PublishingExecutionRecord,
    update: PublishingRecordUpdate,
  ): Promise<PublishingExecutionRecord> {
    return this.records.save(Object.freeze({
      ...current,
      ...update,
      uploadedMedia: Object.freeze([...(update.uploadedMedia ?? current.uploadedMedia)].map((item) => Object.freeze({
        assetId: item.assetId,
        externalMediaId: item.externalMediaId,
      }))),
      verificationChecks: Object.freeze([...(update.verificationChecks ?? current.verificationChecks)]),
      updatedAt: this.now().toISOString(),
    }));
  }

  private async persistedFailure(
    current: PublishingExecutionRecord,
    identity: WordPressDraftExecutionIdentity,
    stage: WordPressDraftExecutionResult["stage"],
    uploadedMedia: readonly WordPressDraftMediaResult[],
    safeErrorCode: string,
    safeMessage: string,
    readiness?: WordPressDraftReadiness,
  ): Promise<WordPressDraftExecutionResult> {
    const cleanupRequired = uploadedMedia.length > 0;
    const status: PublishingExecutionStatus = cleanupRequired ? "cleanup_required" : "failed";
    const saved = await this.persist(current, {
      status,
      stage,
      uploadedMedia,
      cleanupRequired,
      safeErrorCode,
      safeMessage,
    });
    return Object.freeze({
      ...withIdentity(failure(stage, uploadedMedia, cleanupRequired, safeMessage), identity),
      status,
      record: saved,
      ...(readiness ? { readiness } : {}),
    });
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
    const explicitFeaturedImageAssetId = preparation?.publishingAccountId === input.connection.id
      ? preparation.featuredImageAssetId
      : undefined;
    const featuredImageAssetId = resolveWordPressFeaturedImageAssetId(
      content.document,
      explicitFeaturedImageAssetId,
    );
    const canonicalContent = content as UserContent & Readonly<{ document: ContentDocument }>;
    const seoMetadata = resolveWordPressSeoMetadata(canonicalContent);
    if (seoMetadata) {
      if (!this.drafts.capabilities) {
        throw new Error("WordPress Draft SEO capability verification is unavailable.");
      }
      const capabilities = await this.drafts.capabilities(credentials);
      if (!capabilities.yoastSeoMetadata) {
        throw new Error(
          `WordPress does not expose the required Yoast SEO metadata fields through REST: ${capabilities.writableMetaKeys.join(", ") || "none"}.`,
        );
      }
    }
    const mediaPlan = await prepareWordPressLocalMedia({
      document: content.document,
      mediaAssets: input.data.mediaMetadata ?? [],
      workspaceId: input.data.workspace!.id,
      projectId: project.id,
      contentId: content.id,
      ...(featuredImageAssetId ? { featuredImageAssetId } : {}),
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
      ...(featuredImageAssetId ? { featuredImageAssetId } : {}),
    });
    return Object.freeze({
      project,
      content: canonicalContent,
      credentials,
      categoryResult,
      mediaPlan,
      readiness,
      ...(featuredImageAssetId ? { featuredImageAssetId } : {}),
      ...(seoMetadata ? { seoMetadata } : {}),
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
      ...(prepared.featuredImageAssetId ? { featuredImageAssetId: prepared.featuredImageAssetId } : {}),
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

  private async verifyExternalLiveness(
    connection: PlatformConnection,
    record: PublishingExecutionRecord,
  ): Promise<"present" | "removed" | "unknown"> {
    if (!record.externalPostId) return "unknown";
    let credentials: WordPressConnectionInput;
    try { credentials = await this.credentials(connection); }
    catch { return "unknown"; }
    try {
      await this.drafts.readDraft({ ...credentials, externalId: record.externalPostId });
      return "present";
    } catch (error) {
      return error instanceof WordPressDraftNotFoundError ? "removed" : "unknown";
    }
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

function withIdentity(
  result: WordPressDraftExecutionResult,
  identity: WordPressDraftExecutionIdentity,
): WordPressDraftExecutionResult {
  return Object.freeze({
    ...result,
    idempotencyKey: identity.idempotencyKey,
    contentRevisionId: identity.contentRevisionId,
  });
}

function legacyIdentityBlockedResult(
  identity: WordPressDraftExecutionIdentity,
  record: PublishingExecutionRecord,
): WordPressDraftExecutionResult {
  return Object.freeze({
    status: "failed",
    stage: "readiness",
    cleanupRequired: record.cleanupRequired,
    uploadedMedia: Object.freeze([]),
    idempotencyKey: identity.idempotencyKey,
    contentRevisionId: identity.contentRevisionId,
    reused: false,
    duplicateBlocked: true,
    error: "A legacy WordPress Draft record exists for this canonical Revision. Review the existing WordPress Draft before an explicit new-attempt workflow.",
  });
}

function duplicateResult(
  record: PublishingExecutionRecord,
  readiness?: WordPressDraftReadiness,
): WordPressDraftExecutionResult {
  const verification = verificationFromRecord(record);
  if (record.status === "verified") {
    return Object.freeze({
      ...resultFromRecord(record, readiness, verification),
      reused: true,
      duplicateBlocked: false,
    });
  }
  const inProgress = record.status === "preparing" || record.status === "media_uploaded" || record.status === "draft_created";
  return Object.freeze({
    ...resultFromRecord(record, readiness, verification),
    status: inProgress ? "in_progress" : record.status,
    reused: false,
    duplicateBlocked: true,
    error: inProgress
      ? "The same WordPress Draft operation is already in progress."
      : duplicateBlockMessage(record.status),
  });
}

function inconclusiveLivenessResult(record: PublishingExecutionRecord): WordPressDraftExecutionResult {
  return Object.freeze({
    ...resultFromRecord(record, undefined, verificationFromRecord(record)),
    reused: false,
    duplicateBlocked: true,
    error: "WordPress could not confirm whether the previous Draft still exists. Check WordPress connectivity, then retry.",
  });
}

function verificationFromRecord(record: PublishingExecutionRecord): WordPressDraftVerification | undefined {
  if (!record.verificationChecks.length) return undefined;
  return Object.freeze({
    verified: record.verified,
    checks: Object.freeze(record.verificationChecks.map((check) => Object.freeze({ ...check }))),
  });
}

function resultFromRecord(
  record: PublishingExecutionRecord,
  readiness?: WordPressDraftReadiness,
  verification?: WordPressDraftVerification,
  uploadedMedia: readonly WordPressDraftMediaResult[] = [],
): WordPressDraftExecutionResult {
  const status = record.status === "preparing" || record.status === "media_uploaded" || record.status === "draft_created"
    ? "in_progress"
    : record.status;
  return Object.freeze({
    status,
    stage: resultStage(record.stage),
    cleanupRequired: record.cleanupRequired,
    uploadedMedia: Object.freeze([...uploadedMedia]),
    idempotencyKey: record.idempotencyKey,
    contentRevisionId: record.contentRevisionId,
    ...(record.externalPostId ? { externalId: record.externalPostId } : {}),
    ...(verification ? { verification } : {}),
    ...(readiness ? { readiness } : {}),
    record,
    ...(record.safeMessage ? { error: record.safeMessage } : {}),
  });
}

function resultStage(value: string): WordPressDraftExecutionResult["stage"] {
  return ["readiness", "media", "draft_create", "draft_verify", "complete"].includes(value)
    ? value as WordPressDraftExecutionResult["stage"]
    : "readiness";
}

function duplicateBlockMessage(status: PublishingExecutionStatus): string {
  if (status === "unknown_result") return "The previous WordPress result is unknown. Check WordPress before any new attempt.";
  if (status === "verification_failed") return "The existing WordPress Draft failed external verification. A new Draft was not created.";
  if (status === "cleanup_required") return "The previous WordPress operation requires manual cleanup before any new attempt.";
  return "The previous WordPress operation failed. An explicit new-attempt workflow is required before retrying.";
}
