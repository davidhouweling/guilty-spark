import { defineConfig } from "vitest/config";

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
  },
});
