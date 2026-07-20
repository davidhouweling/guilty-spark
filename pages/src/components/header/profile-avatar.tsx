import React from "react";
import styles from "./profile-menu.module.css";

interface ProfileAvatarProps {
  readonly avatarUrl?: string | null;
  readonly onError?: () => void;
}

export function ProfileAvatar({ avatarUrl = null, onError }: ProfileAvatarProps): React.ReactElement {
  return (
    <span className={styles.profileAvatar} aria-hidden="true">
      {avatarUrl != null && avatarUrl !== "" ? (
        <img src={avatarUrl} className={styles.profileAvatarImage} alt="" onError={onError} />
      ) : (
        <span className={styles.profileAvatarGeneric}>
          <span className={styles.avatarHead} />
          <span className={styles.avatarBody} />
        </span>
      )}
    </span>
  );
}
