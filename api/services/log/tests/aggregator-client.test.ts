/* eslint-disable @typescript-eslint/unbound-method -- vi.fn() mocks don't have `this` binding issues */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mocked } from "vitest";
import { AggregatorClient } from "../aggregator-client";
import type { LogService } from "../types";

describe("AggregatorClient", () => {
  let mockClient1: Mocked<LogService>;
  let mockClient2: Mocked<LogService>;
  let aggregator: AggregatorClient;

  beforeEach(() => {
    mockClient1 = {
      debug: vi.fn<LogService["debug"]>(),
      info: vi.fn<LogService["info"]>(),
      warn: vi.fn<LogService["warn"]>(),
      error: vi.fn<LogService["error"]>(),
      fatal: vi.fn<LogService["fatal"]>(),
    };

    mockClient2 = {
      debug: vi.fn<LogService["debug"]>(),
      info: vi.fn<LogService["info"]>(),
      warn: vi.fn<LogService["warn"]>(),
      error: vi.fn<LogService["error"]>(),
      fatal: vi.fn<LogService["fatal"]>(),
    };

    aggregator = new AggregatorClient([mockClient1, mockClient2]);
  });

  describe("debug", () => {
    it("forwards debug calls to all clients", () => {
      const extra = new Map([["key", "value"]]);

      aggregator.debug("test message", extra);

      expect(mockClient1.debug).toHaveBeenCalledWith("test message", extra);
      expect(mockClient2.debug).toHaveBeenCalledWith("test message", extra);
    });
  });

  describe("info", () => {
    it("forwards info calls to all clients", () => {
      const error = new Error("test");

      aggregator.info(error);

      expect(mockClient1.info).toHaveBeenCalledWith(error, undefined);
      expect(mockClient2.info).toHaveBeenCalledWith(error, undefined);
    });
  });

  describe("warn", () => {
    it("forwards warn calls to all clients", () => {
      aggregator.warn("warning message");

      expect(mockClient1.warn).toHaveBeenCalledWith("warning message", undefined);
      expect(mockClient2.warn).toHaveBeenCalledWith("warning message", undefined);
    });
  });

  describe("error", () => {
    it("forwards error calls to all clients", () => {
      const error = new Error("error");
      const extra = new Map([["context", "data"]]);

      aggregator.error(error, extra);

      expect(mockClient1.error).toHaveBeenCalledWith(error, extra);
      expect(mockClient2.error).toHaveBeenCalledWith(error, extra);
    });
  });

  describe("fatal", () => {
    it("forwards fatal calls to all clients", () => {
      aggregator.fatal("fatal error");

      expect(mockClient1.fatal).toHaveBeenCalledWith("fatal error", undefined);
      expect(mockClient2.fatal).toHaveBeenCalledWith("fatal error", undefined);
    });
  });

  describe("with empty clients array", () => {
    it("does not throw when calling methods with no clients", () => {
      const emptyAggregator = new AggregatorClient([]);

      expect(() => {
        emptyAggregator.debug("test");
        emptyAggregator.info("test");
        emptyAggregator.warn("test");
        emptyAggregator.error("test");
        emptyAggregator.fatal("test");
      }).not.toThrow();
    });
  });
});
