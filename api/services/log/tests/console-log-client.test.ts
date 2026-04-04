import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MockInstance } from "vitest";
import { ConsoleLogClient } from "../console-log-client";

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

      expect(consoleSpy.info).toHaveBeenCalledWith("test info message", undefined);
    });

    it("logs info message with extra data", () => {
      const extra = new Map([["key", "value"]]);

      logClient.info("test info", extra);

      expect(consoleSpy.info).toHaveBeenCalledWith("test info", JSON.stringify([...extra], null, 2));
    });

    it("logs Error objects", () => {
      const error = new Error("test error");

      logClient.info(error);

      expect(consoleSpy.info).toHaveBeenCalledWith(error, undefined);
    });
  });

  describe("warn", () => {
    it("logs warn message without extra data", () => {
      logClient.warn("test warning");

      expect(consoleSpy.warn).toHaveBeenCalledWith("test warning", undefined);
    });

    it("logs warn message with extra data", () => {
      const extra = new Map([["context", "data"]]);

      logClient.warn("test warning", extra);

      expect(consoleSpy.warn).toHaveBeenCalledWith("test warning", JSON.stringify([...extra], null, 2));
    });
  });

  describe("error", () => {
    it("logs error message without extra data", () => {
      logClient.error("test error");

      expect(consoleSpy.error).toHaveBeenCalledWith("test error", undefined);
    });

    it("logs error message with extra data", () => {
      const extra = new Map([["details", "info"]]);

      logClient.error("test error", extra);

      expect(consoleSpy.error).toHaveBeenCalledWith("test error", JSON.stringify([...extra], null, 2));
    });
  });

  describe("fatal", () => {
    it("logs fatal message with FATAL prefix without extra data", () => {
      logClient.fatal("critical failure");

      expect(consoleSpy.error).toHaveBeenCalledWith("FATAL:", "critical failure", undefined);
    });

    it("logs fatal message with FATAL prefix with extra data", () => {
      const extra = new Map([["crash", "data"]]);

      logClient.fatal("critical failure", extra);

      expect(consoleSpy.error).toHaveBeenCalledWith("FATAL:", "critical failure", JSON.stringify([...extra], null, 2));
    });
  });
});
