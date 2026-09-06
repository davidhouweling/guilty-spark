-- REMOVE THIS FILE FROM THE PR BEFORE MERGING.
-- This is a manual, one-off operational script, not a repo-tracked migration -- run it once
-- against production (command below) as part of shipping this feature, then delete it.
--
-- One-off backfill: set autoStart=true in StyleFlagsJson for existing StreamerViewSettings
-- rows that predate the auto-start-individual-tracker-on-overlay-use feature.
--
-- Not required for correctness: withStreamerViewSettingsDefaults() already treats a missing
-- autoStart key as true, and rows created after this feature shipped get it explicitly.
-- This just makes the stored JSON reflect the default explicitly for existing rows.
--
-- Run against production:
--   npx wrangler d1 execute prod-db-guilty-spark --remote --file=scripts/backfill-streamer-view-settings-auto-start.sql
-- Or against staging:
--   npx wrangler d1 execute staging-db-guilty-spark --remote --file=scripts/backfill-streamer-view-settings-auto-start.sql

UPDATE StreamerViewSettings
SET StyleFlagsJson = json_set(StyleFlagsJson, '$.autoStart', json('true'))
WHERE json_extract(StyleFlagsJson, '$.autoStart') IS NULL;
