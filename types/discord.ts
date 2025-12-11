import type { MessageCreateOptions } from "discord.js";

/**
 * Discord로 보낼 수 있는 아웃바운드 타입
 * - string
 * - MessageCreateOptions (embeds, components 등)
 */
export type DiscordOutbound = string | MessageCreateOptions;
