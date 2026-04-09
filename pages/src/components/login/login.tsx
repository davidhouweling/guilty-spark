import React from "react";
import { Button } from "../button/button";
import styles from "./login.module.css";

interface LoginProps {
  onSignIn: () => void;
  errorMessage: string | null;
}

export function Login({ onSignIn, errorMessage }: LoginProps): React.ReactElement {
  return (
    <div className={styles.card}>
      <h1 className={styles.heading}>Sign In</h1>
      <p className={styles.subtext}>Authenticate with Microsoft to access your saved tracker profile.</p>
      <Button onClick={onSignIn} className={styles.signInButton}>
        Continue With Microsoft
      </Button>
      {errorMessage !== null && <p className={styles.errorText}>{errorMessage}</p>}
    </div>
  );
}
