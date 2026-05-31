import { parseQueryParams } from "@guilty-spark/shared/base/request-parsing";
import { authStartQuerySchema } from "@guilty-spark/shared/contracts/auth/microsoft/start";
import { errorContract } from "@guilty-spark/shared/contracts/error";
import type { RoutesRegisterHandler } from "../../base/types";

export const authMicrosoftStartRoute: RoutesRegisterHandler = (router, installServices) => {
  router.get("/auth/microsoft/start", async (request, env: Env): Promise<Response> => {
    const services = installServices({ env });

    try {
      const { authService } = services;
      const url = new URL(request.url);
      const parsedQuery = parseQueryParams(url, authStartQuerySchema, "Failed to generate authorization URL");
      if (!parsedQuery.success) {
        return parsedQuery.response;
      }

      const { redirect } = parsedQuery.data;

      const { url: authorizationUrl, state, codeVerifier } = await authService.generateAuthorizationUrl();

      const response = new Response(null, {
        status: 302,
        headers: {
          Location: authorizationUrl.toString(),
          "Cache-Control": "no-store",
        },
      });

      await authService.setPkceStateCookie(response, {
        codeVerifier,
        state,
        issuedAt: Date.now(),
        redirectTo: redirect ?? "/",
      });

      return response;
    } catch (error) {
      services.logService.error(error as Error, new Map([["message", "Auth start error"]]));
      return errorContract.toResponse(
        { error: "Failed to generate authorization URL" },
        { status: 500, noStore: true },
      );
    }
  });
};
