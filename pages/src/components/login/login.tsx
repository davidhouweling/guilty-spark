import React from "react";
import { Button } from "../button/button";
import styles from "./login.module.css";

interface LoginProps {
  signInHref: string;
}

export function Login({ signInHref }: LoginProps): React.ReactElement {
  return (
    <div className={styles.card}>
      <h1 className={styles.heading}>Sign In</h1>
      <p className={styles.subtext}>Authenticate with Microsoft to access your saved tracker profile.</p>
      <Button href={signInHref} className={styles.signInButton}>
        Continue With Microsoft
      </Button>
    </div>
  );
}
