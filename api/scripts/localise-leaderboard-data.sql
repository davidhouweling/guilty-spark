-- Seed a clean local leaderboard dataset for the Discord test server.
-- This intentionally clears the existing local leaderboard tables, then inserts
-- a minimal but consistent set of rows for the guild the dev bot can access.
--
-- Run with:
--   npm run localise:db --workspace=api
--
-- The test server is the canonical local guild for leaderboard development:
--   GuildId: 1300001976334946326
--   Queue channel IDs:
--     1352868353869352970 -> #queue
--     1300001976334946329 -> #general
--     1381214814407491737 -> #test-private

DELETE FROM MatchKillMatrix;
DELETE FROM LeaderboardGamePlayers;
DELETE FROM LeaderboardGames;
DELETE FROM LeaderboardSeriesPlayers;
DELETE FROM LeaderboardSeries;
DELETE FROM LeaderboardResetMarkers;
DELETE FROM LeaderboardPosts;
DELETE FROM LeaderboardConfig;
DELETE FROM NeatQueueConfig;

INSERT INTO LeaderboardConfig (
    GuildId,
    EnabledWindowsJson,
    DefaultWindow,
    DefaultMetric,
    MinGamesPlayed,
    UpdatedAt
)
VALUES (
    '1300001976334946326',
    '["1W","1M","3M","6M","12M"]',
    '3M',
    'SERIES_WIN_RATE',
    5,
    unixepoch()
);

INSERT INTO NeatQueueConfig (
    GuildId,
    ChannelId,
    WebhookSecret,
    ResultsChannelId,
    PostSeriesMode,
    PostSeriesChannelId
)
VALUES
    ('1300001976334946326', '1352868353869352970', 'local-secret-queue', '1347857828341350480', 'T', NULL),
    ('1300001976334946326', '1300001976334946329', 'local-secret-general', '1347857828341350480', 'T', NULL),
    ('1300001976334946326', '1381214814407491737', 'local-secret-test', '1347857828341350480', 'T', NULL);

INSERT INTO LeaderboardSeries (
    GuildId,
    QueueNumber,
    QueueChannelId,
    ResultsChannelId,
    StartedAt,
    CompletedAt,
    WinnerTeamIndex,
    SeriesScore,
    Source,
    CreatedAt,
    UpdatedAt
)
VALUES
    ('1300001976334946326', 1001, '1352868353869352970', '1347857828341350480', 1710000000, 1710003600, 0, '2:1', 'neatqueue', unixepoch(), unixepoch()),
    ('1300001976334946326', 1002, '1300001976334946329', '1347857828341350480', 1710007200, 1710010800, 1, '1:2', 'neatqueue', unixepoch(), unixepoch()),
    ('1300001976334946326', 1003, '1381214814407491737', '1347857828341350480', 1710014400, 1710018000, 0, '3:0', 'neatqueue', unixepoch(), unixepoch());

INSERT INTO LeaderboardSeriesPlayers (
    GuildId,
    QueueNumber,
    QueueChannelId,
    XboxXuid,
    DiscordUserId,
    GamertagSnapshot,
    TeamId,
    PresentAtBeginningCount,
    SubstituteInCount,
    SubstituteOutCount,
    GamesPlayedCount,
    SeriesWon,
    CreatedAt
)
VALUES
    ('1300001976334946326', 1001, '1352868353869352970', '2533274000000001', '162624842414292992', 'AlphaOne', 0, 1, 0, 0, 1, 1, unixepoch()),
    ('1300001976334946326', 1001, '1352868353869352970', '2533274000000002', '162624842414292993', 'BravoTwo', 1, 1, 0, 0, 1, 0, unixepoch()),
    ('1300001976334946326', 1002, '1300001976334946329', '2533274000000003', '162624842414292994', 'CharlieThree', 0, 1, 0, 0, 1, 1, unixepoch()),
    ('1300001976334946326', 1002, '1300001976334946329', '2533274000000004', '162624842414292995', 'DeltaFour', 1, 1, 0, 0, 1, 0, unixepoch()),
    ('1300001976334946326', 1003, '1381214814407491737', '2533274000000005', '162624842414292996', 'EchoFive', 0, 1, 0, 0, 1, 1, unixepoch()),
    ('1300001976334946326', 1003, '1381214814407491737', '2533274000000006', '162624842414292997', 'FoxtrotSix', 1, 1, 0, 0, 1, 0, unixepoch());

