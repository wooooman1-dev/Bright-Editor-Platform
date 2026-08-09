import {
  approvalPolicyPromptContext,
  isApprovalPolicyProfileId,
  normalizeContentPurpose,
  resolveApprovalPolicySnapshot,
  type ApprovalPolicyProfileId,
  type ApprovalPolicySnapshot,
  type ContentPurpose,
} from "../../../core/approval";
import {
  resolveProjectStrategy,
  type ProjectContentStrategy,
  type UserContent,
  type UserData,
  type UserProject,
} from "../../user-flow/user-data";

export type ProjectApprovalSettings = Readonly<{
  contentPurpose: ContentPurpose;
  approvalProfileId?: ApprovalPolicyProfileId;
}>;

export type ApprovalAwareProjectStrategy = ProjectContentStrategy & Readonly<{
  defaultContentPurpose?: ContentPurpose;
  approvalProfileId?: ApprovalPolicyProfileId;
}>;

export type ApprovalAwareContent = UserContent & Readonly<{
  contentPurpose?: ContentPurpose;
  approvalPolicyId?: ApprovalPolicySnapshot["policyId"];
  approvalPolicyVersion?: ApprovalPolicySnapshot["policyVersion"];
  approvalProfileId?: ApprovalPolicyProfileId;
  approvalProfileVersion?: ApprovalPolicySnapshot["profileVersion"];
}>;

export function resolveProjectApprovalSettings(project: UserProject): ProjectApprovalSettings {
  const strategy = resolveProjectStrategy(project) as ApprovalAwareProjectStrategy;
  const contentPurpose = normalizeContentPurpose(strategy.defaultContentPurpose);
  if (contentPurpose !== "adsense_approval") return Object.freeze({ contentPurpose: "standard" });
  return Object.freeze({
    contentPurpose,
    ...(isApprovalPolicyProfileId(strategy.approvalProfileId)
      ? { approvalProfileId: strategy.approvalProfileId }
      : {}),
  });
}

export function updateProjectApprovalSettings(
  data: UserData,
  projectId: string,
  settings: ProjectApprovalSettings,
  now: string,
): UserData {
  const project = data.projects.find((item) => item.id === projectId);
  if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");
  const strategy = resolveProjectStrategy(project) as ApprovalAwareProjectStrategy;
  const contentPurpose = normalizeContentPurpose(settings.contentPurpose);
  if (contentPurpose === "adsense_approval" && !isApprovalPolicyProfileId(settings.approvalProfileId)) {
    throw new Error("승인 준비 모드에는 승인 정책 프로필을 선택해 주세요.");
  }
  const nextStrategy: ApprovalAwareProjectStrategy = {
    ...strategy,
    defaultContentPurpose: contentPurpose,
    ...(contentPurpose === "adsense_approval"
      ? { approvalProfileId: settings.approvalProfileId }
      : { approvalProfileId: undefined }),
  };
  return {
    ...data,
    projects: data.projects.map((item) => item.id === projectId
      ? { ...item, strategy: nextStrategy as ProjectContentStrategy, updatedAt: now }
      : item),
  };
}

export function snapshotApprovalPolicyForPlanning(
  data: UserData,
  projectId: string,
  contentId: string,
): UserData {
  const project = data.projects.find((item) => item.id === projectId);
  if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");
  const settings = resolveProjectApprovalSettings(project);
  const content = data.contents.find((item) => item.id === contentId && item.projectId === projectId);
  if (!content) throw new Error("Planning Content를 찾을 수 없습니다.");
  if (settings.contentPurpose === "standard") {
    return replaceContent(data, contentId, {
      contentPurpose: "standard",
      approvalPolicyId: undefined,
      approvalPolicyVersion: undefined,
      approvalProfileId: undefined,
      approvalProfileVersion: undefined,
    });
  }
  const snapshot = resolveApprovalPolicySnapshot(settings.contentPurpose, settings.approvalProfileId);
  if (!snapshot) throw new Error("승인 준비 정책 snapshot을 만들지 못했습니다.");
  return replaceContent(data, contentId, {
    contentPurpose: snapshot.contentPurpose,
    approvalPolicyId: snapshot.policyId,
    approvalPolicyVersion: snapshot.policyVersion,
    approvalProfileId: snapshot.profileId,
    approvalProfileVersion: snapshot.profileVersion,
  });
}

export function resolveContentApprovalSnapshot(content: UserContent): ApprovalPolicySnapshot | undefined {
  const aware = content as ApprovalAwareContent;
  if (normalizeContentPurpose(aware.contentPurpose) !== "adsense_approval") return undefined;
  const snapshot = resolveApprovalPolicySnapshot(aware.contentPurpose, aware.approvalProfileId);
  if (!snapshot) return undefined;
  if (
    aware.approvalPolicyId !== snapshot.policyId
    || aware.approvalPolicyVersion !== snapshot.policyVersion
    || aware.approvalProfileVersion !== snapshot.profileVersion
  ) {
    throw new Error("저장된 승인 준비 정책 snapshot이 현재 Content와 일치하지 않습니다.");
  }
  return snapshot;
}

export function projectApprovalPromptContext(project: UserProject): string | undefined {
  const settings = resolveProjectApprovalSettings(project);
  if (settings.contentPurpose !== "adsense_approval") return undefined;
  const snapshot = resolveApprovalPolicySnapshot(settings.contentPurpose, settings.approvalProfileId);
  return snapshot ? approvalPolicyPromptContext(snapshot) : undefined;
}

export function contentApprovalPromptContext(content: UserContent): string | undefined {
  const snapshot = resolveContentApprovalSnapshot(content);
  return snapshot ? approvalPolicyPromptContext(snapshot) : undefined;
}

export function contentBoundEditorialContext(
  projectContext: Readonly<Record<string, unknown>>,
  content: UserContent,
): string {
  const stableProjectContext = Object.freeze(Object.fromEntries(
    Object.entries(projectContext).filter(([key]) => key !== "approvalPolicy"),
  ));
  const approvalPolicy = contentApprovalPromptContext(content);
  const sourceRequest = content.opportunity?.sourceRequest
    ?? content.planningWorkflow?.request
    ?? content.naturalLanguageRequest
    ?? "";
  const selectionMode = content.opportunity?.selectionMode
    ?? content.planning?.selectionMode
    ?? content.planningWorkflow?.selectionMode
    ?? "automatic";
  return JSON.stringify({
    projectStrategy: {
      ...stableProjectContext,
      ...(approvalPolicy ? { approvalPolicy } : {}),
    },
    ownedIdentityPolicy: {
      sourceRequest,
      selectionMode,
      editorialRule: "Project and brand identity labels are metadata only. Do not use them as keywords or in the title, body, metadata, image ALT or prompt, tags, or CTA labels unless selectionMode is userSpecified and sourceRequest explicitly names that identity as the editorial subject.",
    },
  });
}

function replaceContent(
  data: UserData,
  contentId: string,
  update: Partial<ApprovalAwareContent>,
): UserData {
  let found = false;
  const contents = data.contents.map((item) => {
    if (item.id !== contentId) return item;
    found = true;
    return { ...(item as ApprovalAwareContent), ...update } as UserContent;
  });
  if (!found) throw new Error("콘텐츠를 찾을 수 없습니다.");
  return { ...data, contents };
}
