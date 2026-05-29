import type { SessionResponse } from "@guilty-spark/shared/contracts/auth/session";
import type { MicrosoftStartResponse } from "@guilty-spark/shared/contracts/auth/microsoft/start";

export interface AuthService {
  getSession(): Promise<SessionResponse>;
  startMicrosoftAuth(redirectTo?: string): Promise<MicrosoftStartResponse>;
  logout(): Promise<void>;
}
