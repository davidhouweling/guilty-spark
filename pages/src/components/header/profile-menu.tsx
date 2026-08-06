import React, { useEffect, useRef, useState } from "react";
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
  readonly signInLinkClassName?: string;
}

export function ProfileMenu({
  apiHost,
  iconLinkClassName,
  signInLinkClassName,
}: ProfileMenuProps): React.ReactElement {
  const [authService, setAuthService] = useState<AuthService | null>(null);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const isDisposedRef = useRef(false);

  useEffect(() => {
    isDisposedRef.current = false;
    const isDisposed = (): boolean => isDisposedRef.current;

    async function installAndLoadSession(): Promise<void> {
      try {
        const service = await installAuthService(apiHost);
        if (isDisposed()) {
          return;
        }
        setAuthService(service);

        const resolvedSession = await service.getSession();
        if (isDisposed()) {
          return;
        }

        setAvatarFailed(false);
        setSession(resolvedSession);
      } catch {
        if (isDisposed()) {
          return;
        }
        setSession({ authenticated: false });
      }
    }

    void installAndLoadSession();

    return (): void => {
      isDisposedRef.current = true;
    };
  }, [apiHost]);

  const hasAuthenticatedSession = session?.authenticated === true;
  const showDropdown = hasAuthenticatedSession || session == null;
  const avatarUrl = hasAuthenticatedSession && !avatarFailed ? (session.avatarUrl ?? null) : null;

  const avatar = (
    <ProfileAvatar
      avatarUrl={avatarUrl}
      onError={() => {
        setAvatarFailed(true);
      }}
    />
  );

  const profileButtonClassName = classNames(styles.profileIconButton, iconLinkClassName);
  const signInClassName = signInLinkClassName ?? profileButtonClassName;

  if (!showDropdown) {
    return (
      <a href="/login" className={signInClassName} aria-label="Sign in" title="Sign in">
        {avatar}
      </a>
    );
  }

  const gamertag = hasAuthenticatedSession ? session.xboxGamertag : undefined;

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
        {hasAuthenticatedSession ? (
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
