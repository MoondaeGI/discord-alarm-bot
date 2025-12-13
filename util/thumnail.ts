import * as cheerio from 'cheerio';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function getPreviewImage(url: string): Promise<string | null> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
  });

  if (!res.ok) return null;

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

  return null;
}
