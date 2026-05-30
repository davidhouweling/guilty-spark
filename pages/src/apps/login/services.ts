import type { AuthService } from "../../services/auth/types";
import { installAuthService } from "../../services/auth/install";

export interface Services {
  readonly authService: AuthService;
}

export async function installServices(apiHost: string): Promise<Services> {
  return { authService: await installAuthService(apiHost) };
}
