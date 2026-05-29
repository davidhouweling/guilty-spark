import { RealAuthService } from "../../services/auth/auth";
import type { AuthService } from "../../services/auth/types";
import { getMode } from "../../services/mode";

export interface Services {
  readonly authService: AuthService;
}

export async function installServices(apiHost: string): Promise<Services> {
  const mode = getMode();

  if (mode === "FAKE") {
    return import("../../services/fakes/install.fake").then(async ({ installFakeServices }) => {
      const { authService } = await installFakeServices();
      return { authService };
    });
  }

  return {
    authService: new RealAuthService({ apiHost }),
  };
}
