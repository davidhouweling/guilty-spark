import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MockInstance } from "vitest";
import { ConsoleLogClient } from "../console-log-client";

function parseLogged(
  spy: MockInstance<typeof console.info | typeof console.warn | typeof console.error>,
): Record<string, unknown> {
  expect(spy).toHaveBeenCalledTimes(1);
  const [call] = spy.mock.calls;
  if (call == null) {
    throw new Error("Expected spy to have been called");
  }
  const [firstArg] = call;
  if (typeof firstArg !== "string") {
    throw new Error(`Expected first console argument to be a string, got ${typeof firstArg}`);
  }
  return JSON.parse(firstArg) as Record<string, unknown>;
}

function parseFatalLogged(spy: MockInstance<typeof console.error>): Record<string, unknown> {
  expect(spy).toHaveBeenCalledTimes(1);
  const [call] = spy.mock.calls;
  if (call == null) {
    throw new Error("Expected spy to have been called");
  }
  const [prefix, secondArg] = call as unknown[];
  if (typeof prefix !== "string") {
    throw new Error(`Expected first console argument to be a string, got ${typeof prefix}`);
  }
  if (typeof secondArg !== "string") {
    throw new Error(`Expected second console argument to be a string, got ${typeof secondArg}`);
  }
  expect(prefix).toBe("FATAL:");
  return JSON.parse(secondArg) as Record<string, unknown>;
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

      const logged = parseLogged(consoleSpy.info);
      expect(logged).toMatchObject({ message: "test info message" });
      expect(logged["callStack"]).toBeUndefined();
    });

    it("logs info message with extra data", () => {
      const extra = new Map([["key", "value"]]);

      logClient.info("test info", extra);

      const logged = parseLogged(consoleSpy.info);
      expect(logged).toMatchObject({ message: "test info", key: "value" });
      expect(logged["callStack"]).toBeUndefined();
    });

    it("logs Error objects with message and stack from the error", () => {
      const error = new Error("test error");

      logClient.info(error);

      const logged = parseLogged(consoleSpy.info);
      expect(logged).toMatchObject({ message: "test error", stack: error.stack });
      expect(logged["callStack"]).toBeUndefined();
    });

    it("logs numbers as JSON strings", () => {
      logClient.info(42);

      const logged = parseLogged(consoleSpy.info);
      expect(logged).toMatchObject({ message: "42" });
    });

    it("logs plain objects as JSON", () => {
      logClient.info({ key: "value", count: 1 });

      const logged = parseLogged(consoleSpy.info);
      expect(logged).toMatchObject({ message: '{"key":"value","count":1}' });
    });
  });

  describe("warn", () => {
    it("logs warn message without extra data", () => {
      logClient.warn("test warning");

      const logged = parseLogged(consoleSpy.warn);
      expect(logged).toMatchObject({ message: "test warning" });
      expect(logged["callStack"]).toBeTypeOf("string");
    });

    it("logs warn message with extra data", () => {
      const extra = new Map([["context", "data"]]);

      logClient.warn("test warning", extra);

      const logged = parseLogged(consoleSpy.warn);
      expect(logged).toMatchObject({ message: "test warning", context: "data" });
    });

    it("logs Error objects with message and stack from the error", () => {
      const error = new Error("test warn error");

      logClient.warn(error);

      const logged = parseLogged(consoleSpy.warn);
      expect(logged).toMatchObject({ message: "test warn error", stack: error.stack });
      expect(logged["callStack"]).toBeTypeOf("string");
    });
  });

  describe("error", () => {
    it("logs error message without extra data", () => {
      logClient.error("test error");

      const logged = parseLogged(consoleSpy.error);
      expect(logged).toMatchObject({ message: "test error" });
      expect(logged["callStack"]).toBeTypeOf("string");
    });

    it("logs error message with extra data", () => {
      const extra = new Map([["details", "info"]]);

      logClient.error("test error", extra);

      const logged = parseLogged(consoleSpy.error);
      expect(logged).toMatchObject({ message: "test error", details: "info" });
    });

    it("logs Error objects with message and stack from the error", () => {
      const error = new Error("test error object");

      logClient.error(error);

      const logged = parseLogged(consoleSpy.error);
      expect(logged).toMatchObject({ message: "test error object", stack: error.stack });
      expect(logged["callStack"]).toBeTypeOf("string");
    });
  });

  describe("fatal", () => {
    it("logs fatal message with FATAL prefix without extra data", () => {
      logClient.fatal("critical failure");

      const logged = parseFatalLogged(consoleSpy.error);
      expect(logged).toMatchObject({ message: "critical failure" });
      expect(logged["callStack"]).toBeTypeOf("string");
    });

    it("logs fatal message with FATAL prefix with extra data", () => {
      const extra = new Map([["crash", "data"]]);

      logClient.fatal("critical failure", extra);

      const logged = parseFatalLogged(consoleSpy.error);
      expect(logged).toMatchObject({ message: "critical failure", crash: "data" });
    });
  });
});
