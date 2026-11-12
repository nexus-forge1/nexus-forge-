import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "node:path"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // Only execute the repository test suite; generated preflight snapshots are excluded below.
    include: ["__tests__/**/*.test.{ts,tsx}"],
    // Ignore generated Macaly/preflight snapshots so copied tests are not counted as project tests.
    exclude: ["node_modules", ".npm/**", "**/.npm/**", ".tanstack", "**/.sandbox/**", "**/.macaly/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
})
