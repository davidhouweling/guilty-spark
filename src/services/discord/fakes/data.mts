import type {
  APIApplicationCommandInteraction,
  APIGuild,
  APIGuildMember,
  APIMessage,
  APIMessageComponentButtonInteraction,
  APIModalSubmitInteraction,
  APIPingInteraction,
  APITextChannel,
  APIThreadChannel,
  RESTPostAPIChannelMessagesThreadsResult,
} from "discord-api-types/v10";
import {
  GuildSystemChannelFlags,
  ButtonStyle,
  ComponentType,
  MessageFlags,
  ChannelType,
  GuildMemberFlags,
  InteractionType,
  Locale,
  MessageType,
  ThreadMemberFlags,
  RoleFlags,
} from "discord-api-types/v10";
import type { QueueData } from "../discord.mjs";

export const apiMessage: APIMessage = {
  type: MessageType.Default,
  content: "Hello, world!",
  mentions: [],
  mention_roles: [],
  attachments: [],
  embeds: [],
  timestamp: "2024-12-06T12:03:09.182000+00:00",
  edited_timestamp: null,
  components: [],
  id: "1314562775950954626",
  channel_id: "1299532381308325949",
  author: {
    id: "000000000000000001",
    username: "soundmanD",
    avatar: "e803b2f163fda5aeba2cf4820e3a6535",
    discriminator: "0850",
    global_name: null,
  },
  mention_everyone: false,
  pinned: false,
  tts: false,
};

export const pingInteraction: APIPingInteraction = {
  id: "fake-id",
  type: InteractionType.Ping,
  application_id: "fake-application-id",
  token: "fake-token",
  version: 1,
  app_permissions: "",
  authorizing_integration_owners: {},
  entitlements: [],
  attachment_size_limit: 10000,
};

const fakeBaseInteraction = {
  app_permissions: "fake-permissions",
  application_id: "fake-application-id",
  authorizing_integration_owners: {},
  context: 0,
  entitlements: [],
  id: "fake-id",
  locale: Locale.EnglishUS,
  member: {
    deaf: false,
    joined_at: "2024-05-11T11:45:17.722000+00:00",
    mute: false,
    permissions: "fake-permissions",
    roles: [],
    user: {
      avatar: null,
      discriminator: "0",
      global_name: null,
      id: "discord_user_01",
      username: "soundmanD",
    },
    flags: GuildMemberFlags.CompletedOnboarding,
  },
  token: "fake-token",
  attachment_size_limit: 10000,
};

export const fakeBaseAPIApplicationCommandInteraction: Omit<APIApplicationCommandInteraction, "type" | "data"> = {
  ...fakeBaseInteraction,
  channel: {
    guild_id: "fake-channel-guild-id",
    id: "fake-channel-id",
    type: ChannelType.GuildText,
  },
  channel_id: "fake-channel-id",
  version: 1,
};

export const fakeButtonClickInteraction: APIMessageComponentButtonInteraction = {
  ...fakeBaseInteraction,
  channel: {
    guild_id: "fake-channel-guild-id",
    id: "fake-channel-id",
    last_message_id: "fake-last-message-id",
    name: "general",
    nsfw: false,
    parent_id: "fake-parent-id",
    position: 0,
    rate_limit_per_user: 0,
    topic: null,
    type: ChannelType.GuildText,
  },
  channel_id: "fake-channel-id",
  guild: {
    id: "fake-guild-id",
    features: [],
    locale: Locale.EnglishUS,
  },
  guild_id: "fake-guild-id",
  data: { component_type: ComponentType.Button, custom_id: "btn_yes" },
  message: {
    application_id: "fake-application-id",
    attachments: [],
    author: {
      avatar: null,
      avatar_decoration_data: null,
      bot: true,
      discriminator: "2015",
      global_name: null,
      id: "fake-guilty-spark-id",
      public_flags: 524288,
      username: "Guilty Spark",
    },
    channel_id: "fake-channel-id",
    components: [
      {
        components: [
          {
            custom_id: "btn_yes",
            label: "Yes",
            style: ButtonStyle.Primary,
            type: ComponentType.Button,
          },
          {
            custom_id: "btn_no",
            label: "No",
            style: ButtonStyle.Danger,
            type: ComponentType.Button,
          },
        ],
        type: ComponentType.ActionRow,
      },
    ],
    content: "",
    edited_timestamp: null,
    embeds: [
      {
        description: "Some description",
        fields: [
          {
            inline: false,
            name: "Field title",
            value: "Field value",
          },
        ],
        title: "Embed title",
      },
    ],
    flags: MessageFlags.Ephemeral,
    id: "fake-message-id",
    interaction: {
      id: "fake-interaction-id",
      name: "fake-interaction-name",
      type: InteractionType.ApplicationCommand,
      user: {
        avatar: null,
        avatar_decoration_data: null,
        discriminator: "0",
        global_name: "fake-user-global-name",
        id: "discord_user_01",
        username: "fake-username",
      },
    },
    interaction_metadata: {
      authorizing_integration_owners: {},
      id: "fake-interaction-metadata-id",
      type: InteractionType.ApplicationCommand,
      user: {
        avatar: null,
        avatar_decoration_data: null,
        discriminator: "0",
        global_name: "fake-user-global-name",
        id: "discord_user_01",
        username: "fake-username",
      },
    },
    mention_everyone: false,
    mention_roles: [],
    mentions: [],
    pinned: false,
    position: 0,
    timestamp: "2025-01-10T09:42:25.495000+00:00",
    tts: false,
    type: 20,
    webhook_id: "fake-webhook-id",
  },
  type: InteractionType.MessageComponent,
  version: 1,
};

