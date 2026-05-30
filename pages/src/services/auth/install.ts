import { getMode } from "../mode";
import { RealAuthService } from "./auth";
import type { AuthService } from "./types";

export async function installAuthService(apiHost: string): Promise<AuthService> {
  if (getMode() === "FAKE") {
    const { installFakeServices } = await import("../fakes/install.fake");
    const { authService } = await installFakeServices();
    return authService;
  }

  return new RealAuthService({ apiHost });
}
