import { createNoStoreJsonResponse } from "../../../base/response";
import { addCorsHeaders } from "../../../base/cors";
import type { RoutesRegisterHandler } from "../../base/types";

export const authMicrosoftStartRoute: RoutesRegisterHandler = (router, installServices) => {
  router.get("/auth/microsoft/start", async (request, env: Env): Promise<Response> => {
    try {
      const services = installServices({ env });
      const { authService } = services;

      const { url, state, codeVerifier } = await authService.generateAuthorizationUrl();

      const response = createNoStoreJsonResponse(
        {
          authUrl: url.toString(),
          state,
        },
        200,
      );

      await authService.setPkceStateCookie(response, {
        codeVerifier,
        state,
        issuedAt: Date.now(),
      });

      return addCorsHeaders(response, request, true);
    } catch (error) {
      console.error("Auth start error:", error);
      return addCorsHeaders(
        createNoStoreJsonResponse(
          {
            error: "Failed to generate authorization URL",
          },
          500,
        ),
        request,
        true,
      );
    }
  });
};
