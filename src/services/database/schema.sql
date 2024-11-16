DROP TABLE IF EXISTS DiscordAssociations;
CREATE TABLE IF NOT EXISTS DiscordAssociations (
  DiscordId TEXT PRIMARY KEY NOT NULL,
  XboxId TEXT NOT NULL,
  AssociationReason CHAR(1) CHECK(AssociationReason IN ('C', 'M', 'U', 'D', 'G', '?')) NOT NULL DEFAULT '?',
  AssociationDate INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP,
  GamesRetrievable CHAR(1) CHECK(GamesRetrievable IN ('Y', 'N', '?')) NOT NULL DEFAULT '?'
);
