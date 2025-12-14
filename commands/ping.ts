import { ChatInputCommandInteraction } from 'discord.js';
import { logCommand, logError } from '../util/log';

export const pingCommand = {
  name: 'ping',
  description: 'Ping the bot',
  execute: async (interaction: ChatInputCommandInteraction) => {
    try {
      const duration = Date.now() - interaction.createdTimestamp;
      await interaction.reply(`나나미짱 살아있어요! 응답속도: ${duration}ms`);
      logCommand('ping', `${duration}ms`);
    } catch (error) {
      await interaction.editReply('실패했어요...');
      logError('[PING] ping command failed', error);
    }
  },
};
