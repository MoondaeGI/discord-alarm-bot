import { AttachmentBuilder, ChatInputCommandInteraction } from 'discord.js';
import { logCommand } from '../util/log';
import path from 'path';
import fs from 'fs';

const publicDir = path.join(process.cwd(), 'public');
const imgDir = path.join(publicDir, 'images'); // public/images 안에서만 뽑는 걸 추천
const exts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

function pickRandomImageFile(): string {
  const files = fs.readdirSync(imgDir).filter((f) => exts.has(path.extname(f).toLowerCase()));
  if (!files.length) throw new Error('No images in public/images');
  return files[Math.floor(Math.random() * files.length)];
}

export const nanamiCommand = {
  name: 'nanami',
  description: '귀여운 나나미짱 랜덤 사진 가져오기',
  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.reply('나나미짱 가져오는 중...');

    const imageFile = pickRandomImageFile();

    const attachment = new AttachmentBuilder(fs.createReadStream(imageFile), {
      name: path.basename(imageFile),
    });

    await interaction.editReply({ files: [attachment] });
    logCommand('nanami', 'nanami command executed');
  },
};
