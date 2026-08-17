-- Add per-game objective-time measures for objective leaderboard metrics.
-- Existing rows intentionally remain NULL and are excluded from objective metrics
-- until the historical reconciliation/backfill work planned for PR16 populates them.
ALTER TABLE LeaderboardGamePlayers ADD COLUMN ObjectiveTimeSeconds REAL;
ALTER TABLE LeaderboardGamePlayers ADD COLUMN ObjectiveTeamContribution REAL;
ALTER TABLE LeaderboardGamePlayers ADD COLUMN ObjectiveGameContribution REAL;
