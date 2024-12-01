import { QueueData } from "../discord.mjs";

export const aFakeDiscordNeatQueueData: QueueData = {
  message: {
    type: 0,
    content: "",
    mentions: [],
    mention_roles: [],
    attachments: [],
    embeds: [
      {
        title: "🏆 Winner For Queue#777 🏆",
        color: 16711680,
        timestamp: "2024-11-26T11:30:00.000000+00:00",
        fields: [
          {
            name: "Eagle",
            value:
              "<@000000000000000001> *-31.5* **(1131.7)**\n" +
              "<@000000000000000002> *-31.4* **(1117.9)**\n" +
              "<@000000000000000003> *-30.4* **(1017.7)**\n" +
              "<@000000000000000004> *-29.8* **(966.3)**",
            inline: true,
          },
          {
            name: "__Cobra__",
            value:
              "<@000000000000000005> *+29.6* **(1195.0)**\n" +
              "<@000000000000000006> *+29.8* **(1185.0)**\n" +
              "<@000000000000000007> *+30.9* **(1067.3)**\n" +
              "<@000000000000000008> *+32.8* **(887.7)**",
            inline: true,
          },
        ],
      },
    ],
    timestamp: "2024-11-26T11:30:00.000000+00:00",
    edited_timestamp: null,
    components: [],
    id: "1310523001611096064",
    channel_id: "1299532381308325949",
    author: {
      id: "857633321064595466",
      username: "NeatQueue",
      avatar: "e803b2f163fda5aeba2cf4820e3a6535",
      discriminator: "0850",
      public_flags: 65536,
      flags: 65536,
      bot: true,
      global_name: null,
    },
    pinned: false,
    mention_everyone: false,
    tts: false,
  },
  timestamp: new Date("2024-11-26T11:30:00.000Z"),
  teams: [
    {
      name: "Eagle",
      players: [
        {
          id: "000000000000000001",
          username: "discord_user_01",
          avatar: "157e517cdbf371a47aaead44675714a3",
          discriminator: "0",
          global_name: "DiscordUser01",
        },
        {
          id: "000000000000000002",
          username: "discord_user_02",
          avatar: null,
          discriminator: "0",
          global_name: "DiscordUser02",
        },
        {
          id: "000000000000000003",
          username: "discord_user_03",
          avatar: null,
          discriminator: "0",
          global_name: "DiscordUser03",
        },
        {
          id: "000000000000000004",
          username: "discord_user_04",
          avatar: "6f9ef56a174047263d9c81e9b2559fdc",
          discriminator: "0",
          global_name: "DiscordUser04",
        },
      ],
    },
    {
      name: "Cobra",
      players: [
        {
          id: "000000000000000005",
          username: "discord_user_05",
          avatar: "4081ed914ba463a1374b2b1b11f7bf60",
          discriminator: "0",
          global_name: "DiscordUser05",
        },
        {
          id: "000000000000000006",
          username: "discord_user_06",
          avatar: null,
          discriminator: "0",
          global_name: "DiscordUser06",
        },
        {
          id: "000000000000000007",
          username: "discord_user_07",
          avatar: "d354460036abf8fcddd1282b353bfcd9",
          discriminator: "0",
          global_name: "DiscordUser07",
        },
        {
          id: "000000000000000008",
          username: "discord_user_08",
          avatar: "15c79840f18f08defc64793b55afc2b9",
          discriminator: "0",
          global_name: "DiscordUser08",
        },
      ],
    },
  ],
};
