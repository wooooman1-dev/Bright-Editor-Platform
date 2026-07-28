"use client";

import { useMemo, useState } from "react";

import type {
  ApprovalPolicyProfileId,
  ContentPurpose,
} from "../../core/approval";
import {
  resolveProjectApprovalSettings,
  updateProjectApprovalSettings,
} from "../application/approval/ApprovalContentPolicy";
import {
  resolveProjectStrategy,
  type UserData,
  type UserProject,
} from "./user-data";

const profileLabels: Readonly<Record<ApprovalPolicyProfileId, string>> = Object.freeze({
  wordpress_life_economy_v1: "WordPress · 생활경제",
  tistory_vivarain_art_v1: "Tistory · 비바레인 미술",
});

export function ProjectApprovalSettingsCard({
  data,
  onPersist,
  project,
}: {
  data: UserData;
  onPersist: (data: UserData) => Promise<void>;
  project: UserProject;
}) {
  const persisted = resolveProjectApprovalSettings(project);
  const defaultProfileId = defaultApprovalProfileId(project);
  const [contentPurpose, setContentPurpose] = useState<ContentPurpose>(persisted.contentPurpose);
  const [approvalProfileId, setApprovalProfileId] = useState<ApprovalPolicyProfileId>(
    persisted.approvalProfileId ?? defaultProfileId,
  );
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const profileOptions = useMemo(() => compatibleApprovalProfiles(project, persisted.approvalProfileId), [project, persisted.approvalProfileId]);

  const save = async () => {
    setSaveState("saving");
    try {
      const next = updateProjectApprovalSettings(
        data,
        project.id,
        contentPurpose === "adsense_approval"
          ? { contentPurpose, approvalProfileId }
          : { contentPurpose: "standard" },
        new Date().toISOString(),
      );
      await onPersist(next);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  };

  const unchanged = contentPurpose === persisted.contentPurpose
    && (contentPurpose === "standard" || approvalProfileId === persisted.approvalProfileId);

  return (
    <section className="mt-6 rounded-[20px] border border-black/6 bg-white p-5" aria-labelledby="project-content-purpose-title">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-semibold" id="project-content-purpose-title">콘텐츠 목적</h2>
          <p className="mt-1 text-sm leading-6 text-[#77777f]">새로 시작하는 콘텐츠의 Planning, Generation, Quality Review 기준을 선택합니다.</p>
        </div>
        <span className="w-fit rounded-full bg-[#fff0f0] px-3 py-1 text-xs font-semibold text-[#d94848]">
          {persisted.contentPurpose === "adsense_approval" ? "승인 준비 모드" : "일반 모드"}
        </span>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold" htmlFor="project-content-purpose">
          콘텐츠 목적
          <select
            className="mt-2 w-full rounded-xl border border-black/8 bg-white px-3 py-3 font-normal outline-none focus:border-[#ff6b6b]/60 focus:ring-4 focus:ring-[#ff6b6b]/10"
            id="project-content-purpose"
            onChange={(event) => {
              setContentPurpose(event.target.value === "adsense_approval" ? "adsense_approval" : "standard");
              setSaveState("idle");
            }}
            value={contentPurpose}
          >
            <option value="standard">일반 콘텐츠</option>
            <option value="adsense_approval">애드센스 승인 준비</option>
          </select>
        </label>

        {contentPurpose === "adsense_approval" ? (
          <label className="text-sm font-semibold" htmlFor="project-approval-profile">
            승인 정책 프로필
            <select
              className="mt-2 w-full rounded-xl border border-black/8 bg-white px-3 py-3 font-normal outline-none focus:border-[#ff6b6b]/60 focus:ring-4 focus:ring-[#ff6b6b]/10"
              id="project-approval-profile"
              onChange={(event) => {
                setApprovalProfileId(event.target.value as ApprovalPolicyProfileId);
                setSaveState("idle");
              }}
              value={approvalProfileId}
            >
              {profileOptions.map((profileId) => (
                <option key={profileId} value={profileId}>{profileLabels[profileId]}</option>
              ))}
            </select>
          </label>
        ) : (
          <div className="rounded-xl bg-[#f8f8fa] px-4 py-3 text-sm leading-6 text-[#77777f]">
            기존 일반 생성·품질 정책을 사용합니다.
          </div>
        )}
      </div>

      {contentPurpose === "adsense_approval" ? (
        <div className="mt-4 rounded-xl border border-[#ffd4d4] bg-[#fff8f8] px-4 py-3 text-sm leading-6 text-[#6f4b4b]">
          승인 가능성을 보장하지 않습니다. 선택한 사이트 프로필의 출처·사실성·중복·얇은 콘텐츠 기준을 새 콘텐츠에 적용합니다.
        </div>
      ) : null}

      <p className="mt-4 text-xs leading-5 text-[#8b8b93]">이 설정은 저장 이후 새로 시작하는 콘텐츠에만 snapshot으로 고정됩니다. 기존 콘텐츠의 정책은 변경하지 않습니다.</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          className="rounded-xl bg-[#19191b] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
          disabled={saveState === "saving" || unchanged}
          onClick={() => void save()}
          type="button"
        >
          {saveState === "saving" ? "저장 중" : "콘텐츠 목적 저장"}
        </button>
        {saveState === "saved" ? <p className="text-sm font-medium text-emerald-700">콘텐츠 목적을 저장했습니다.</p> : null}
        {saveState === "error" ? <p className="text-sm font-medium text-red-700">콘텐츠 목적을 저장하지 못했습니다.</p> : null}
      </div>
    </section>
  );
}

export function defaultApprovalProfileId(project: UserProject): ApprovalPolicyProfileId {
  return resolveProjectStrategy(project).defaultPlatform === "wordpress"
    ? "wordpress_life_economy_v1"
    : "tistory_vivarain_art_v1";
}

export function compatibleApprovalProfiles(
  project: UserProject,
  persistedProfileId?: ApprovalPolicyProfileId,
): readonly ApprovalPolicyProfileId[] {
  const defaultProfileId = defaultApprovalProfileId(project);
  return persistedProfileId && persistedProfileId !== defaultProfileId
    ? Object.freeze([defaultProfileId, persistedProfileId])
    : Object.freeze([defaultProfileId]);
}
