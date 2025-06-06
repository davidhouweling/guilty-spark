CREATE TABLE IF NOT EXISTS DiscordAssociations (
  DiscordId TEXT PRIMARY KEY NOT NULL,
  XboxId TEXT NOT NULL,
  AssociationReason CHAR(1) CHECK(AssociationReason IN ('C', 'M', 'U', 'D', 'G', '?')) NOT NULL DEFAULT '?',
  AssociationDate INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP,
  GamesRetrievable CHAR(1) CHECK(GamesRetrievable IN ('Y', 'N', '?')) NOT NULL DEFAULT '?',
  DiscordDisplayNameSearched TEXT
);

CREATE TABLE IF NOT EXISTS GuildConfig (
    GuildId TEXT PRIMARY KEY,
    StatsReturn CHAR(1) CHECK(StatsReturn IN ('S', 'A')) NOT NULL DEFAULT 'S',
    Medals CHAR(1) CHECK(Medals IN ('Y', 'N')) NOT NULL DEFAULT 'Y'
);

CREATE TABLE IF NOT EXISTS NeatQueueConfig (
    GuildId TEXT NOT NULL,
    ChannelId TEXT NOT NULL,
    WebhookSecret TEXT NOT NULL,
    ResultsChannelId TEXT NOT NULL,
    PostSeriesMode CHAR(1) CHECK(PostSeriesMode IN ('T', 'M', 'C')) NOT NULL DEFAULT 'T',
    PostSeriesChannelId TEXT,
    PRIMARY KEY (GuildId, ChannelId)
);