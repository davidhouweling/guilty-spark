import { DiscordError } from "../services/discord/discord-error";
import { EndUserError, EndUserErrorType } from "./end-user-error";

const DISCORD_MISSING_PERMISSIONS_CODE = 50013;

function isMissingPermissionsError(error: unknown): error is DiscordError {
  return (
    error instanceof DiscordError &&
    error.httpStatus === 403 &&
    error.restError.code === DISCORD_MISSING_PERMISSIONS_CODE
  );
}

export function toMissingPermissionsError(
  error: unknown,
  { action, permissions }: { action: string; permissions: string[] },
): EndUserError | undefined {
  if (!isMissingPermissionsError(error)) {
    return undefined;
  }

  const permissionsList = permissions.map((permission) => `- **${permission}**`).join("\n");
  const permissionsNoun = permissions.length === 1 ? "permission" : "permissions";

  return new EndUserError(
    `Guilty Spark was unable to ${action} because it is missing Discord permissions.\n\nGrant Guilty Spark the following ${permissionsNoun} in this channel, then use the Retry button below:\n${permissionsList}`,
    {
      title: "Missing Discord permissions",
      errorType: EndUserErrorType.WARNING,
      innerError: error,
      actions: ["retry"],
    },
  );
}
