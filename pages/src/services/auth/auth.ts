import { isRecord, isString, isNumber, isBoolean } from "@guilty-spark/shared/base/json-readers";
import type { AuthService, MicrosoftStartResponse, SessionResponse } from "./types";

interface AuthServiceOpts {
  apiHost: string;
}

function parseSessionResponse(value: unknown): SessionResponse {
  if (!isRecord(value)) {
    throw new Error("Invalid session payload");
  }

  const { authenticated } = value;
  if (!isBoolean(authenticated)) {
    throw new Error("Invalid session payload");
  }

  const response: SessionResponse = { authenticated };

  const { userId } = value;
  if (isString(userId)) {
    response.userId = userId;
  }

  const { expiresAt } = value;
  if (isNumber(expiresAt)) {
    response.expiresAt = expiresAt;
  }

  const { expired } = value;
  if (isBoolean(expired)) {
    response.expired = expired;
  }

  const { avatarUrl } = value;
  if (isString(avatarUrl)) {
    response.avatarUrl = avatarUrl;
  }

  const { xboxGamertag } = value;
  if (isString(xboxGamertag)) {
    response.xboxGamertag = xboxGamertag;
  }

  return response;
}

function parseMicrosoftStartResponse(value: unknown): MicrosoftStartResponse {
  if (!isRecord(value)) {
    throw new Error("Invalid Microsoft auth response");
  }

  const { authUrl } = value;
  const { state } = value;

  if (!isString(authUrl) || !isString(state)) {
    throw new Error("Invalid Microsoft auth response");
  }

  return { authUrl, state };
}

export class RealAuthService implements AuthService {
  private readonly apiHost: string;

  public constructor({ apiHost }: AuthServiceOpts) {
    this.apiHost = apiHost;
  }

  private buildUrl(path: string): string {
    const baseUrl = this.apiHost.endsWith("/") ? this.apiHost.slice(0, -1) : this.apiHost;
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${baseUrl}${normalizedPath}`;
  }

  private async fetchJson(path: string, init?: RequestInit): Promise<unknown> {
    const headers = new Headers(init?.headers);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(this.buildUrl(path), {
      credentials: "include",
      ...init,
      headers,
    });

    if (!response.ok) {
      const reason = await response.text();
      throw new Error(reason === "" ? "Request failed (" + String(response.status) + ")" : reason);
    }

    return response.json();
  }

  public async getSession(): Promise<SessionResponse> {
    const response = await fetch(this.buildUrl("/auth/session"), {
      credentials: "include",
      method: "GET",
    });

    if (response.status === 401) {
      return { authenticated: false };
    }

    if (!response.ok) {
      const reason = await response.text();
      throw new Error(reason === "" ? "Request failed (" + String(response.status) + ")" : reason);
    }

    const payload = await response.json();
    return parseSessionResponse(payload);
  }

  public async startMicrosoftAuth(redirectTo?: string): Promise<MicrosoftStartResponse> {
    const params = new URLSearchParams();
    if (redirectTo != null && redirectTo !== "") {
      params.set("redirect", redirectTo);
    }

    const path = params.size > 0 ? "/auth/microsoft/start?" + params.toString() : "/auth/microsoft/start";
    const payload = await this.fetchJson(path, { method: "GET" });
    return parseMicrosoftStartResponse(payload);
  }
}
