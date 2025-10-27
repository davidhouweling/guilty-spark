export enum NeatQueuePostSeriesDisplayMode {
  THREAD = "T",
  MESSAGE = "M",
  CHANNEL = "C",
}

export interface NeatQueueConfigRow {
  GuildId: string;
  ChannelId: string;
  WebhookSecret: string;
  ResultsChannelId: string;
  PostSeriesMode: NeatQueuePostSeriesDisplayMode;
  PostSeriesChannelId: string | null;
}
