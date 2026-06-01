import { HaloInfiniteClient, StaticXstsTicketTokenSpartanTokenProvider } from "halo-infinite-api";
import {
  buildHaloProxyCacheControl,
  isHaloProxyOperationName,
  parseHaloProxyArgsFromUrl,
  resolveHaloProxyOperation,
} from "@guilty-spark/shared/halo/halo-infinite-proxy-operations";
import type { HaloProxyOperationName } from "@guilty-spark/shared/halo/halo-infinite-proxy-operations";
import type { Services } from "../../services/install";
import type { SessionTokenPayload } from "../../services/auth/types";
import type { RoutesRegisterHandler } from "../base/types";

type InstallServices = ({ env }: { env: Env }) => Services;

interface ResolvedHaloProxyClient {
  readonly client: HaloInfiniteClient;
}

type ResolveHaloProxyClientResult =
  | { readonly ok: true; readonly resolved: ResolvedHaloProxyClient }
  | { readonly ok: false; readonly response: Response };

async function resolveOwnerClient(request: Request, services: Services): Promise<HaloInfiniteClient | null> {
  const gamertag = new URL(request.url).searchParams.get("gamertag");
  if (gamertag == null || gamertag === "") {
    return null;
  }

  try {
    const identity = await services.databaseService.findActiveXboxIdentityByGamertag(gamertag);
    if (identity == null) {
      return null;
    }
    return await services.userTokenProvider.getClientForUser(identity.UserId);
  } catch {
    return null;
  }
}

async function resolveHaloProxyClient(request: Request, services: Services): Promise<ResolveHaloProxyClientResult> {
  const session = await services.authService.validateSession(request);

  if (session !== null) {
    let microsoftAccessToken = session.accessToken;

    if (session.isExpired) {
      let refreshedSessionPayload: SessionTokenPayload | null;
      try {
        refreshedSessionPayload = await services.authService.refreshSession(session);
      } catch {
        const response = new Response("Unauthorized", { status: 401 });
        services.authService.clearSessionCookie(response);
        return { ok: false, response };
      }

      if (refreshedSessionPayload === null) {
        const response = new Response("Unauthorized", { status: 401 });
        services.authService.clearSessionCookie(response);
        return { ok: false, response };
      }

      microsoftAccessToken = refreshedSessionPayload.accessToken;
    }

    const xstsTokenInfo = await services.xboxService.exchangeMicrosoftAccessTokenForXstsToken(microsoftAccessToken);
    const client = new HaloInfiniteClient(new StaticXstsTicketTokenSpartanTokenProvider(xstsTokenInfo.XSTSToken));
    return { ok: true, resolved: { client } };
  }

  const ownerClient = await resolveOwnerClient(request, services);
  if (ownerClient != null) {
    return { ok: true, resolved: { client: ownerClient } };
  }

  return { ok: true, resolved: { client: services.haloInfiniteClient } };
}

function toCacheKeyRequest(request: Request): Request {
  const url = new URL(request.url);
  if (!url.searchParams.has("gamertag")) {
    return request;
  }
  url.searchParams.delete("gamertag");
  return new Request(url.toString(), request);
}

function readHaloProxyArgs(request: Request): { ok: true; args: unknown[] } | { ok: false; response: Response } {
  const parsed = parseHaloProxyArgsFromUrl(new URL(request.url));
  if (!parsed.ok) {
    return { ok: false, response: new Response(parsed.error, { status: 400 }) };
  }
  return { ok: true, args: parsed.args };
}

function callHaloProxyOperation(
  client: HaloInfiniteClient,
  operation: HaloProxyOperationName,
  args: unknown[],
): unknown {
  const method: (...callArgs: never[]) => unknown = client[operation];
  return Reflect.apply(method, client, args);
}

export const haloProxyRoutesRegisterHandler: RoutesRegisterHandler = (router, installServices: InstallServices) => {
  router.all("/proxy/halo-infinite/:operation", async (request, env: Env, ctx: ExecutionContext) => {
    try {
      const { operation } = request.params;
      if (operation == null || !isHaloProxyOperationName(operation)) {
        return new Response(`Operation not found: ${operation ?? ""}`, { status: 404 });
      }

      const operationDefinition = resolveHaloProxyOperation(operation);
      if (operationDefinition === null) {
        return new Response(`Operation not found: ${operation}`, { status: 404 });
      }

      if (request.method !== operationDefinition.httpMethod) {
        return new Response("Method not allowed", { status: 405 });
      }

      const cache = caches.default;
      const cacheKeyRequest = toCacheKeyRequest(request);
      const cached = await cache.match(cacheKeyRequest);
      if (cached) {
        return cached;
      }

      const argsResult = readHaloProxyArgs(request);
      if (!argsResult.ok) {
        return argsResult.response;
      }

      const services = installServices({ env });
      const clientResult = await resolveHaloProxyClient(request, services);
      if (!clientResult.ok) {
        return clientResult.response;
      }

      const result = await callHaloProxyOperation(clientResult.resolved.client, operation, argsResult.args);

      const response = Response.json(result, {
        status: 200,
        headers: { "Cache-Control": buildHaloProxyCacheControl(operationDefinition) },
      });

      ctx.waitUntil(cache.put(cacheKeyRequest, response.clone()));

      return response;
    } catch (error) {
      console.error("Halo proxy error:", error instanceof Error ? error.message : String(error));
      return Response.json({ error: "Proxy request failed" }, { status: 500 });
    }
  });
};
