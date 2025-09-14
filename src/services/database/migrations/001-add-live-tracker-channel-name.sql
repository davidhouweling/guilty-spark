-- Migration: Add NeatQueueInformerLiveTrackingChannelName column to GuildConfig table
-- This adds support for updating channel names with series scores during live tracking

-- Add the new column with default value 'N' (disabled)
ALTER TABLE GuildConfig 
ADD COLUMN NeatQueueInformerLiveTrackingChannelName CHAR(1) 
CHECK(NeatQueueInformerLiveTrackingChannelName IN ('Y', 'N')) 
NOT NULL DEFAULT 'N';

-- Verify the migration by checking the table structure
-- Run this query to confirm the column was added:
-- PRAGMA table_info(GuildConfig);
