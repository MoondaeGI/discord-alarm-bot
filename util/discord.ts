import { Client, TextChannel } from 'discord.js';
import { DiscordOutbound } from '../types';

// Discord로 메시지 보내는 공통 함수
export async function sendToDiscordChannel(
  client: Client,
  channelId: string,
  payload: DiscordOutbound,
): Promise<void> {
  const channel = await client.channels.fetch(channelId);
  if (!channel || !(channel instanceof TextChannel)) {
    throw new Error(`채널을 찾을 수 없거나 텍스트 채널이 아님: ${channelId}`);
  }

  await (channel as TextChannel).send(payload as any);
}
