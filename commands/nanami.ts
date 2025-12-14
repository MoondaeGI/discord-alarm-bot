import { AttachmentBuilder, ChatInputCommandInteraction } from 'discord.js';
import { logCommand, logError } from '../util/log';
import path from 'path';
import fs from 'fs';

const publicDir = path.join(process.cwd(), 'public');
const imgDir = path.join(publicDir, 'nanami'); // public/images 안에서만 뽑는 걸 추천
const exts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

function pickRandomImageFile(): string {
  const files = fs.readdirSync(imgDir).filter((f) => exts.has(path.extname(f).toLowerCase()));
  if (!files.length) throw new Error('No images in public/nanami');
  const file = files[Math.floor(Math.random() * files.length)];
  return path.join(imgDir, file);
}

export const nanamiCommand = {
  name: 'nanami',
  description: '귀여운 나나미짱 랜덤 사진 가져오기',
  execute: async (interaction: ChatInputCommandInteraction) => {
    try {
      await interaction.deferReply();

      const imageFile = pickRandomImageFile();

      const attachment = new AttachmentBuilder(fs.createReadStream(imageFile), {
        name: path.basename(imageFile),
      });

      await interaction.editReply({ files: [attachment] });
      logCommand('nanami', 'nanami command executed');
    } catch (error) {
      await interaction.editReply('실패했어요...');
      logError('[NANAMI] nanami command failed', error);
    }
  },
};
