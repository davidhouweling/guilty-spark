import type {
  LiveTrackerMatchSummary,
  LiveTrackerPlayer,
  LiveTrackerStateMessage,
  LiveTrackerTeam,
} from "../live-tracker/types.mts";

const players: LiveTrackerPlayer[] = [
  {
    id: "1189356946680188960",
    discordUsername: "iSydneyzz",
  },
  {
    id: "505426249007497236",
    discordUsername: "Polqi",
  },
  {
    id: "1101793401311080480",
    discordUsername: "SiAsami",
  },
  {
    id: "365374177181696010",
    discordUsername: "fistcats69420",
  },
  {
    id: "237222473500852224",
    discordUsername: "soundmanD",
  },
  {
    id: "138439874402320384",
    discordUsername: "jugipaws",
  },
  {
    id: "760314688176128011",
    discordUsername: "happyjomo_",
  },
  {
    id: "1005240154417549402",
    discordUsername: "TPG Driift (Upgraded)",
  },
];

const teams: LiveTrackerTeam[] = [
  {
    name: "Eagle",
    playerIds: ["1189356946680188960", "505426249007497236", "1101793401311080480", "365374177181696010"],
  },
  {
    name: "Cobra",
    playerIds: ["237222473500852224", "138439874402320384", "760314688176128011", "1005240154417549402"],
  },
];

const discoveredMatches: LiveTrackerMatchSummary[] = [
  {
    matchId: "85022d98-5829-4da2-85ae-32b8cb48bbdd",
    gameTypeAndMap: "Oddball: Vacancy - Ranked",
    gameType: "Oddball",
    gameTypeIconUrl: "data:,",
    gameTypeThumbnailUrl: "data:,",
    gameMap: "Vacancy - Ranked",
    gameMapThumbnailUrl: "data:,",
    duration: "7m 57s",
    gameScore: "0:2 (18:165)",
    endTime: "2025-12-24T02:59:47.384Z",
  },
  {
    matchId: "4ddc5187-d08d-48fc-96a3-8a490e577795",
    gameTypeAndMap: "Oddball: Vacancy - Ranked",
    gameType: "Oddball",
    gameTypeIconUrl: "data:,",
    gameTypeThumbnailUrl: "data:,",
    gameMap: "Vacancy - Ranked",
    gameMapThumbnailUrl: "data:,",
    duration: "4m 58s",
    gameScore: "0:1 (69:100)",
    endTime: "2025-12-24T03:07:37.120Z",
  },
  {
    matchId: "d127af7f-079c-4b28-a3ae-6e1bcdd44438",
    gameTypeAndMap: "King of the Hill: Live Fire - Ranked",
    gameType: "King of the Hill",
    gameTypeIconUrl: "data:,",
    gameTypeThumbnailUrl: "data:,",
    gameMap: "Live Fire - Ranked",
    gameMapThumbnailUrl: "data:,",
    duration: "13m 47s",
    gameScore: "4:3",
    endTime: "2025-12-24T03:25:55.588Z",
  },
  {
    matchId: "688cc0ac-2266-40e2-a3dd-a1f5b992f046",
    gameTypeAndMap: "Capture the Flag: Fortress - Ranked",
    gameType: "Capture the Flag",
    gameTypeIconUrl: "data:,",
    gameTypeThumbnailUrl: "data:,",
    gameMap: "Fortress - Ranked",
    gameMapThumbnailUrl: "data:,",
    duration: "13m 40s",
    gameScore: "1:2",
    endTime: "2025-12-24T03:41:30.534Z",
  },
];

export const sampleLiveTrackerStateMessage: LiveTrackerStateMessage = {
  type: "state",
  data: {
    guildId: "1238795949266964560",
    guildName: "Guilty Spark Testing",
    channelId: "1453215131843563550",
    queueNumber: 6038,
    status: "active",
    players,
    teams,
    substitutions: [],
    discoveredMatches,
    lastUpdateTime: "2025-12-24T03:52:10.185Z",
  },
  timestamp: "2025-12-24T03:52:10.687Z",
};
