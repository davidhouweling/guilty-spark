import type { LiveTrackerStateMessage } from "../live-tracker/types.mts";

const players = {
  "1189356946680188960": {
    nick: null,
    user: {
      id: "1189356946680188960",
      username: "isydneyzz",
      global_name: "iSydneyzz",
      avatar: null,
    },
  },
  "505426249007497236": {
    nick: null,
    user: {
      id: "505426249007497236",
      username: "polqi",
      global_name: "Polqi",
      avatar: "d6d8fa460412b92a697ca231620c0507",
    },
  },
  "1101793401311080480": {
    nick: "SiAsami",
    user: {
      id: "1101793401311080480",
      username: "siasami",
      global_name: "SiAsami",
      avatar: "d960236505322a6fe20191bb8d499e31",
    },
  },
  "365374177181696010": {
    nick: null,
    user: {
      id: "365374177181696010",
      username: "fistcats69420",
      global_name: null,
      avatar: "3202381c846c238127a4e9ca9864b9d8",
    },
  },
  "237222473500852224": {
    nick: null,
    user: {
      id: "237222473500852224",
      username: "soundmand",
      global_name: "soundmanD",
      avatar: "3c12f3134030c6f4c51bbb36ecb0a8e9",
    },
  },
  "138439874402320384": {
    nick: null,
    user: {
      id: "138439874402320384",
      username: "jugipaws",
      global_name: "Jugipaws",
      avatar: null,
    },
  },
  "760314688176128011": {
    nick: null,
    user: {
      id: "760314688176128011",
      username: "happyjomo_",
      global_name: null,
      avatar: "baf133fffb614b30b25d93e59cc8d865",
    },
  },
  "1005240154417549402": {
    nick: "TPG Driift (Upgraded)",
    user: {
      id: "1005240154417549402",
      username: "dctr_drift",
      global_name: "TPG Driift",
      avatar: "8acffa86b9cb20e54fa2a6787f5d8a65",
    },
  },
} satisfies LiveTrackerStateMessage["data"]["players"];

const teams = [
  {
    name: "Team 1",
    playerIds: ["1189356946680188960", "505426249007497236", "1101793401311080480", "365374177181696010"],
  },
  {
    name: "Team 2",
    playerIds: ["237222473500852224", "138439874402320384", "760314688176128011", "1005240154417549402"],
  },
] as const;

const discoveredMatches = {
  "85022d98-5829-4da2-85ae-32b8cb48bbdd": {
    matchId: "85022d98-5829-4da2-85ae-32b8cb48bbdd",
    gameTypeAndMap: "Oddball: Vacancy - Ranked",
    duration: "7m 57s",
    gameScore: "0:2 (18:165)",
    endTime: "2025-12-24T02:59:47.384Z",
  },
  "4ddc5187-d08d-48fc-96a3-8a490e577795": {
    matchId: "4ddc5187-d08d-48fc-96a3-8a490e577795",
    gameTypeAndMap: "Oddball: Vacancy - Ranked",
    duration: "4m 58s",
    gameScore: "0:1 (69:100)",
    endTime: "2025-12-24T03:07:37.120Z",
  },
  "d127af7f-079c-4b28-a3ae-6e1bcdd44438": {
    matchId: "d127af7f-079c-4b28-a3ae-6e1bcdd44438",
    gameTypeAndMap: "King of the Hill: Live Fire - Ranked",
    duration: "13m 47s",
    gameScore: "4:3",
    endTime: "2025-12-24T03:25:55.588Z",
  },
  "688cc0ac-2266-40e2-a3dd-a1f5b992f046": {
    matchId: "688cc0ac-2266-40e2-a3dd-a1f5b992f046",
    gameTypeAndMap: "Capture the Flag: Fortress - Ranked",
    duration: "13m 40s",
    gameScore: "1:2",
    endTime: "2025-12-24T03:41:30.534Z",
  },
} satisfies LiveTrackerStateMessage["data"]["discoveredMatches"];

export const sampleLiveTrackerStateMessage: LiveTrackerStateMessage = {
  type: "state",
  data: {
    userId: "1290269474536034357",
    guildId: "1238795949266964560",
    channelId: "1453215131843563550",
    queueNumber: 6038,
    status: "active",
    players,
    teams,
    discoveredMatches,
    lastUpdateTime: "2025-12-24T03:52:10.185Z",
  },
  timestamp: "2025-12-24T03:52:10.687Z",
};
