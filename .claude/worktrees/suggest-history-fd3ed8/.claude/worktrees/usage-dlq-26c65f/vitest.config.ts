// vitest.config.ts

import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    // Worktrees created under `.claude/worktrees/` are nested on disk
    // but checked out at different commits. Without this exclude, vitest
    // discovers stale test files from sibling worktrees and runs them
    // against the current branch's source via the "@/" alias — a
    // confusing source of phantom failures. CI only ever sees one
    // worktree so this is purely a local-DX guard.
    exclude: ["**/node_modules/**", "**/.next/**", ".claude/worktrees/**"],
  },
});
