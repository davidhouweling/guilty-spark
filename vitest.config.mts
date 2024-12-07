import { coverageConfigDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    typecheck: {
      tsconfig: "tsconfig.test.json",
    },
    restoreMocks: true,
    reporters: ["junit", "default"],
    outputFile: {
      junit: "./test-results/junit-report.xml",
    },
    coverage: {
      reporter: ["text", "json-summary", "json", "html"],
      reportOnFailure: true,
      exclude: [...coverageConfigDefaults.exclude, "scripts/**/*", "**/fakes/**"],
    },
  },
});