export const modalSubmitInteraction: APIModalSubmitInteraction = {
  ...fakeBaseInteraction,
  channel: {
    guild_id: "fake-channel-guild-id",
    id: "fake-channel-id",
    last_message_id: "fake-last-message-id",
    name: "general",
    nsfw: false,
    parent_id: "fake-parent-id",
    position: 0,
    rate_limit_per_user: 0,
    topic: null,
    type: ChannelType.GuildText,
  },
  channel_id: "fake-channel-id",
  data: {
    components: [
      {
        components: [{ custom_id: "text_input", type: ComponentType.TextInput, value: "Hello!" }],
        type: 1,
      },
    ],
    custom_id: "text_input_modal",
  },
  message: {
    application_id: "fake-application-id",
    attachments: [],
    author: {
      avatar: null,
      avatar_decoration_data: null,
      bot: true,
      discriminator: "2015",
      global_name: null,
      id: "fake-guilty-spark-id",
      public_flags: 524288,
      username: "Guilty Spark",
    },
    channel_id: "fake-channel-id",
    components: [
      {
        components: [
          {
            custom_id: "btn_modal",
            label: "Modal",
            style: ButtonStyle.Secondary,
            type: ComponentType.Button,
          },
        ],
        type: ComponentType.ActionRow,
      },
    ],
    content: "",
    edited_timestamp: null,
    embeds: [],
    flags: 64,
    id: "fake-message-id",
    interaction: {
      id: "fake-interaction-id",
      name: "fake-interaction-name",
      type: InteractionType.ApplicationCommand,
      user: {
        avatar: null,
        avatar_decoration_data: null,
        discriminator: "0",
        global_name: "fake-user-global-name",
        id: "discord_user_01",
        username: "fake-username",
      },
    },
    interaction_metadata: {
      authorizing_integration_owners: {},
      id: "fake-interaction-metadata-id",
      type: InteractionType.ApplicationCommand,
      user: {
        avatar: null,
        avatar_decoration_data: null,
        discriminator: "0",
        global_name: "fake-user-global-name",
        id: "discord_user_01",
        username: "fake-username",
      },
    },
    mention_everyone: false,
    mention_roles: [],
    mentions: [],
    pinned: false,
    position: 0,
    timestamp: "2025-01-24T09:41:38.252000+00:00",
    tts: false,
    type: 20,
    webhook_id: "fake-webhook-id",
  },
  type: InteractionType.ModalSubmit,
  version: 1,
};

function aFakeNeatQueueMessageWith(opts: Partial<APIMessage> = {}): APIMessage {
  return {
    type: MessageType.Default,
    content: "",
    mentions: [],
    mention_roles: [],
    attachments: [],
    embeds: opts.embeds ?? [
      {
        title: "🏆 Winner For Queue#1 🏆",
        color: 16711680,
        timestamp: "2024-12-06T12:03:08.786000+00:00",
        fields: [
          {
            name: "Eagle",
            value:
              "<@000000000000000001> *-30.3* **(993.2)**\n<@000000000000000002> *-30.1* **(978.5)**\n<@000000000000000003> *-30.0* **(966.1)**\n<@000000000000000004> *-29.6* **(926.6)**",
            inline: true,
          },
          {
            name: "__Cobra__",
            value:
              "<@000000000000000005> *+28.1* **(1221.0)**\n<@000000000000000006> *+29.5* **(1081.8)**\n<@000000000000000007> *+29.7* **(1063.2)**\n<@000000000000000008> *+32.8* **(755.4)**",
            inline: true,
          },
        ],
      },
    ],
    timestamp: "2024-12-06T12:03:09.182000+00:00",
    edited_timestamp: null,
    components: [],
    id: "1314562775950954626",
    channel_id: "1299532381308325949",
    author: {
      id: "857633321064595466",
      username: "NeatQueue",
      avatar: "e803b2f163fda5aeba2cf4820e3a6535",
      discriminator: "0850",
      public_flags: 65536,
      flags: 65536,
      bot: true,
      banner: null,
      accent_color: null,
      global_name: null,
      avatar_decoration_data: null,
    },
    pinned: false,
    mention_everyone: false,
    tts: false,
    ...opts,
  };
}

