import { ChatInputCommandInteraction } from 'discord.js';
import { logInfo } from '../util/log';

export const pingCommand = {
  name: 'ping',
  description: 'Ping the bot',
  execute: async (interaction: ChatInputCommandInteraction) => {
    const message = `나나미짱 살아있어요! 응답속도: ${Date.now() - interaction.createdTimestamp}ms`;
    await interaction.reply(message);
    logInfo(message);
  },
};
