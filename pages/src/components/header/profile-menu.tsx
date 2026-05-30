import React, { useEffect, useState } from "react";
import type { SessionResponse } from "@guilty-spark/shared/contracts/auth/session";
import { Dropdown } from "../dropdown/dropdown";
import type { AuthService } from "../../services/auth/types";
import { installAuthService } from "../../services/auth/install";
import styles from "./profile-menu.module.css";

interface ProfileMenuProps {
  readonly apiHost: string;
}

export function ProfileMenu({ apiHost }: ProfileMenuProps): React.ReactElement {
  const [authService, setAuthService] = useState<AuthService | null>(null);
  const [session, setSession] = useState<SessionResponse>({ authenticated: false });

  useEffect(() => {
    let isCancelled = false;

    installAuthService(apiHost)
      .then((service): Promise<SessionResponse> | undefined => {
        if (isCancelled) {
          return undefined;
        }
        setAuthService(service);
        return service.getSession();
      })
      .then((resolvedSession) => {
        if (isCancelled || resolvedSession == null) {
          return;
        }
        setSession(resolvedSession);
      })
      .catch(() => {
        if (!isCancelled) {
          setSession({ authenticated: false });
        }
      });

    return (): void => {
      isCancelled = true;
    };
  }, [apiHost]);

  const avatarUrl = session.authenticated ? (session.avatarUrl ?? null) : null;

  const avatar = (
    <span className={styles.profileAvatar} aria-hidden="true">
      {avatarUrl != null && avatarUrl !== "" ? (
        <img src={avatarUrl} className={styles.profileAvatarImage} alt="" />
      ) : (
        <span className={styles.profileAvatarGeneric}>
          <span className={styles.avatarHead} />
          <span className={styles.avatarBody} />
        </span>
      )}
    </span>
  );

  if (!session.authenticated) {
    return (
      <a href="/login" className={styles.profileIconButton} aria-label="Sign in" title="Sign in">
        {avatar}
      </a>
    );
  }

  const gamertag = session.xboxGamertag;

  const handleLogout = (): void => {
    void (async (): Promise<void> => {
      try {
        await authService?.logout();
      } finally {
        window.location.href = "/login";
      }
    })();
  };

  return (
    <Dropdown trigger={avatar} ariaLabel="Profile menu" dropdownWidth={220} dropdownHeight={180}>
      <div className={styles.profileMenuList}>
        {gamertag != null && gamertag !== "" ? <span className={styles.profileMenuLabel}>{gamertag}</span> : null}
        <button type="button" className={styles.profileMenuItem} onClick={handleLogout}>
          Sign out
        </button>
      </div>
    </Dropdown>
  );
}
