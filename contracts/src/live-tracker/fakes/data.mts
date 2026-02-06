import type { GameVariantCategory, MatchStats } from "halo-infinite-api";
import type {
  LiveTrackerMatchSummary,
  LiveTrackerPlayer,
  LiveTrackerStateMessage,
  LiveTrackerTeam,
} from "../types.mts";
import match1 from "./85022d98-5829-4da2-85ae-32b8cb48bbdd.json" with { type: "json" };
import match2 from "./4ddc5187-d08d-48fc-96a3-8a490e577795.json" with { type: "json" };
import match3 from "./d127af7f-079c-4b28-a3ae-6e1bcdd44438.json" with { type: "json" };
import match4 from "./688cc0ac-2266-40e2-a3dd-a1f5b992f046.json" with { type: "json" };

const matchStats1 = match1 as unknown as MatchStats<GameVariantCategory.MultiplayerOddball>;
const matchStats2 = match2 as unknown as MatchStats<GameVariantCategory.MultiplayerOddball>;
const matchStats3 = match3 as unknown as MatchStats<GameVariantCategory.MultiplayerKingOfTheHill>;
const matchStats4 = match4 as unknown as MatchStats<GameVariantCategory.MultiplayerCtf>;

const players: LiveTrackerPlayer[] = [
  { id: "1189356946680188960", discordUsername: "isydneyzz" },
  { id: "505426249007497236", discordUsername: "polqi" },
  { id: "1101793401311080480", discordUsername: "siasami" },
  { id: "365374177181696010", discordUsername: "fistcats69420" },
  { id: "237222473500852224", discordUsername: "soundmand" },
  { id: "138439874402320384", discordUsername: "jugipaws" },
  { id: "760314688176128011", discordUsername: "happyjomo_" },
  { id: "1005240154417549402", discordUsername: "dctr_drift" },
];

const teams: LiveTrackerTeam[] = [
  {
    name: "Team 1",
    playerIds: ["1189356946680188960", "505426249007497236", "1101793401311080480", "365374177181696010"],
  },
  {
    name: "Team 2",
    playerIds: ["237222473500852224", "138439874402320384", "760314688176128011", "1005240154417549402"],
  },
];

const samplePlayerXuidToGametag: Record<string, string> = {
  "2535433357884073": "iSydneyzz",
  "2535410840380440": "Polqii",
  "2535425743666079": "SiAsami",
  "2535408266928845": "fistcats69420",
  "2533274844642438": "SoundmanD",
  "2535451682444675": "Jugipaws",
  "2533274826169375": "JoMos Lawny",
  "2535460036059321": "TPG Driift",
};

const discoveredMatches: LiveTrackerMatchSummary[] = [
  {
    matchId: "85022d98-5829-4da2-85ae-32b8cb48bbdd",
    gameTypeAndMap: "Oddball: Vacancy - Ranked",
    gameType: "Oddball",
    gameMap: "Vacancy - Ranked",
    gameMapThumbnailUrl:
      "https://blobs-infiniteugc.svc.halowaypoint.com/ugcstorage/map/6a1e8432-88ae-4430-8f7d-9ffefc97cc8d/cad79980-9d49-4b10-9da5-5b6d638cc533/images/hero.jpg",
    duration: "7m 57s",
    gameScore: "0:2",
    gameSubScore: "18:165",
    startTime: "2025-12-24T02:51:50.186Z",
    endTime: "2025-12-24T02:59:47.384Z",
    playerXuidToGametag: samplePlayerXuidToGametag,
  },
  {
    matchId: "4ddc5187-d08d-48fc-96a3-8a490e577795",
    gameTypeAndMap: "Oddball: Vacancy - Ranked",
    gameType: "Oddball",
    gameMap: "Vacancy - Ranked",
    gameMapThumbnailUrl:
      "https://blobs-infiniteugc.svc.halowaypoint.com/ugcstorage/map/6a1e8432-88ae-4430-8f7d-9ffefc97cc8d/cad79980-9d49-4b10-9da5-5b6d638cc533/images/hero.jpg",
    duration: "4m 58s",
    gameScore: "0:1",
    gameSubScore: "69:100",
    startTime: "2025-12-24T03:02:38.814Z",
    endTime: "2025-12-24T03:07:37.120Z",
    playerXuidToGametag: samplePlayerXuidToGametag,
  },
  {
    matchId: "d127af7f-079c-4b28-a3ae-6e1bcdd44438",
    gameTypeAndMap: "King of the Hill: Live Fire - Ranked",
    gameType: "King of the Hill",
    gameMap: "Live Fire - Ranked",
    gameMapThumbnailUrl:
      "https://blobs-infiniteugc.svc.halowaypoint.com/ugcstorage/map/309253f8-7a75-48ff-83e1-e7fb3db2ac47/86a644f0-5063-40b8-b601-ce361439da72/images/hero.jpg",
    duration: "13m 47s",
    gameScore: "4:3",
    gameSubScore: null,
    startTime: "2025-12-24T03:12:08.363Z",
    endTime: "2025-12-24T03:25:55.588Z",
    playerXuidToGametag: samplePlayerXuidToGametag,
  },
  {
    matchId: "688cc0ac-2266-40e2-a3dd-a1f5b992f046",
    gameTypeAndMap: "Capture the Flag: Fortress - Ranked",
    gameType: "Capture the Flag",
    gameMap: "Fortress - Ranked",
    gameMapThumbnailUrl:
      "https://blobs-infiniteugc.svc.halowaypoint.com/ugcstorage/map/a54808fb-9bf5-432a-a3c3-f76cbea944c1/f8fe5de8-694e-4787-9ece-dea86b37e6be/images/hero.jpg",
    duration: "13m 40s",
    gameScore: "1:2",
    gameSubScore: null,
    startTime: "2025-12-24T03:27:49.787Z",
    endTime: "2025-12-24T03:41:30.534Z",
    playerXuidToGametag: samplePlayerXuidToGametag,
  },
];

