import type { SessionResponse } from "@guilty-spark/shared/contracts/auth/session";

export interface AuthService {
  getSession(): Promise<SessionResponse>;
  logout(): Promise<void>;
}
