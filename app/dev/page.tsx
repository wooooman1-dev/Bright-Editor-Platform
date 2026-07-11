import type { Metadata } from "next";

import { createTistoryUrls, type TistoryUrls } from "../../apps/tistory";

export const metadata: Metadata = {
  title: "Developer Dashboard | Bright Editor Platform",
  robots: {
    follow: false,
    index: false,
  },
};

const coreBrowserModules = [
  "BrowserManager",
  "BrowserSessionManager",
  "BrowserContextManager",
] as const;

const tistoryCapabilities = [
  "Application skeleton",
  "URL configuration",
  "Login page foundation",
] as const;

type DevDashboardProps = {
  searchParams: Promise<{
    blogName?: string | string[];
  }>;
};

export default async function DevDashboard({
  searchParams,
}: DevDashboardProps) {
  const params = await searchParams;
  const submittedBlogName = Array.isArray(params.blogName)
    ? (params.blogName[0] ?? "")
    : params.blogName;
  const urlResult = buildTistoryUrlResult(submittedBlogName);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl sm:p-8">
          <span className="inline-flex rounded-full bg-amber-400/10 px-3 py-1 text-xs font-semibold tracking-widest text-amber-300 uppercase">
            Development only
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Developer Dashboard
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
            Internal verification surface for the current Bright Editor Platform
            implementation. This page is separate from the production UI.
          </p>
        </header>

        <section
          aria-labelledby="implementation-status"
          className="grid gap-4 sm:grid-cols-3"
        >
          <h2 id="implementation-status" className="sr-only">
            Implementation status
          </h2>
          <StatusCard label="Development mode" value="Implementation only" />
          <StatusCard label="Current milestone" value="v0.1 Tistory Draft" />
          <StatusCard label="Verification feature" value="Feature #8" />
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <ModuleSection
            description="Platform-independent browser lifecycle capabilities."
            items={coreBrowserModules}
            title="Core Browser Layer"
          />
          <ModuleSection
            description="Available platform application capabilities."
            items={tistoryCapabilities}
            title="Tistory Application"
          />
        </div>

        <section
          aria-labelledby="url-builder-title"
          className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl sm:p-8"
        >
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-cyan-300">Tistory module</p>
            <h2 id="url-builder-title" className="mt-1 text-2xl font-semibold">
              URL Builder
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Verify login, administration, and editor URL creation using the
              existing Tistory configuration module.
            </p>
          </div>

          <form action="/dev" className="mt-6 flex flex-col gap-3 sm:flex-row" method="get">
            <label className="flex-1">
              <span className="mb-2 block text-sm font-medium text-slate-200">
                Tistory blog identifier
              </span>
              <input
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
                defaultValue={submittedBlogName}
                name="blogName"
                placeholder="bright-editor"
                type="text"
              />
            </label>
            <button
              className="self-end rounded-lg bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-900 focus:outline-none"
              type="submit"
            >
              Generate URLs
            </button>
          </form>

          <output aria-live="polite" className="mt-6 block">
            {urlResult.error ? (
              <p className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
                {urlResult.error}
              </p>
            ) : null}
            {urlResult.urls ? <UrlResults urls={urlResult.urls} /> : null}
          </output>
        </section>
      </div>
    </main>
  );
}

function buildTistoryUrlResult(blogName: string | undefined): {
  error?: string;
  urls?: TistoryUrls;
} {
  if (blogName === undefined) {
    return {};
  }

  try {
    return { urls: createTistoryUrls(blogName) };
  } catch {
    return { error: "Enter a valid Tistory blog identifier." };
  }
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
        {label}
      </p>
      <p className="mt-2 font-medium text-slate-100">{value}</p>
    </article>
  );
}

function ModuleSection({
  description,
  items,
  title,
}: {
  description: string;
  items: readonly string[];
  title: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-slate-400">{description}</p>
      <ul className="mt-5 space-y-3">
        {items.map((item) => (
          <li className="flex items-center gap-3 text-sm text-slate-200" key={item}>
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full bg-emerald-400"
            />
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function UrlResults({ urls }: { urls: TistoryUrls }) {
  return (
    <dl className="grid gap-3">
      {(
        [
          ["Login URL", urls.login],
          ["Admin URL", urls.admin],
          ["Editor URL", urls.editor],
        ] as const
      ).map(([label, url]) => (
        <div
          className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-3"
          key={label}
        >
          <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
            {label}
          </dt>
          <dd className="mt-1 break-all font-mono text-sm text-cyan-200">{url}</dd>
        </div>
      ))}
    </dl>
  );
}
