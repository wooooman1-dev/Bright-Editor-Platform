import type { Metadata } from "next";

import { createTistoryUrls, type TistoryUrls } from "../../apps/tistory";

export const metadata: Metadata = {
  title: "개발 대시보드 | Bright Studio",
  robots: { follow: false, index: false },
};

const progressItems = [
  { label: "완료 기능", value: "8개", detail: "기반 기능 구현 완료" },
  { label: "현재 마일스톤", value: "v0.1", detail: "티스토리 초안 기반" },
  { label: "다음 기능", value: "초안 저장", detail: "에디터 자동화 준비" },
] as const;

const platforms = [
  { name: "티스토리", status: "연결됨", active: true, initial: "T" },
  { name: "워드프레스", status: "준비 중", active: false, initial: "W" },
  { name: "유튜브", status: "예정", active: false, initial: "Y" },
  { name: "네이버 카페", status: "예정", active: false, initial: "N" },
] as const;

const coreBrowserModules = [
  "BrowserManager",
  "BrowserSessionManager",
  "BrowserContextManager",
] as const;

type DevDashboardProps = {
  searchParams: Promise<{ blogName?: string | string[] }>;
};

export default async function DevDashboard({ searchParams }: DevDashboardProps) {
  const params = await searchParams;
  const submittedBlogName = Array.isArray(params.blogName)
    ? (params.blogName[0] ?? "")
    : params.blogName;
  const urlResult = buildTistoryUrlResult(submittedBlogName);

  return (
    <main className="min-h-screen bg-[#f8f8fa] text-[#19191b]">
      <div className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10">
        <header className="flex flex-col gap-6 border-b border-black/6 pb-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <div aria-hidden="true" className="flex size-11 items-center justify-center rounded-[14px] bg-[#ff6b6b] text-lg font-bold text-white shadow-[0_8px_24px_rgba(255,107,107,0.24)]">
              B
            </div>
            <div>
              <p className="text-xl font-semibold tracking-[-0.03em]">Bright Studio</p>
              <p className="mt-0.5 text-sm text-[#77777f]">AI 콘텐츠 자동화 플랫폼</p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="rounded-full border border-[#ff6b6b]/20 bg-[#fff0f0] px-3 py-1.5 text-xs font-semibold text-[#d94848]">Development Mode</span>
            <span className="rounded-full border border-black/8 bg-white px-3 py-1.5 text-xs font-semibold text-[#65656d] shadow-sm">v0.1</span>
          </div>
        </header>

        <div className="space-y-6 py-8 sm:py-10">
          <section aria-labelledby="progress-title" className="overflow-hidden rounded-[24px] border border-black/6 bg-white p-6 shadow-[0_16px_50px_rgba(24,24,27,0.06)] sm:p-8">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold tracking-[0.14em] text-[#ff6b6b] uppercase">Feature #8</p>
                <h1 id="progress-title" className="mt-2 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">개발 현황</h1>
              </div>
              <p className="text-sm text-[#77777f]">핵심 기반 구축이 완료되었습니다</p>
            </div>
            <div className="mt-7 grid gap-6 sm:grid-cols-3">
              {progressItems.map((item) => (
                <article className="border-black/6 sm:border-r sm:last:border-r-0" key={item.label}>
                  <p className="text-sm text-[#77777f]">{item.label}</p>
                  <p className="mt-2 text-xl font-semibold tracking-[-0.025em]">{item.value}</p>
                  <p className="mt-1 text-xs text-[#a0a0a8]">{item.detail}</p>
                </article>
              ))}
            </div>
            <div className="mt-7">
              <div className="mb-2 flex items-center justify-between text-xs font-medium">
                <span className="text-[#77777f]">마일스톤 진행률</span>
                <span className="text-[#d94848]">80%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#f0f0f2]">
                <div className="h-full w-4/5 rounded-full bg-[#ff6b6b]" />
              </div>
            </div>
          </section>

          <section aria-labelledby="platform-title">
            <SectionHeading description="콘텐츠를 연결할 채널을 한눈에 확인하세요" title="플랫폼" id="platform-title" />
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {platforms.map((platform) => (
                <article className="flex items-center gap-3 rounded-[20px] border border-black/6 bg-white p-4 shadow-[0_8px_30px_rgba(24,24,27,0.04)]" key={platform.name}>
                  <span aria-hidden="true" className={`flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${platform.active ? "bg-[#fff0f0] text-[#e85656]" : "bg-[#f3f3f5] text-[#8b8b93]"}`}>{platform.initial}</span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold">{platform.name}</h3>
                    <span className={`mt-1 inline-flex items-center gap-1.5 text-xs ${platform.active ? "text-[#d94848]" : "text-[#92929a]"}`}>
                      <span className={`size-1.5 rounded-full ${platform.active ? "bg-[#ff6b6b]" : "bg-[#c7c7cc]"}`} />
                      {platform.status}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.4fr]">
            <section aria-labelledby="core-title" className="rounded-[24px] border border-black/6 bg-white p-6 shadow-[0_10px_40px_rgba(24,24,27,0.045)] sm:p-7">
              <SectionHeading description="브라우저 자동화 기반" title="Core Engine" id="core-title" />
              <ul className="mt-6 space-y-3">
                {coreBrowserModules.map((module) => (
                  <li className="flex items-center justify-between gap-3 rounded-2xl bg-[#f8f8fa] px-4 py-3.5" key={module}>
                    <span className="truncate text-sm font-medium">{module}</span>
                    <StatusBadge>완료</StatusBadge>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="url-builder-title" className="rounded-[24px] border border-black/6 bg-white p-6 shadow-[0_10px_40px_rgba(24,24,27,0.045)] sm:p-7">
              <SectionHeading description="블로그 주소를 입력해 주요 관리 URL을 확인하세요" title="티스토리 URL 확인" id="url-builder-title" />
              <form action="/dev" className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end" method="get">
                <label className="flex-1">
                  <span className="mb-2 block text-sm font-medium">블로그 이름</span>
                  <div className="flex overflow-hidden rounded-xl border border-black/10 bg-[#fafafa] transition focus-within:border-[#ff6b6b]/60 focus-within:ring-4 focus-within:ring-[#ff6b6b]/10">
                    <input aria-describedby="blog-domain" className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm outline-none placeholder:text-[#b4b4bb]" defaultValue={submittedBlogName} name="blogName" placeholder="bright-studio" type="text" />
                    <span id="blog-domain" className="flex items-center border-l border-black/6 bg-white px-3 text-xs text-[#92929a]">.tistory.com</span>
                  </div>
                </label>
                <button className="rounded-xl bg-[#ff6b6b] px-6 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(255,107,107,0.22)] transition hover:bg-[#f45d5d] focus:ring-4 focus:ring-[#ff6b6b]/20 focus:outline-none" type="submit">확인</button>
              </form>
              <output aria-live="polite" className="mt-5 block">
                {urlResult.error ? <p className="rounded-xl border border-[#ff6b6b]/20 bg-[#fff5f5] px-4 py-3 text-sm text-[#c94747]">{urlResult.error}</p> : null}
                {urlResult.urls ? <UrlResults urls={urlResult.urls} /> : null}
              </output>
            </section>
          </div>
        </div>

        <footer className="flex flex-col gap-2 border-t border-black/6 py-6 text-xs text-[#92929a] sm:flex-row sm:items-center sm:justify-between">
          <span className="font-medium text-[#65656d]">Bright Studio</span>
          <span>Development Build</span>
        </footer>
      </div>
    </main>
  );
}

function buildTistoryUrlResult(blogName: string | undefined): { error?: string; urls?: TistoryUrls } {
  if (blogName === undefined) return {};
  try {
    return { urls: createTistoryUrls(blogName) };
  } catch {
    return { error: "올바른 티스토리 블로그 이름을 입력해 주세요." };
  }
}

function SectionHeading({ description, id, title }: { description: string; id: string; title: string }) {
  return (
    <div>
      <h2 id={id} className="text-lg font-semibold tracking-[-0.025em]">{title}</h2>
      <p className="mt-1 text-sm text-[#8b8b93]">{description}</p>
    </div>
  );
}

function StatusBadge({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#fff0f0] px-2.5 py-1 text-[11px] font-semibold text-[#d94848]"><span className="size-1.5 rounded-full bg-[#ff6b6b]" />{children}</span>;
}

function UrlResults({ urls }: { urls: TistoryUrls }) {
  return (
    <dl className="space-y-2.5">
      {([ ["Login URL", urls.login], ["Admin URL", urls.admin], ["Editor URL", urls.editor] ] as const).map(([label, url]) => (
        <div className="grid gap-1 rounded-xl bg-[#f8f8fa] px-4 py-3 sm:grid-cols-[90px_1fr] sm:items-center sm:gap-3" key={label}>
          <dt className="text-xs font-semibold text-[#77777f]">{label}</dt>
          <dd className="break-all font-mono text-xs text-[#44444b]">{url}</dd>
        </div>
      ))}
    </dl>
  );
}
