import { REST, Routes } from 'discord.js';
import { nanamiCommand, pingCommand } from './commands';
import 'dotenv/config';

const commands = [pingCommand, nanamiCommand];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);

async function register() {
  console.log('🔁 Registering slash commands...');

  await rest.put(
    Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID!, process.env.DISCORD_GUILD_ID!),
    { body: commands },
  );

  console.log('✅ Slash commands registered');
}

register().catch(console.error);