INSERT INTO LeaderboardGames (
    MatchId,
    GuildId,
    QueueNumber,
    QueueChannelId,
    GameIndexInSeries,
    GameVariantCategory,
    ModeName,
    MapName,
    MapAssetId,
    MapVersionId,
    Team0Score,
    Team1Score,
    StartedAt,
    EndedAt,
    CreatedAt
)
VALUES
    ('match-1001-1', '1300001976334946326', 1001, '1352868353869352970', 1, 0, 'Slayer', 'Argentite', NULL, NULL, 100, 88, 1710000000, 1710001800, unixepoch()),
    ('match-1002-1', '1300001976334946326', 1002, '1300001976334946329', 1, 0, 'Strongholds', 'Recharge', NULL, NULL, 88, 100, 1710007200, 1710009000, unixepoch()),
    ('match-1003-1', '1300001976334946326', 1003, '1381214814407491737', 1, 0, 'Oddball', 'Riptide', NULL, NULL, 100, 75, 1710014400, 1710016200, unixepoch());

INSERT INTO LeaderboardGamePlayers (
    MatchId,
    GuildId,
    QueueNumber,
    QueueChannelId,
    XboxXuid,
    DiscordUserId,
    GamertagSnapshot,
    TeamId,
    PresentAtBeginning,
    GameWon,
    RankInMatch,
    PersonalScore,
    Kills,
    Deaths,
    Assists,
    HeadshotKills,
    Kda,
    Accuracy,
    ShotsHit,
    ShotsFired,
    DamageDealt,
    DamageTaken,
    DamageRatio,
    AvgLifeSeconds,
    AvgDamagePerLife,
    MedalCount,
    MedalPoints,
    MythicMedalCount,
    ObjectiveTimeSeconds,
    ObjectiveTeamContribution,
    ObjectiveStatsJson,
    MedalsJson,
    CreatedAt
)
VALUES
    ('match-1001-1', '1300001976334946326', 1001, '1352868353869352970', '2533274000000001', '162624842414292992', 'AlphaOne', 0, 1, 1, 1, 2500, 18, 9, 7, 7, 1.5, 0.58, 83, 143, 3200, 2100, 1.52, 142.5, 32.0, 2, 260, 0, 120.0, 0.64, '{"objectiveTime":120,"objectiveScore":18}', '[]', unixepoch()),
    ('match-1001-1', '1300001976334946326', 1001, '1352868353869352970', '2533274000000002', '162624842414292993', 'BravoTwo', 1, 1, 0, 2, 2000, 11, 13, 5, 3, 0.85, 0.42, 54, 128, 2600, 3100, 0.84, 116.2, 24.0, 1, 180, 0, 98.0, 0.36, '{"objectiveTime":98,"objectiveScore":12}', '[]', unixepoch()),
    ('match-1002-1', '1300001976334946326', 1002, '1300001976334946329', '2533274000000003', '162624842414292994', 'CharlieThree', 0, 1, 0, 2, 2100, 12, 15, 5, 4, 0.8, 0.46, 59, 129, 2800, 3300, 0.85, 121.4, 22.0, 1, 190, 0, 107.0, 0.41, '{"objectiveTime":107,"objectiveScore":11}', '[]', unixepoch()),
    ('match-1002-1', '1300001976334946326', 1002, '1300001976334946329', '2533274000000004', '162624842414292995', 'DeltaFour', 1, 1, 1, 1, 2400, 17, 12, 6, 6, 1.42, 0.56, 79, 141, 3300, 2700, 1.22, 137.6, 30.0, 2, 220, 0, 128.0, 0.61, '{"objectiveTime":128,"objectiveScore":17}', '[]', unixepoch()),
    ('match-1003-1', '1300001976334946326', 1003, '1381214814407491737', '2533274000000005', '162624842414292996', 'EchoFive', 0, 1, 1, 1, 2600, 19, 8, 8, 8, 2.38, 0.61, 92, 151, 3400, 2200, 1.55, 154.3, 35.0, 3, 310, 1, 140.0, 0.72, '{"objectiveTime":140,"objectiveScore":20}', '[]', unixepoch()),
    ('match-1003-1', '1300001976334946326', 1003, '1381214814407491737', '2533274000000006', '162624842414292997', 'FoxtrotSix', 1, 1, 0, 2, 1800, 10, 14, 4, 2, 0.71, 0.39, 48, 126, 2400, 3000, 0.8, 108.9, 19.0, 0, 90, 0, 90.0, 0.28, '{"objectiveTime":90,"objectiveScore":8}', '[]', unixepoch());
