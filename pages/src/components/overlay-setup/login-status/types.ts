export type LoginStatusAuthState = "loading" | "unauthenticated" | "authenticated" | "error";

export interface LoginStatusSectionProps {
  readonly authState: LoginStatusAuthState;
  readonly gamertag: string | null;
  readonly avatarUrl: string | null;
  readonly signInHref: string;
  readonly errorMessage?: string | null | undefined;
  readonly onRetry?: (() => void) | undefined;
}
