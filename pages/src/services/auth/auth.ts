import type { SessionResponse } from "@guilty-spark/shared/contracts/auth/session";
import { sessionContract } from "@guilty-spark/shared/contracts/auth/session";
import type { MicrosoftStartResponse } from "@guilty-spark/shared/contracts/auth/microsoft/start";
import { microsoftStartContract } from "@guilty-spark/shared/contracts/auth/microsoft/start";
import { logoutContract } from "@guilty-spark/shared/contracts/auth/logout";
import { errorContract } from "@guilty-spark/shared/contracts/error";
import type { AuthService } from "./types";

interface AuthServiceOpts {
  readonly apiHost: string;
  readonly onSessionResolved?: (session: SessionResponse) => void;
}

export class RealAuthService implements AuthService {
  private readonly apiHost: string;
  private readonly onSessionResolved: ((session: SessionResponse) => void) | undefined;

  public constructor({ apiHost, onSessionResolved }: AuthServiceOpts) {
    this.apiHost = apiHost;
    this.onSessionResolved = onSessionResolved;
  }

  private buildUrl(path: string): string {
    const baseUrl = this.apiHost.endsWith("/") ? this.apiHost.slice(0, -1) : this.apiHost;
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${baseUrl}${normalizedPath}`;
  }

  private async readError(response: Response): Promise<Error> {
    const body = await response.text();
    if (body !== "") {
      try {
        const parsed = errorContract.safeParse(JSON.parse(body));
        if (parsed.success && parsed.data.error !== "") {
          return new Error(parsed.data.error);
        }
      } catch {
        return new Error(body);
      }
      return new Error(body);
    }

    return new Error(`Request failed (${String(response.status)})`);
  }

  public async getSession(): Promise<SessionResponse> {
    const response = await fetch(this.buildUrl("/auth/session"), {
      credentials: "include",
      method: "GET",
    });

    if (response.status === 401) {
      let unauthenticated: SessionResponse = { authenticated: false };
      try {
        unauthenticated = await sessionContract.fromResponse(response);
      } catch {
        unauthenticated = { authenticated: false };
      }
      this.onSessionResolved?.(unauthenticated);
      return unauthenticated;
    }

    if (!response.ok) {
      throw await this.readError(response);
    }

    const session = await sessionContract.fromResponse(response);
    this.onSessionResolved?.(session);
    return session;
  }

  public async startMicrosoftAuth(redirectTo?: string): Promise<MicrosoftStartResponse> {
    const params = new URLSearchParams();
    if (redirectTo != null && redirectTo !== "") {
      params.set("redirect", redirectTo);
    }

    const path = params.size > 0 ? "/auth/microsoft/start?" + params.toString() : "/auth/microsoft/start";
    const response = await fetch(this.buildUrl(path), {
      credentials: "include",
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw await this.readError(response);
    }

    return microsoftStartContract.fromResponse(response);
  }

  public async logout(): Promise<void> {
    const response = await fetch(this.buildUrl("/auth/logout"), {
      credentials: "include",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw await this.readError(response);
    }

    await logoutContract.fromResponse(response);
  }
}