export const guild: APIGuild = {
  id: "9999999999999999999",
  name: "Guilty Spark Test Server",
  icon: null,
  description: null,
  splash: null,
  discovery_splash: null,
  features: [],
  banner: null,
  owner_id: "777777777777777777",
  application_id: null,
  region: "au-east",
  afk_channel_id: null,
  afk_timeout: 300,
  system_channel_id: "1111111111111111111",
  system_channel_flags: GuildSystemChannelFlags.SuppressJoinNotifications,
  widget_enabled: false,
  widget_channel_id: null,
  verification_level: 0,
  roles: [
    {
      id: "9999999999999999999",
      name: "@everyone",
      permissions: "2248473465835073",
      position: 0,
      color: 0,
      colors: {
        primary_color: 0,
        secondary_color: null,
        tertiary_color: null,
      },
      hoist: false,
      managed: false,
      mentionable: false,
      icon: null,
      unicode_emoji: null,
      flags: RoleFlags.InPrompt,
    },
  ],
  default_message_notifications: 0,
  mfa_level: 0,
  explicit_content_filter: 0,
  max_presences: null,
  max_members: 25000000,
  max_stage_video_channel_users: 50,
  max_video_channel_users: 25,
  vanity_url_code: null,
  premium_tier: 0,
  premium_subscription_count: 0,
  preferred_locale: Locale.EnglishUS,
  rules_channel_id: null,
  safety_alerts_channel_id: null,
  public_updates_channel_id: null,
  hub_type: null,
  premium_progress_bar_enabled: false,
  nsfw_level: 0,
  emojis: [],
  stickers: [],
  incidents_data: null,
};

export const textChannel: APITextChannel = {
  id: "channel-id",
  type: ChannelType.GuildText,
  last_message_id: "last-message-id",
  guild_id: "guild-id",
  name: "channel-name",
  parent_id: "parent-id",
  rate_limit_per_user: 0,
  topic: null,
  position: 0,
  permission_overwrites: [],
  nsfw: false,
};

export const threadChannel: APIThreadChannel = {
  id: "thread-channel-id",
  type: ChannelType.PublicThread,
  last_message_id: "thread-message-id",
  guild_id: "guild-id",
  name: "thread-name",
  parent_id: "parent-id",
  rate_limit_per_user: 0,
  applied_tags: [],
  owner_id: "thread-owner-id",
  thread_metadata: {
    archived: false,
    archive_timestamp: "2025-05-08T04:31:29.006000+00:00",
    auto_archive_duration: 60,
    locked: false,
    create_timestamp: "2025-05-08T04:31:29.006000+00:00",
  },
  message_count: 3,
  member_count: 3,
  total_message_sent: 3,
  member: {
    id: "1369894435357458472",
    user_id: "1290269474536034357",
    join_timestamp: "2025-05-08T04:31:29.021000+00:00",
    flags: ThreadMemberFlags.HasInteracted,
  },
};

