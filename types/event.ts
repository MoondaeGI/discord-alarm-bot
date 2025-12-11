export interface EventOptions {
  intervalMs: number;
  llmSummaryPrompt: string;
  llmSearchPrompt: string;
  url: string;
  discordChannelId: string;
}

export interface EventPayload {
  summary: string;
  link: string;
  publishedAt: Date;
}
