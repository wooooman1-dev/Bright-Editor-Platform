"use client";

import { useEffect, useMemo, useState } from "react";

import type { SiteApprovalReadinessSnapshot } from "../../core/approval";
import type { ContentDocument } from "../../core/content";
import type { QualityReport } from "../../core/quality";
import {
  isWordPressManualSiteReviewKey,
  wordpressManualSiteReviewKeys,
} from "../../apps/wordpress/approval/WordPressManualSiteReview";
import type { UserData } from "./user-data";

type ManualCheck = SiteApprovalReadinessSnapshot["checks"][number] & Readonly<{
  reviewedAt?: string;
}>;

const labels: Readonly<Record<(typeof wordpressManualSiteReviewKeys)[number], string>> = Object.freeze({
  theme_plugin_review: "테마·플러그인 검토",
  mobile_visual_review: "모바일 실제 화면 검토",
  performance_review: "성능 검토",
  copyright_review: "저작권 검토",
  site_quality_consistency: "사이트 전체 품질 일관성",
  search_console_review: "Search Console 검토",
});

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
}>) {
  const [snapshot, setSnapshot] = useState<SiteApprovalReadinessSnapshot>();
  const [savingKey, setSavingKey] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/studio", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<{ data?: UserData }>;
      })
      .then((result) => {
        if (!active) return;
        const content = result.data?.contents.find((item) =>
          item.id === props.contentId);
        setSnapshot(content?.document?.metadata?.siteApprovalReadiness);
      })
      .catch((error) => {
        if (active) {
          setMessage(`수동 검토 상태를 불러오지 못했습니다: ${
            error instanceof Error ? error.message : "알 수 없는 오류"
          }`);
        }
      });
    return () => {
      active = false;
    };
  }, [props.contentId, props.refreshKey]);

  const checks = useMemo(
    () => (snapshot?.checks ?? [])
      .filter((check): check is ManualCheck =>
        isWordPressManualSiteReviewKey(check.key)),
    [snapshot],
  );

  if (!checks.length) return null;

  async function update(check: ManualCheck, completed: boolean) {
    if (!isWordPressManualSiteReviewKey(check.key) || savingKey) return;
    setSavingKey(check.key);
    setMessage(`${labels[check.key]} 상태를 저장하고 있습니다.`);
    try {
      const response = await fetch("/api/approval/readiness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_wordpress_manual_site_review",
          workspaceId: props.workspaceId,
          contentId: props.contentId,
          key: check.key,
          completed,
        }),
      });
      const result = await response.json() as {
        data?: UserData;
        document?: ContentDocument;
        quality?: QualityReport;
        siteReadiness?: SiteApprovalReadinessSnapshot;
        error?: string;
      };
      if (!response.ok || !result.data || !result.document || !result.quality
        || !result.siteReadiness) {
        throw new Error(result.error ?? "수동 검토 상태를 저장하지 못했습니다.");
      }
      setSnapshot(result.siteReadiness);
      await props.onCompleted({
        data: result.data,
        document: result.document,
        quality: result.quality,
      });
      setMessage(`${labels[check.key]} 상태를 저장했습니다.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "수동 검토 상태를 저장하지 못했습니다.",
      );
    } finally {
      setSavingKey("");
    }
  }

  return <section className="mt-4 w-full rounded-xl border border-black/6 bg-[#fafafa] p-4">
    <h3 className="text-sm font-semibold">WordPress 수동 사이트 검토</h3>
    <p className="mt-1 text-xs leading-5 text-[#77777f]">
      자동으로 판정할 수 없는 항목만 실제 화면과 계정 상태를 확인한 뒤 완료 처리합니다.
      홈페이지 noindex 같은 설정 오류는 수동 완료가 아니라 실제 설정 수정 후 재검사해야 합니다.
    </p>
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {checks.map((check) => {
        const key = check.key as (typeof wordpressManualSiteReviewKeys)[number];
        return <label className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${
          check.passed ? "bg-emerald-50/70" : "bg-white"
        }`} key={check.key}>
          <input
            checked={check.passed}
            className="mt-1"
            disabled={props.disabled || Boolean(savingKey)}
            onChange={(event) => void update(check, event.target.checked)}
            type="checkbox"
          />
          <span>
            <strong>{labels[key]}</strong>
            <span className="mt-1 block text-xs leading-5 text-[#66666f]">
              {check.message}
            </span>
          </span>
        </label>;
      })}
    </div>
    {message ? <p aria-live="polite" className="mt-3 text-xs text-[#66666f]">{message}</p> : null}
  </section>;
}
