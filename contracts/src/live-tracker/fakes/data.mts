import type {
  LiveTrackerMatchSummary,
  LiveTrackerPlayer,
  LiveTrackerStateMessage,
  LiveTrackerTeam,
} from "../types.mts";

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

const discoveredMatches: LiveTrackerMatchSummary[] = [
  {
    matchId: "85022d98-5829-4da2-85ae-32b8cb48bbdd",
    gameTypeAndMap: "Oddball: Vacancy - Ranked",
    gameType: "Oddball",
    gameTypeIconUrl: "data:,",
    gameTypeThumbnailUrl:
      "https://blobs-infiniteugc.svc.halowaypoint.com/ugcstorage/ugcgamevariant/751bcc9d-aace-45a1-8d71-358f0bc89f7e/227d4ffc-d67f-449a-8315-a1f82854d2ed/images/hero.png",
    gameMap: "Vacancy - Ranked",
    gameMapThumbnailUrl:
      "https://blobs-infiniteugc.svc.halowaypoint.com/ugcstorage/map/6a1e8432-88ae-4430-8f7d-9ffefc97cc8d/cad79980-9d49-4b10-9da5-5b6d638cc533/images/hero.jpg",
    duration: "7m 57s",
    gameScore: "0:2",
    gameSubScore: "18:165",
    endTime: "2025-12-24T02:59:47.384Z",
  },
  {
    matchId: "4ddc5187-d08d-48fc-96a3-8a490e577795",
    gameTypeAndMap: "Oddball: Vacancy - Ranked",
    gameType: "Oddball",
    gameTypeIconUrl: "data:,",
    gameTypeThumbnailUrl:
      "https://blobs-infiniteugc.svc.halowaypoint.com/ugcstorage/ugcgamevariant/751bcc9d-aace-45a1-8d71-358f0bc89f7e/227d4ffc-d67f-449a-8315-a1f82854d2ed/images/hero.png",
    gameMap: "Vacancy - Ranked",
    gameMapThumbnailUrl:
      "https://blobs-infiniteugc.svc.halowaypoint.com/ugcstorage/map/6a1e8432-88ae-4430-8f7d-9ffefc97cc8d/cad79980-9d49-4b10-9da5-5b6d638cc533/images/hero.jpg",
    duration: "4m 58s",
    gameScore: "0:1",
    gameSubScore: "69:100",
    endTime: "2025-12-24T03:07:37.120Z",
  },
  {
    matchId: "d127af7f-079c-4b28-a3ae-6e1bcdd44438",
    gameTypeAndMap: "King of the Hill: Live Fire - Ranked",
    gameType: "King of the Hill",
    gameTypeIconUrl: "data:,",
    gameTypeThumbnailUrl:
      "https://blobs-infiniteugc.svc.halowaypoint.com/ugcstorage/ugcgamevariant/88c22b1f-2d64-48b9-bab1-26fe4721fb23/43e75f3a-eee5-4147-b9d3-19782fac58f8/images/hero.png",
    gameMap: "Live Fire - Ranked",
    gameMapThumbnailUrl:
      "https://blobs-infiniteugc.svc.halowaypoint.com/ugcstorage/map/309253f8-7a75-48ff-83e1-e7fb3db2ac47/86a644f0-5063-40b8-b601-ce361439da72/images/hero.jpg",
    duration: "13m 47s",
    gameScore: "4:3",
    gameSubScore: null,
    endTime: "2025-12-24T03:25:55.588Z",
  },
  {
    matchId: "688cc0ac-2266-40e2-a3dd-a1f5b992f046",
    gameTypeAndMap: "Capture the Flag: Fortress - Ranked",
    gameType: "Capture the Flag",
    gameTypeIconUrl: "data:,",
    gameTypeThumbnailUrl:
      "https://blobs-infiniteugc.svc.halowaypoint.com/ugcstorage/ugcgamevariant/4cb279b7-a064-4df6-9058-02cdc6825d93/1392d27e-e7e3-41d9-93f9-420c66cff577/images/hero.png",
    gameMap: "Fortress - Ranked",
    gameMapThumbnailUrl:
      "https://blobs-infiniteugc.svc.halowaypoint.com/ugcstorage/map/a54808fb-9bf5-432a-a3c3-f76cbea944c1/f8fe5de8-694e-4787-9ece-dea86b37e6be/images/hero.jpg",
    duration: "13m 40s",
    gameScore: "1:2",
    gameSubScore: null,
    endTime: "2025-12-24T03:41:30.534Z",
  },
];

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
    lastUpdateTime: "2025-12-24T03:52:10.185Z",
  },
  timestamp: "2025-12-24T03:52:10.687Z",
};
