export interface EventOptions {
  intervalMs: number;
  url: string;
  discordChannelId: string;
  table: string;
}

export interface EventPayload {
  summary: string;
  link: string;
  publishedAt: Date;
}
