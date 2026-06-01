import type { UserTokenProviderOpts } from "../user-token-provider";
import { UserTokenProvider } from "../user-token-provider";
import { aFakeAuthServiceWith } from "../../auth/fakes/auth.fake";
import { aFakeXboxServiceWith } from "../../xbox/fakes/xbox.fake";

export function aFakeUserTokenProviderWith(opts: Partial<UserTokenProviderOpts> = {}): UserTokenProvider {
  return new UserTokenProvider({
    authService: opts.authService ?? aFakeAuthServiceWith(),
    xboxService: opts.xboxService ?? aFakeXboxServiceWith(),
  });
}