// Sample raw match data - imported from real match JSON files
const sampleRawMatches: Record<string, MatchStats> = {
  "85022d98-5829-4da2-85ae-32b8cb48bbdd": matchStats1,
  "4ddc5187-d08d-48fc-96a3-8a490e577795": matchStats2,
  "d127af7f-079c-4b28-a3ae-6e1bcdd44438": matchStats3,
  "688cc0ac-2266-40e2-a3dd-a1f5b992f046": matchStats4,
};

export const sampleLiveTrackerStateMessage: LiveTrackerStateMessage = {
  type: "state",
  data: {
    guildId: "1238795949266964560",
    guildName: "Sample Guild",
    channelId: "1453215131843563550",
    queueNumber: 6038,
    status: "active",
    players,
    teams,
    substitutions: [],
    discoveredMatches,
    rawMatches: sampleRawMatches,
    seriesScore: "🦅 1:2 🐍",
    lastUpdateTime: "2025-12-24T03:52:10.185Z",
    medalMetadata: {
      269174970: { name: "Boxer", sortingWeight: 50 },
      548533137: { name: "Back Smack", sortingWeight: 50 },
      555849395: { name: "Bodyguard", sortingWeight: 50 },
      580478179: { name: "Hill Guardian", sortingWeight: 100 },
      622331684: { name: "Double Kill", sortingWeight: 100 },
      835814121: { name: "Overkill", sortingWeight: 220 },
      1169571763: { name: "Shot Caller", sortingWeight: 100 },
      1211820913: { name: "Fastball", sortingWeight: 200 },
      1284032216: { name: "Wingman", sortingWeight: 50 },
      1512363953: { name: "Perfect", sortingWeight: 100 },
      2063152177: { name: "Triple Kill", sortingWeight: 150 },
      2123530881: { name: "Reversal", sortingWeight: 50 },
      2477555653: { name: "Spotter", sortingWeight: 50 },
      2602963073: { name: "No Scope", sortingWeight: 100 },
      2625820422: { name: "From the Grave", sortingWeight: 50 },
      2780740615: { name: "Killing Spree", sortingWeight: 100 },
      2852571933: { name: "Rifleman", sortingWeight: 50 },
      3091261182: { name: "Last Shot", sortingWeight: 50 },
      3217141618: { name: "Achilles Spine", sortingWeight: 150 },
      3233952928: { name: "Killjoy", sortingWeight: 50 },
      3334154676: { name: "Guardian Angel", sortingWeight: 50 },
      3488248720: { name: "Stopped Short", sortingWeight: 50 },
      3655682764: { name: "Stick", sortingWeight: 50 },
      3732790338: { name: "Fumble", sortingWeight: 100 },
      3905838030: { name: "Cluster Luck", sortingWeight: 100 },
      4100966367: { name: "Extermination", sortingWeight: 200 },
      4229934157: { name: "Snipe", sortingWeight: 50 },
      4277328263: { name: "Sharpshooter", sortingWeight: 50 },
    },
  },
  timestamp: "2025-12-24T03:52:10.687Z",
};
