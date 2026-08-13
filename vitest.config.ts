import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "server-only": new URL("./tests/support/server-only.ts", import.meta.url).pathname,
    },
  },
  test: {
    // .claude/worktrees holds ephemeral git worktree checkouts created by
    // sub-agents. Each checkout duplicates the full tests/ tree, so without
    // this exclude vitest would discover and run the same tests twice
    // (once from the real tree, once from the worktree copy), producing
    // flaky duplicate-run failures unrelated to the code under test.
    exclude: [...configDefaults.exclude, "**/.claude/worktrees/**"],
  },
});
