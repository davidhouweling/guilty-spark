import React, { useState } from "react";
import { Button } from "../button/button";
import { Container } from "../container/container";
import { Input } from "../input/input";
import styles from "./gamertag-search-box.module.css";

interface GamertagSearchBoxProps {
  readonly initialGamertag: string;
}

function navigateToGamertag(gamertag: string): void {
  const trimmed = gamertag.trim();
  if (trimmed === "") {
    return;
  }
  window.location.assign(`/matches/${encodeURIComponent(trimmed)}`);
}

export function GamertagSearchBox({ initialGamertag }: GamertagSearchBoxProps): React.ReactElement {
  const [query, setQuery] = useState(initialGamertag);

  return (
    <Container>
      <form
        className={styles.searchRow}
        onSubmit={(event): void => {
          event.preventDefault();
          navigateToGamertag(query);
        }}
      >
        <Input
          label="Gamertag"
          labelClassName={styles.srOnly}
          value={query}
          placeholder="Search a gamertag..."
          onChange={(event): void => {
            setQuery(event.currentTarget.value);
          }}
        />
        <Button
          type="submit"
          size="small"
          className={styles.searchButton}
          disabled={query.trim() === ""}
          icon={
            <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true" className={styles.searchIcon}>
              <circle cx="7" cy="7" r="5" />
              <path d="M11 11 15 15" />
            </svg>
          }
        >
          <span className={styles.srOnly}>Search</span>
        </Button>
      </form>
    </Container>
  );
}
