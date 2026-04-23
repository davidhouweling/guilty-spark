export interface SessionResponse {
  authenticated: boolean;
  userId?: string;
  expiresAt?: number;
  expired?: boolean;
  avatarUrl?: string;
  xboxGamertag?: string;
  spartanToken?: string;
}

export interface MicrosoftStartResponse {
  authUrl: string;
  state: string;
}

export interface AuthService {
  getSession(): Promise<SessionResponse>;
  startMicrosoftAuth(redirectTo?: string): Promise<MicrosoftStartResponse>;
}
