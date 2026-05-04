import React, { useEffect, useState } from "react";
import { Dropdown } from "../dropdown/dropdown";
import styles from "./profile-menu.module.css";

interface ProfileMenuProps {
  readonly apiHost: string;
}

interface SessionPayload {
  authenticated?: boolean;
  avatarUrl?: string;
}

export function ProfileMenu({ apiHost }: ProfileMenuProps): React.ReactElement {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    const loadSession = async (): Promise<void> => {
      try {
        const response = await fetch(`${apiHost}/auth/session`, {
          credentials: "include",
          method: "GET",
        });

        if (!response.ok) {
          setIsAuthenticated(false);
          setAvatarUrl(null);
          return;
        }

        const payload = await response.json<SessionPayload>();
        const authenticated = payload.authenticated === true;

        setIsAuthenticated(authenticated);
        setAvatarUrl(authenticated ? (payload.avatarUrl ?? null) : null);
      } catch {
        setIsAuthenticated(false);
        setAvatarUrl(null);
      }
    };

    void loadSession();
  }, [apiHost]);

  const avatar = (
    <span className={styles.profileAvatar} aria-hidden="true">
      {avatarUrl != null && avatarUrl !== "" ? (
        <img src={avatarUrl} className={styles.profileAvatarImage} alt="" />
      ) : (
        <span className={styles.profileAvatarGeneric}>
          <span className={styles.avatarHead}></span>
          <span className={styles.avatarBody}></span>
        </span>
      )}
    </span>
  );

  if (!isAuthenticated) {
    return (
      <button
        type="button"
        className={styles.profileIconButton}
        aria-label="Login"
        title="Login"
        onClick={(): void => {
          window.location.href = "/login";
        }}
      >
        {avatar}
      </button>
    );
  }

  return (
    <Dropdown
      trigger={avatar}
      ariaLabel="Profile menu"
      dropdownWidth={220}
      dropdownHeight={180}
      triggerClassName={styles.profileIconButton}
      dropdownClassName={styles.profileDropdown}
      containerClassName={styles.profileDropdownContainer}
    >
      <div className={styles.profileMenuList}>
        <a href="/individual-tracker" className={styles.profileMenuItem}>
          Individual Tracker
        </a>
        <button
          type="button"
          className={styles.profileMenuItem}
          onClick={(): void => {
            void (async (): Promise<void> => {
              try {
                await fetch(`${apiHost}/auth/logout`, {
                  credentials: "include",
                  method: "POST",
                });
              } finally {
                window.location.href = "/login";
              }
            })();
          }}
        >
          Log Out
        </button>
      </div>
    </Dropdown>
  );
}
