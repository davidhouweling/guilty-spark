-- Add derived medal aggregates to existing leaderboard game-player rows.
-- Existing rows intentionally start at zero and are corrected by the historical
-- reconciliation/backfill work planned for PR16.
ALTER TABLE LeaderboardGamePlayers ADD COLUMN GameWon INTEGER NOT NULL DEFAULT 0 CHECK (GameWon IN (0, 1));
ALTER TABLE LeaderboardGamePlayers ADD COLUMN MedalCount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE LeaderboardGamePlayers ADD COLUMN MedalPoints INTEGER NOT NULL DEFAULT 0;
ALTER TABLE LeaderboardGamePlayers ADD COLUMN MythicMedalCount INTEGER NOT NULL DEFAULT 0;
