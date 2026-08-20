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
          value={query}
          placeholder="Search gamertag"
          onChange={(event): void => {
            setQuery(event.currentTarget.value);
          }}
        />
        <Button type="submit" disabled={query.trim() === ""}>
          Search
        </Button>
      </form>
    </Container>
  );
}
