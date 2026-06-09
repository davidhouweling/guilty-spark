import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MockInstance } from "vitest";
import { ConsoleLogClient } from "../console-log-client";

function stringifyContent(content: Record<string, unknown>): string {
  return JSON.stringify(content, null, 2);
}

describe("ConsoleLogClient", () => {
  let logClient: ConsoleLogClient;
  let consoleSpy: {
    debug: MockInstance<typeof console.debug>;
    info: MockInstance<typeof console.info>;
    warn: MockInstance<typeof console.warn>;
    error: MockInstance<typeof console.error>;
  };

  beforeEach(() => {
    logClient = new ConsoleLogClient();
    consoleSpy = {
      debug: vi.spyOn(console, "debug").mockImplementation(() => {
        /* empty */
      }),
      info: vi.spyOn(console, "info").mockImplementation(() => {
        /* empty */
      }),
      warn: vi.spyOn(console, "warn").mockImplementation(() => {
        /* empty */
      }),
      error: vi.spyOn(console, "error").mockImplementation(() => {
        /* empty */
      }),
    };
  });

  describe("debug", () => {
    it("does not log debug messages", () => {
      logClient.debug("test debug message");

      expect(consoleSpy.debug).not.toHaveBeenCalled();
    });
  });

  describe("info", () => {
    it("logs info message without extra data", () => {
      logClient.info("test info message");

      expect(consoleSpy.info).toHaveBeenCalledWith(
        stringifyContent({
          message: "test info message",
        }),
      );
    });

    it("logs info message with extra data", () => {
      const extra = new Map([["key", "value"]]);

      logClient.info("test info", extra);

      expect(consoleSpy.info).toHaveBeenCalledWith(
        stringifyContent({
          message: "test info",
          key: "value",
        }),
      );
    });

    it("logs Error objects", () => {
      const error = new Error("test error");

      logClient.info(error);

      expect(consoleSpy.info).toHaveBeenCalledWith(
        stringifyContent({
          message: "test error",
          stack: error.stack,
        }),
      );
    });
  });

  describe("warn", () => {
    it("logs warn message without extra data", () => {
      logClient.warn("test warning");

      expect(consoleSpy.warn).toHaveBeenCalledWith(
        stringifyContent({
          message: "test warning",
        }),
      );
    });

    it("logs warn message with extra data", () => {
      const extra = new Map([["context", "data"]]);

      logClient.warn("test warning", extra);

      expect(consoleSpy.warn).toHaveBeenCalledWith(
        stringifyContent({
          message: "test warning",
          context: "data",
        }),
      );
    });
  });

  describe("error", () => {
    it("logs error message without extra data", () => {
      logClient.error("test error");

      expect(consoleSpy.error).toHaveBeenCalledWith(
        stringifyContent({
          message: "test error",
        }),
      );
    });

    it("logs error message with extra data", () => {
      const extra = new Map([["details", "info"]]);

      logClient.error("test error", extra);

      expect(consoleSpy.error).toHaveBeenCalledWith(
        stringifyContent({
          message: "test error",
          details: "info",
        }),
      );
    });
  });

  describe("fatal", () => {
    it("logs fatal message with FATAL prefix without extra data", () => {
      logClient.fatal("critical failure");

      expect(consoleSpy.error).toHaveBeenCalledWith(
        "FATAL:",
        stringifyContent({
          message: "critical failure",
        }),
      );
    });

    it("logs fatal message with FATAL prefix with extra data", () => {
      const extra = new Map([["crash", "data"]]);

      logClient.fatal("critical failure", extra);

      expect(consoleSpy.error).toHaveBeenCalledWith(
        "FATAL:",
        stringifyContent({
          message: "critical failure",
          crash: "data",
        }),
      );
    });
  });
});
