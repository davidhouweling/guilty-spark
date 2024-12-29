import { coverageConfigDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    restoreMocks: true,
    reporters: ["junit", "default"],
    outputFile: {
      junit: "./test-results/junit-report.xml",
    },
    coverage: {
      reporter: ["text", "json-summary", "json", "html"],
      reportOnFailure: true,
      exclude: [...coverageConfigDefaults.exclude, "scripts/**/*", "**/fakes/**", "**/install.mts"],
    },
    exclude: [...coverageConfigDefaults.exclude, "scripts/**/*", "test-results/**/*", ".wrangler/**/*"],
  },
});
