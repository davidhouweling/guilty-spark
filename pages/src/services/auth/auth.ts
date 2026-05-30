import type { SessionResponse } from "@guilty-spark/shared/contracts/auth/session";
import { sessionContract } from "@guilty-spark/shared/contracts/auth/session";
import { logoutContract } from "@guilty-spark/shared/contracts/auth/logout";
import { errorContract } from "@guilty-spark/shared/contracts/error";
import type { AuthService } from "./types";

interface AuthServiceOpts {
  readonly apiHost: string;
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
      return unauthenticated;
    }

    if (!response.ok) {
      throw await this.readError(response);
    }

    return sessionContract.fromResponse(response);
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
