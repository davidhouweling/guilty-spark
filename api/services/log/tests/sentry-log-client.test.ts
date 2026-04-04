import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { captureException, captureMessage, addBreadcrumb } from "@sentry/cloudflare";
import { SentryLogClient } from "../sentry-log-client";

const { captureExceptionMock, captureMessageMock, addBreadcrumbMock } = vi.hoisted(() => ({
  captureExceptionMock: vi.fn<typeof captureException>(),
  captureMessageMock: vi.fn<typeof captureMessage>(),
  addBreadcrumbMock: vi.fn<typeof addBreadcrumb>(),
}));

vi.mock("@sentry/cloudflare", () => ({
  captureException: captureExceptionMock,
  captureMessage: captureMessageMock,
  addBreadcrumb: addBreadcrumbMock,
}));

describe("SentryLogClient", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("in production mode", () => {
    let client: SentryLogClient;

    beforeEach(() => {
      client = new SentryLogClient("production");
    });

    describe("debug", () => {
      it("adds breadcrumb for debug messages", () => {
        const extra = new Map([["key", "value"]]);

        client.debug("debug message", extra);

        expect(addBreadcrumbMock).toHaveBeenCalledWith({
          category: "debug",
          message: "debug message",
          level: "debug",
          data: { key: "value" },
        });
      });

      it("adds breadcrumb for Error objects", () => {
        const error = new Error("test error");

        client.debug(error);

        expect(addBreadcrumbMock).toHaveBeenCalledWith({
          category: "debug",
          message: "test error",
          level: "debug",
          data: {},
        });
      });
    });

    describe("info", () => {
      it("adds breadcrumb for info messages", () => {
        client.info("info message");

        expect(addBreadcrumbMock).toHaveBeenCalledWith({
          category: "info",
          message: "info message",
          level: "info",
          data: {},
        });
      });
    });

    describe("warn", () => {
      it("captures exception for Error warnings", () => {
        const error = new Error("warning");
        const extra = new Map([["context", "data"]]);

        client.warn(error, extra);

        expect(captureExceptionMock).toHaveBeenCalledWith(error, {
          level: "warning",
          extra: { context: "data" },
        });
      });

      it("adds breadcrumb for string warnings", () => {
        client.warn("warning message");

        expect(addBreadcrumbMock).toHaveBeenCalledWith({
          category: "warning",
          message: "warning message",
          level: "warning",
          data: {},
        });
      });
    });

    describe("error", () => {
      it("captures exception for Error objects", () => {
        const error = new Error("error");

        client.error(error);

        expect(captureExceptionMock).toHaveBeenCalledWith(error, {
          level: "error",
          extra: {},
        });
      });

      it("captures message for string errors", () => {
        client.error("error message");

        expect(captureMessageMock).toHaveBeenCalledWith("error message", {
          level: "error",
          extra: {},
        });
      });
    });

    describe("fatal", () => {
      it("captures exception for Error objects with fatal level", () => {
        const error = new Error("fatal error");

        client.fatal(error);

        expect(captureExceptionMock).toHaveBeenCalledWith(error, {
          level: "fatal",
          extra: {},
        });
      });

      it("captures message for string with fatal level", () => {
        client.fatal("fatal message");

        expect(captureMessageMock).toHaveBeenCalledWith("fatal message", {
          level: "fatal",
          extra: {},
        });
      });
    });
  });

  describe("in development mode", () => {
    let client: SentryLogClient;

    beforeEach(() => {
      client = new SentryLogClient("development");
    });

    it("does not log debug messages", () => {
      client.debug("test");

      expect(addBreadcrumbMock).not.toHaveBeenCalled();
    });

    it("does not log info messages", () => {
      client.info("test");

      expect(addBreadcrumbMock).not.toHaveBeenCalled();
    });

    it("does not log warn messages", () => {
      client.warn("test");

      expect(addBreadcrumbMock).not.toHaveBeenCalled();
      expect(captureExceptionMock).not.toHaveBeenCalled();
    });

    it("does not log error messages", () => {
      client.error("test");

      expect(captureExceptionMock).not.toHaveBeenCalled();
      expect(captureMessageMock).not.toHaveBeenCalled();
    });

    it("does not log fatal messages", () => {
      client.fatal("test");

      expect(captureExceptionMock).not.toHaveBeenCalled();
      expect(captureMessageMock).not.toHaveBeenCalled();
    });
  });
});
