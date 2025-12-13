import * as cheerio from 'cheerio';

const BASE_URL = process.env.BASE_URL ?? '';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 상대경로 -> 절대경로 (로컬 기본 이미지)
const NO_IMAGE_PATH = `${BASE_URL}/public/images/no_image.png`;

export async function getPreviewImage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
  });

  if (!res.ok) return NO_IMAGE_PATH;

  const html = await res.text();
  const $ = cheerio.load(html);

  const candidates = [
    $('meta[property="og:image"]').attr('content'),
    $('meta[name="twitter:image"]').attr('content'),
    $('meta[property="twitter:image"]').attr('content'),
    $('link[rel="image_src"]').attr('href'),
  ];

  for (const c of candidates) {
    if (!c) continue;
    try {
      return new URL(c, url).toString(); // 상대경로 보정
    } catch {
      /* skip */
    }
  }

  // 원본에서 이미지를 찾지 못하면 로컬 기본 이미지 반환
  return NO_IMAGE_PATH;
}
