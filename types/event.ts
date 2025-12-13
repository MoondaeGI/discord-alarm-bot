import { Timezone } from './timezone';

export interface EventOptions {
  intervalMs: number;
  url: string;
  discordChannelId: string;
  timezone: Timezone;
}

export interface EventPayload {
  summary: string;
  link: string;
  publishedAt: Date;
  previewImage: string;
}

export interface AlarmWindow {
  windowStartUtc: Date;
  windowEndUtc: Date;
}
