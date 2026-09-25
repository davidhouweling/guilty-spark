export type LoginStatusAuthState = "loading" | "unauthenticated" | "authenticated";

export interface LoginStatusSectionProps {
  readonly authState: LoginStatusAuthState;
  readonly gamertag: string | null;
  readonly avatarUrl: string | null;
  readonly signInHref: string;
  readonly errorMessage?: string | null | undefined;
}
