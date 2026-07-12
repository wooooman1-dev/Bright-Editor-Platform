import type { Metadata } from "next";

import { createTistoryUrls, type TistoryUrls } from "../../apps/tistory";
import {
  completedSprintThreeFeatures,
  connectionStatus,
  fixtureCounts,
  implementedRoutes,
  verificationCommands,
  type VerificationItem,
} from "./developer-verification";

export const metadata: Metadata = {
  title: "Developer Verification | Bright Studio",
  robots: { follow: false, index: false },
};

const coreBrowserModules = ["BrowserManager", "BrowserSessionManager", "BrowserContextManager"] as const;

type DevDashboardProps = {
  searchParams: Promise<{ blogName?: string | string[] }>;
};

export default async function DevDashboard({ searchParams }: DevDashboardProps) {
  const params = await searchParams;
  const submittedBlogName = Array.isArray(params.blogName) ? (params.blogName[0] ?? "") : params.blogName;
  const urlResult = buildTistoryUrlResult(submittedBlogName);

  return (
    <main className="min-h-screen bg-[#f8f8fa] text-[#19191b]">
      <div className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10">
        <header className="flex flex-col gap-6 border-b border-black/6 pb-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <div aria-hidden="true" className="flex size-11 items-center justify-center rounded-[14px] bg-[#ff6b6b] text-lg font-bold text-white shadow-[0_8px_24px_rgba(255,107,107,0.24)]">B</div>
            <div>
              <p className="text-xl font-semibold tracking-[-0.03em]">Bright Studio</p>
              <p className="mt-0.5 text-sm text-[#77777f]">Sprint 3 developer verification</p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="rounded-full border border-[#ff6b6b]/20 bg-[#fff0f0] px-3 py-1.5 text-xs font-semibold text-[#d94848]">Development Mode</span>
            <span className="rounded-full border border-black/8 bg-white px-3 py-1.5 text-xs font-semibold text-[#65656d] shadow-sm">Architecture Freeze</span>
          </div>
        </header>

        <div className="space-y-8 py-8 sm:py-10">
          <section aria-labelledby="verification-title" className="overflow-hidden rounded-[24px] border border-black/6 bg-white p-6 shadow-[0_16px_50px_rgba(24,24,27,0.06)] sm:p-8">
            <p className="text-xs font-semibold tracking-[0.14em] text-[#ff6b6b] uppercase">Feature #6</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl" id="verification-title">Developer Verification</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#77777f]">A fixture-based view of implemented product routes and Sprint 3 boundaries. No operational data is loaded.</p>
            <dl className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <CountCard label="Workspaces" value={fixtureCounts.workspaces} />
              <CountCard label="Projects" value={fixtureCounts.projects} />
              <CountCard label="Contents" value={fixtureCounts.contents} />
            </dl>
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <VerificationList description="Sprint 3 implementation units." items={completedSprintThreeFeatures} title="Completed Features" />
            <VerificationList description="Current application and developer routes." items={implementedRoutes} monospace title="Current Routes" />
          </div>

          <section aria-labelledby="status-title">
            <SectionHeading description="Connections and architecture boundaries represented by fixtures." id="status-title" title="Current Fixture Status" />
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {connectionStatus.map((item) => <StatusCard item={item} key={item.label} />)}
            </div>
          </section>

          <section aria-labelledby="commands-title">
            <SectionHeading description="Repository commands used for the completion gate." id="commands-title" title="Build and Test Information" />
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {verificationCommands.map((item) => <StatusCard item={item} key={item.label} monospace />)}
            </div>
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <section aria-labelledby="core-title" className="rounded-[24px] border border-black/6 bg-white p-6 shadow-[0_10px_40px_rgba(24,24,27,0.045)] sm:p-7">
              <SectionHeading description="Existing platform-independent browser foundations." id="core-title" title="Core Browser Modules" />
              <ul className="mt-6 space-y-3">
                {coreBrowserModules.map((module) => (
                  <li className="flex items-center justify-between gap-3 rounded-2xl bg-[#f8f8fa] px-4 py-3.5" key={module}>
                    <span className="truncate text-sm font-medium">{module}</span>
                    <StatusBadge>Complete</StatusBadge>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="url-builder-title" className="rounded-[24px] border border-black/6 bg-white p-6 shadow-[0_10px_40px_rgba(24,24,27,0.045)] sm:p-7">
              <SectionHeading description="Preserved development-only verification using the existing URL API." id="url-builder-title" title="Tistory URL Verification" />
              <form action="/dev" className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end" method="get">
                <label className="flex-1">
                  <span className="mb-2 block text-sm font-medium">Blog identifier</span>
                  <div className="flex overflow-hidden rounded-xl border border-black/10 bg-[#fafafa] transition focus-within:border-[#ff6b6b]/60 focus-within:ring-4 focus-within:ring-[#ff6b6b]/10">
                    <input aria-describedby="blog-domain" className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm outline-none placeholder:text-[#b4b4bb]" defaultValue={submittedBlogName} name="blogName" placeholder="bright-studio" type="text" />
                    <span className="flex items-center border-l border-black/6 bg-white px-3 text-xs text-[#92929a]" id="blog-domain">.tistory.com</span>
                  </div>
                </label>
                <button className="rounded-xl bg-[#ff6b6b] px-6 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(255,107,107,0.22)] transition hover:bg-[#f45d5d] focus:ring-4 focus:ring-[#ff6b6b]/20 focus:outline-none" type="submit">Verify</button>
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
          <span>Development Build · Fixture Only</span>
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
    return { error: "Enter a valid Tistory blog identifier." };
  }
}

function CountCard({ label, value }: { label: string; value: number }) {
  return <div className="rounded-[20px] bg-[#f8f8fa] p-5"><dt className="text-sm text-[#77777f]">{label}</dt><dd className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{value}</dd></div>;
}

function VerificationList({ description, items, monospace = false, title }: { description: string; items: readonly string[]; monospace?: boolean; title: string }) {
  return (
    <section className="rounded-[24px] border border-black/6 bg-white p-6 shadow-[0_10px_40px_rgba(24,24,27,0.045)] sm:p-7">
      <SectionHeading description={description} id={title.toLowerCase().replaceAll(" ", "-")} title={title} />
      <ul className="mt-6 space-y-3">
        {items.map((item) => <li className={`rounded-2xl bg-[#f8f8fa] px-4 py-3 text-sm ${monospace ? "break-all font-mono text-xs" : "font-medium"}`} key={item}>{item}</li>)}
      </ul>
    </section>
  );
}

function StatusCard({ item, monospace = false }: { item: VerificationItem; monospace?: boolean }) {
  return <article className="rounded-[20px] border border-black/6 bg-white p-5 shadow-[0_8px_30px_rgba(24,24,27,0.04)]"><p className="text-xs font-semibold tracking-[0.08em] text-[#92929a] uppercase">{item.label}</p><p className={`mt-3 font-semibold ${monospace ? "font-mono text-sm" : "text-lg"}`}>{item.value}</p><p className="mt-2 text-xs leading-5 text-[#92929a]">{item.detail}</p></article>;
}

function SectionHeading({ description, id, title }: { description: string; id: string; title: string }) {
  return <div><h2 className="text-lg font-semibold tracking-[-0.025em]" id={id}>{title}</h2><p className="mt-1 text-sm text-[#8b8b93]">{description}</p></div>;
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
