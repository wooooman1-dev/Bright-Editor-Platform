"use client";

import { useReducer } from "react";

import type { ContentEditorViewModel } from "./content-editor-fixtures";
import { createEditorLocalState, reduceEditorLocalState } from "./editor-state";

export function ContentEditorForm({ content }: { content: ContentEditorViewModel }) {
  const [state, dispatch] = useReducer(reduceEditorLocalState, content, createEditorLocalState);

  return (
    <form className="mt-6" onSubmit={(event) => { event.preventDefault(); dispatch({ type: "save-draft" }); }}>
      <div className="rounded-[24px] border border-black/6 bg-white p-5 shadow-[0_10px_40px_rgba(24,24,27,0.045)] sm:p-7 lg:p-8">
        <label className="block" htmlFor="content-title">
          <span className="text-xs font-semibold tracking-[0.08em] text-[#92929a] uppercase">Title</span>
          <input className="mt-2 w-full rounded-xl border border-black/8 bg-[#fafafa] px-4 py-3 text-xl font-semibold tracking-[-0.025em] outline-none transition focus:border-[#ff6b6b]/60 focus:ring-4 focus:ring-[#ff6b6b]/10 sm:text-2xl" id="content-title" onChange={(event) => dispatch({ type: "change-title", value: event.target.value })} type="text" value={state.title} />
        </label>

        <label className="mt-6 block" htmlFor="content-body">
          <span className="text-xs font-semibold tracking-[0.08em] text-[#92929a] uppercase">Body</span>
          <textarea className="mt-2 min-h-80 w-full resize-y rounded-xl border border-black/8 bg-[#fafafa] px-4 py-4 text-base leading-7 outline-none transition focus:border-[#ff6b6b]/60 focus:ring-4 focus:ring-[#ff6b6b]/10 sm:min-h-96" id="content-body" onChange={(event) => dispatch({ type: "change-body", value: event.target.value })} value={state.body} />
        </label>
      </div>

      <div className="mt-4 flex flex-col gap-3 rounded-[20px] border border-black/6 bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div aria-live="polite" className="text-sm leading-6 text-[#77777f]">
          {state.notice ?? "This preview does not persist changes."}
        </div>
        <button className="w-fit shrink-0 rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(255,107,107,0.22)] transition hover:bg-[#f45d5d] focus:ring-4 focus:ring-[#ff6b6b]/20 focus:outline-none" type="submit">Save Draft</button>
      </div>
    </form>
  );
}
