import { defineConfig } from "vitest/config"
import path from "node:path"

/**
 * Two test projects:
 *  - node:  `*.test.ts`  — services, lib, API route handlers (no DOM)
 *  - jsdom: `*.test.tsx` — React component tests (Testing Library + jest-dom)
 *
 * A `.test.ts` file that needs a DOM can still opt in with a
 * `// @vitest-environment jsdom` docblock at the top of the file.
 */
const alias = { "@": path.resolve(__dirname, "src") }

export default defineConfig({
  resolve: { alias },
  esbuild: { jsx: "automatic" },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "node",
          include: ["src/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        resolve: { alias },
        esbuild: { jsx: "automatic" },
        test: {
          name: "jsdom",
          include: ["src/**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: ["./src/test/setup.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/generated/**",
        "src/test/**",
        "**/*.d.ts",
        "**/*.test.{ts,tsx}",
        "**/__tests__/**",
        "e2e/**",
      ],
      reporter: ["text-summary", "html"],
      reportsDirectory: "./coverage",
    },
  },
})