export const channelMessages: APIMessage[] = [
  aFakeNeatQueueMessageWith({
    embeds: [
      {
        title: "🏆 Winner For Queue#10 🏆",
        color: 16711680,
        timestamp: "2024-12-05T11:52:20.193000+00:00",
        fields: [
          {
            name: "__Eagle__",
            value:
              "<@000000000000000001> *+29.8* **(1235.8)**\n<@000000000000000002> *+31.6* **(1052.1)**\n<@000000000000000003> *+32.5* **(983.2)**\n<@000000000000000004> *+32.6* **(956.2)**",
            inline: true,
          },
          {
            name: "Cobra",
            value:
              "<@000000000000000005> *-32.5* **(1117.3)**\n<@000000000000000006> *-32.2* **(1099.1)**\n<@000000000000000007> *-31.5* **(1036.6)**\n<@000000000000000008> *-31.3* **(1012.9)**",
            inline: true,
          },
        ],
      },
    ],
    timestamp: "2024-12-05T11:52:21.235000+00:00",
    id: "1314197670398525493",
  }),
  aFakeNeatQueueMessageWith({
    embeds: [
      {
        title: "🏆 Winner For Queue#7 🏆",
        color: 16711680,
        timestamp: "2024-12-06T11:05:39.576000+00:00",
        fields: [
          {
            name: "Eagle",
            value:
              "<@000000000000000009> *-28.2* **(1033.4)**\n<@000000000000000008> *-28.1* **(1023.5)**\n<@000000000000000007> *-27.9* **(1008.7)**\n<@000000000000000006> *-27.8* **(996.1)**",
            inline: true,
          },
          {
            name: "__Cobra__",
            value:
              "<@000000000000000010> *+26.4* **(1289.1)**\n<@000000000000000011> *+27.0* **(1262.8)**\n<@000000000000000012> *+29.1* **(1054.5)**\n<@000000000000000013> *+29.5* **(1052.3)**",
            inline: true,
          },
        ],
      },
    ],
    timestamp: "2024-12-06T11:05:41.120000+00:00",
    id: "1314548313730846792",
  }),
  aFakeNeatQueueMessageWith({
    embeds: [
      {
        title: "🏆 Winner For Queue#4 🏆",
        color: 16711680,
        timestamp: "2024-12-06T09:55:16.814000+00:00",
        fields: [
          {
            name: "Eagle",
            value:
              "<@000000000000000010> *-29.6* **(1057.0)**\n<@000000000000000008> *-29.3* **(1033.2)**\n<@000000000000000005> *-29.2* **(1022.9)**\n<@000000000000000001> *-28.9* **(992.6)**",
            inline: true,
          },
          {
            name: "__Cobra__",
            value:
              "<@000000000000000012> *+27.8* **(1262.7)**\n<@000000000000000014> *+28.4* **(1203.9)**\n<@000000000000000016> *+29.2* **(1128.3)**\n<@000000000000000018> *+31.7* **(880.2)**",
            inline: true,
          },
        ],
      },
    ],
    timestamp: "2024-12-06T09:55:17.673000+00:00",
    id: "1314530599309934632",
  }),
  aFakeNeatQueueMessageWith({
    embeds: [
      {
        title: "🏆 Winner For Queue#3 🏆",
        color: 16711680,
        timestamp: "2024-12-06T08:24:07.415000+00:00",
        fields: [
          {
            name: "__Eagle__",
            value:
              "<@000000000000000001> *+29.2* **(1234.9)**\n<@000000000000000003> *+29.8* **(1175.5)**\n<@000000000000000005> *+31.0* **(1062.6)**\n<@000000000000000007> *+32.1* **(951.3)**",
            inline: true,
          },
          {
            name: "Cobra",
            value:
              "<@000000000000000002> *-32.2* **(1231.7)**\n<@000000000000000004> *-31.0* **(1114.8)**\n<@000000000000000006> *-30.7* **(1086.6)**\n<@000000000000000008> *-28.3* **(848.5)**",
            inline: true,
          },
        ],
      },
    ],
    timestamp: "2024-12-06T08:24:08.804000+00:00",
    id: "1314507661211074611",
  }),
  aFakeNeatQueueMessageWith(),
  aFakeNeatQueueMessageWith({
    embeds: [
      {
        color: 16711680,
        timestamp: "2024-12-06T06:24:07.415000+00:00",
        fields: [
          {
            name: "Some fake value",
            value: "just doing this to for tests",
            inline: true,
          },
        ],
      },
    ],
  }),
  {
    type: MessageType.Default,
    content: "",
    mentions: [],
    mention_roles: [],
    attachments: [],
    embeds: [],
    timestamp: "2024-12-06T12:03:09.182000+00:00",
    edited_timestamp: null,
    components: [],
    id: "1314562775950954626",
    channel_id: "1299532381308325949",
    author: {
      id: "000000000000000001",
      username: "soundmanD",
      avatar: "e803b2f163fda5aeba2cf4820e3a6535",
      discriminator: "0850",
      public_flags: 65536,
      flags: 65536,
      global_name: null,
    },
    pinned: false,
    mention_everyone: false,
    tts: false,
  },
];

export const discordNeatQueueData: QueueData = {
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
  queue: 777,
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
          global_name: null,
        },
        {
          id: "000000000000000004",
          username: "not_discord_user_04",
          avatar: "6f9ef56a174047263d9c81e9b2559fdc",
          discriminator: "0",
          global_name: "gamertag0000000000004",
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

export const channelThreadsResult: RESTPostAPIChannelMessagesThreadsResult = {
  id: "fake-thread-id",
  name: "fake-thread-name",
  type: ChannelType.PublicThread,
  applied_tags: [],
};

export const guildMember: APIGuildMember = {
  avatar: null,
  banner: null,
  communication_disabled_until: null,
  flags: GuildMemberFlags.CompletedOnboarding,
  joined_at: "2024-10-27T07:56:02.094000+00:00",
  nick: null,
  pending: false,
  premium_since: null,
  roles: ["1300005071773237291"],
  user: {
    id: "discord_user_01",
    username: "soundmanD",
    avatar: "",
    discriminator: "2015",
    public_flags: 524288,
    flags: 524288,
    bot: false,
    banner: null,
    accent_color: null,
    global_name: null,
    avatar_decoration_data: null,
    collectibles: null,
    primary_guild: null,
  },
  mute: false,
  deaf: false,
};
