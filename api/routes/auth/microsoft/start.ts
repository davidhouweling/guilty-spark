import z from "zod";
import { createNoStoreJsonResponse } from "../../../base/response";
import { addCorsHeaders } from "../../../base/cors";
import type { RoutesRegisterHandler } from "../../base/types";
import { parseQueryParams } from "../../../base/request-parsing";

const authStartQuerySchema = z.object({
  redirect: z.string().optional(),
});

export const authMicrosoftStartRoute: RoutesRegisterHandler = (router, installServices) => {
  router.get("/auth/microsoft/start", async (request, env: Env): Promise<Response> => {
    const services = installServices({ env });

    try {
      const { authService } = services;
      const url = new URL(request.url);
      const parsedQuery = parseQueryParams(url, authStartQuerySchema, "Failed to generate authorization URL");
      if (!parsedQuery.success) {
        return addCorsHeaders(parsedQuery.response, request, true);
      }

      const { redirect } = parsedQuery.data;

      const { url: authorizationUrl, state, codeVerifier } = await authService.generateAuthorizationUrl();

      const response = createNoStoreJsonResponse(
        {
          authUrl: authorizationUrl.toString(),
          state,
        },
        200,
      );

      await authService.setPkceStateCookie(response, {
        codeVerifier,
        state,
        issuedAt: Date.now(),
        redirectTo: redirect ?? "/",
      });

      return addCorsHeaders(response, request, true);
    } catch (error) {
      services.logService.error(error as Error, new Map([["message", "Auth start error"]]));
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
