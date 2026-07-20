import React, { useEffect, useState } from "react";
import classNames from "classnames";
import type { SessionResponse } from "@guilty-spark/shared/contracts/auth/session";
import { Dropdown } from "../dropdown/dropdown";
import type { AuthService } from "../../services/auth/types";
import { installAuthService } from "../../services/auth/install";
import { ProfileAvatar } from "./profile-avatar";
import styles from "./profile-menu.module.css";

interface ProfileMenuProps {
  readonly apiHost: string;
  readonly iconLinkClassName?: string;
  readonly expectAuthenticated?: boolean;
}

export function ProfileMenu({
  apiHost,
  iconLinkClassName,
  expectAuthenticated = false,
}: ProfileMenuProps): React.ReactElement {
  const [authService, setAuthService] = useState<AuthService | null>(null);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

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
        setAvatarFailed(false);
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

  const isAuthenticated = session?.authenticated ?? expectAuthenticated;
  const avatarUrl = session?.authenticated && !avatarFailed ? (session.avatarUrl ?? null) : null;

  const avatar = (
    <ProfileAvatar
      avatarUrl={avatarUrl}
      onError={() => {
        setAvatarFailed(true);
      }}
    />
  );

  const profileButtonClassName = classNames(styles.profileIconButton, iconLinkClassName);

  if (!isAuthenticated && !expectAuthenticated) {
    return (
      <a href="/login" className={profileButtonClassName} aria-label="Sign in" title="Sign in">
        {avatar}
      </a>
    );
  }

  const gamertag = session?.authenticated ? session.xboxGamertag : undefined;

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
    <Dropdown
      trigger={avatar}
      ariaLabel="Profile menu"
      dropdownWidth={220}
      dropdownHeight={200}
      triggerClassName={profileButtonClassName}
    >
      <div className={styles.profileMenuList}>
        {isAuthenticated ? (
          <>
            {gamertag != null && gamertag !== "" ? <span className={styles.profileMenuLabel}>{gamertag}</span> : null}
            <a href="/individual-tracker" className={styles.profileMenuItem}>
              Individual Tracker
            </a>
            <button type="button" className={styles.profileMenuItem} onClick={handleLogout}>
              Sign out
            </button>
          </>
        ) : (
          <a href="/login" className={styles.profileMenuItem}>
            Sign in
          </a>
        )}
      </div>
    </Dropdown>
  );
}
