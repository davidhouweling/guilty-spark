import { describe, expect, it } from "vitest";
import { EndUserErrorType } from "../end-user-error";
import { toMissingPermissionsError } from "../missing-permissions-error";
import { DiscordError } from "../../services/discord/discord-error";

describe("toMissingPermissionsError()", () => {
  it("returns an end user error listing the required permissions", () => {
    const error = toMissingPermissionsError(new DiscordError(403, { code: 50013, message: "Missing Permissions" }), {
      action: "post the series stats",
      permissions: ["Send Messages", "Send Messages in Threads"],
    });

    expect(error?.title).toBe("Missing Discord permissions");
    expect(error?.errorType).toBe(EndUserErrorType.WARNING);
    expect(error?.actions).toEqual(["retry"]);
    expect(error?.endUserMessage).toContain("post the series stats");
    expect(error?.endUserMessage).toContain("- **Send Messages**\n- **Send Messages in Threads**");
  });

  it("uses the singular noun for a single permission", () => {
    const error = toMissingPermissionsError(new DiscordError(403, { code: 50013, message: "Missing Permissions" }), {
      action: "create a thread for the series stats",
      permissions: ["Create Public Threads"],
    });

    expect(error?.endUserMessage).toContain("the following permission in this channel");
  });

  it("returns undefined for a forbidden response that is not a missing permissions error", () => {
    const error = toMissingPermissionsError(new DiscordError(403, { code: 20024, message: "Under minimum age" }), {
      action: "post the series stats",
      permissions: ["Send Messages"],
    });

    expect(error).toBeUndefined();
  });

  it("returns undefined for non-Discord errors", () => {
    const error = toMissingPermissionsError(new Error("boom"), {
      action: "post the series stats",
      permissions: ["Send Messages"],
    });

    expect(error).toBeUndefined();
  });
});
