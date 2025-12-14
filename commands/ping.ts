import { ChatInputCommandInteraction } from 'discord.js';
import { logCommand } from '../util/log';

export const pingCommand = {
  name: 'ping',
  description: 'Ping the bot',
  execute: async (interaction: ChatInputCommandInteraction) => {
    const duration = Date.now() - interaction.createdTimestamp;
    await interaction.reply(`나나미짱 살아있어요! 응답속도: ${duration}ms`);
    logCommand('ping', `${duration}ms`);
  },
};
