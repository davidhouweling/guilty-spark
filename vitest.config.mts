import { coverageConfigDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
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
      exclude: [...coverageConfigDefaults.exclude, "scripts/**/*", "**/fakes/**", "**/install.mts"],
    },
  },
});
