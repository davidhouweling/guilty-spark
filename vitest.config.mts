import { coverageConfigDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    mockReset: true,
    restoreMocks: true,
    reporters: ["junit", "default"],
    outputFile: {
      junit: "./test-results/junit-report.xml",
    },
    // issue: https://github.com/vitest-dev/vitest/issues/7288
    fakeTimers: {
      toFake: ["setTimeout", "clearTimeout", "Date"],
    },
    coverage: {
      reporter: ["text", "json-summary", "json", "html"],
      reportOnFailure: true,
      exclude: [...coverageConfigDefaults.exclude, "api/scripts/**/*", "**/fakes/**", "**/install.mts"],
    },

    projects: [
      {
        extends: true,
        test: {
          name: "api",
          environment: "node",
          include: ["api/**/*.test.mts", "api/**/*.spec.mts"],
        },
      },
      {
        extends: true,
        test: {
          name: "pages",
          environment: "jsdom",
          include: [
            "pages/src/**/*.test.ts",
            "pages/src/**/*.test.tsx",
            "pages/src/**/*.spec.ts",
            "pages/src/**/*.spec.tsx",
          ],
        },
      },
    ],
  },
});
