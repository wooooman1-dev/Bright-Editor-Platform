"use client";

import { useReducer } from "react";

import type { ContentMetadata, ContentValidationIssue } from "../../../core/content";
import {
  contentProcessingSamples,
  createPlaygroundState,
  getIssueSeverity,
  playgroundReducer,
  runContentProcessing,
  type ContentProcessingSampleKey,
  type PlaygroundRunResult,
  type ValidationSummary,
} from "./playground";

export function ContentProcessingPlayground() {
  const [state, dispatch] = useReducer(
    playgroundReducer,
    undefined,
    () => createPlaygroundState(),
  );

  return (
    <main className="min-h-screen bg-[#f8f8fa] text-[#19191b]">
      <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
        <header className="border-b border-black/6 pb-7">
          <p className="text-xs font-semibold tracking-[0.14em] text-[#d94848] uppercase">
            Sprint 2 Verification Tool
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
            Content Processing Playground
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#6f6f77]">
            Run a ContentDocument through the real Sprint 2 ContentPipeline and
            inspect normalization, validation, optimization, and metadata.
          </p>
        </header>

        <section className="mt-8 rounded-3xl border border-black/6 bg-white p-5 shadow-[0_14px_45px_rgba(24,24,27,0.05)] sm:p-7">
          <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold">Sample case</span>
              <select
                aria-label="Sample case"
                className="w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-sm outline-none focus:border-[#ff6b6b] focus:ring-4 focus:ring-[#ff6b6b]/10"
                onChange={(event) =>
                  dispatch({
                    sample: event.target.value as ContentProcessingSampleKey,
                    type: "select",
                  })
                }
                value={state.selectedSample}
              >
                {Object.entries(contentProcessingSamples).map(([key, sample]) => (
                  <option key={key} value={key}>
                    {sample.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold">
                ContentDocument JSON
              </span>
              <textarea
                aria-label="ContentDocument JSON"
                className="min-h-80 w-full resize-y rounded-2xl border border-black/10 bg-[#fcfcfd] p-4 font-mono text-xs leading-5 outline-none focus:border-[#ff6b6b] focus:ring-4 focus:ring-[#ff6b6b]/10"
                onChange={(event) =>
                  dispatch({ input: event.target.value, type: "edit" })
                }
                spellCheck={false}
                value={state.input}
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              className="rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(255,107,107,0.2)] hover:bg-[#f45d5d] focus:ring-4 focus:ring-[#ff6b6b]/25 focus:outline-none"
              onClick={() =>
                dispatch({ result: runContentProcessing(state.input), type: "run" })
              }
              type="button"
            >
              Run Pipeline
            </button>
            <button
              className="rounded-xl border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-[#52525a] hover:bg-[#f5f5f6] focus:ring-4 focus:ring-black/10 focus:outline-none"
              onClick={() => dispatch({ type: "reset" })}
              type="button"
            >
              Reset
            </button>
          </div>
        </section>

        <div aria-live="polite" className="mt-7">
          {state.result ? <ContentProcessingResults result={state.result} /> : null}
        </div>
      </div>
    </main>
  );
}

export function ContentProcessingResults({
  result,
}: {
  result: PlaygroundRunResult;
}) {
  if (result.status !== "success") {
    return (
      <section
        className="rounded-2xl border border-[#e05252]/25 bg-[#fff3f3] p-5"
        role="alert"
      >
        <h2 className="font-semibold text-[#b83d3d]">
          {result.status === "parse-error" ? "Invalid JSON" : "Processing error"}
        </h2>
        <p className="mt-2 text-sm text-[#8f3d3d]">{result.message}</p>
      </section>
    );
  }

  const metadata = result.pipeline.document.metadata;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-black/6 bg-white p-5">
        <h2 className="text-lg font-semibold">Pipeline Outcome</h2>
        <p className="mt-2 text-sm font-medium">
          {result.outcome === "optimized"
            ? "Optimized successfully"
            : "Validation failed — optimizer skipped"}
        </p>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <JsonSection title="Input Document" value={result.input} />
        <JsonSection
          title="Processed Document"
          value={result.pipeline.document}
        />
      </div>

      <section className="rounded-2xl border border-black/6 bg-white p-5">
        <h2 className="text-lg font-semibold">Validation Summary</h2>
        <ValidationSummaryView summary={result.summary} />
      </section>

      <section className="rounded-2xl border border-black/6 bg-white p-5">
        <h2 className="text-lg font-semibold">Validation Issues</h2>
        <IssueList issues={result.pipeline.validation.issues} />
      </section>

      <section className="rounded-2xl border border-black/6 bg-white p-5">
        <h2 className="text-lg font-semibold">Metadata</h2>
        {metadata ? (
          <MetadataView metadata={metadata} />
        ) : (
          <p className="mt-3 text-sm text-[#77777f]">
            Metadata is unavailable because optimization did not run.
          </p>
        )}
      </section>
    </div>
  );
}

function ValidationSummaryView({ summary }: { summary: ValidationSummary }) {
  const items = [
    ["Valid", String(summary.valid)],
    ["Total issues", String(summary.issueCount)],
    ...(summary.errorCount === undefined
      ? []
      : [["Errors", String(summary.errorCount)]]),
    ...(summary.warningCount === undefined
      ? []
      : [["Warnings", String(summary.warningCount)]]),
    ...(summary.infoCount === undefined
      ? []
      : [["Infos", String(summary.infoCount)]]),
  ];

  return (
    <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {items.map(([label, value]) => (
        <div className="rounded-xl bg-[#f8f8fa] p-3" key={label}>
          <dt className="text-xs text-[#77777f]">{label}</dt>
          <dd className="mt-1 text-sm font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function IssueList({ issues }: { issues: readonly ContentValidationIssue[] }) {
  if (issues.length === 0) {
    return <p className="mt-3 text-sm text-[#77777f]">No validation issues.</p>;
  }

  return (
    <ul className="mt-4 space-y-3">
      {issues.map((issue, index) => {
        const severity = getIssueSeverity(issue);
        return (
          <li className="rounded-xl border border-black/6 bg-[#fafafa] p-4" key={`${issue.code}-${issue.blockId ?? index}`}>
            <div className="flex flex-wrap items-center gap-2">
              <strong className="font-mono text-xs">{issue.code}</strong>
              {severity ? (
                <span className="rounded-full bg-[#eeeeF1] px-2 py-1 text-[11px] font-semibold uppercase">
                  {severity}
                </span>
              ) : null}
              {issue.blockId ? (
                <span className="text-xs text-[#77777f]">
                  Block: {issue.blockId}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-sm">{issue.message}</p>
          </li>
        );
      })}
    </ul>
  );
}

function MetadataView({ metadata }: { metadata: ContentMetadata }) {
  return (
    <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Object.entries(metadata).map(([label, value]) => (
        <div className="rounded-xl bg-[#f8f8fa] p-3" key={label}>
          <dt className="text-xs text-[#77777f]">{label}</dt>
          <dd className="mt-1 break-all text-sm font-semibold">{String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function JsonSection({ title, value }: { title: string; value: unknown }) {
  return (
    <section className="min-w-0 rounded-2xl border border-black/6 bg-white p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      <pre className="mt-4 max-h-[32rem] overflow-auto rounded-xl bg-[#19191b] p-4 text-xs leading-5 text-[#f7f7f8]">
        {JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}
