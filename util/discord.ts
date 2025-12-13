import { Client, TextChannel, EmbedBuilder, APIEmbed } from 'discord.js';
import { DiscordOutbound } from '../types';

export async function sendToDiscordChannel(
  client: Client,
  channelId: string,
  payload: DiscordOutbound,
): Promise<void> {
  const channel = await client.channels.fetch(channelId);
  if (!channel || !(channel instanceof TextChannel)) {
    throw new Error(`채널을 찾을 수 없거나 텍스트 채널이 아님: ${channelId}`);
  }

  // payload가 이미 { embeds: [...] } 형태면 그대로 보내기
  if (payload instanceof EmbedBuilder) {
    await channel.send({ embeds: [payload.toJSON()] });
    return;
  }

  // payload.embeds 안에 EmbedBuilder가 섞여있을 수 있으니 JSON으로 정규화
  const normalized = {
    ...(payload as any),
    embeds: (payload as any).embeds?.map((e: any) =>
      typeof e?.toJSON === 'function' ? e.toJSON() : (e as APIEmbed),
    ),
  };

  await channel.send(normalized as any);
}
