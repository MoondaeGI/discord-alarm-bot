import { EmbedBuilder } from '@discordjs/builders';
import { AlarmWindow, DiscordOutbound, EventOptions, EventPayload } from '../types';
import { Event } from './event';
import { timezoneToUtc, timezoneToKst } from '../util/time';
import { XMLParser } from 'fast-xml-parser';
import { summarize as llmSummarize } from '../util/llm';
import { logFetchList } from '../util/log';

const MandiantEventOptions: EventOptions = {
  intervalMs: 1000 * 60 * 30, // 30분
  url: 'https://feeds.feedburner.com/threatintelligence/pvexyqv7v0v',
  discordChannelId: process.env.DISCORD_CHANNEL_ID ?? '',
  timezone: 'UTC',
};

interface MandiantPayload extends EventPayload {
  title: string;
  description: string;
}

interface MandiantItem {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Mandiant RSS 이벤트 (알람 전용)
 * - search()는 구현하지 않음 (요청사항)
 */
class MandiantEvent implements Event<MandiantPayload> {
  readonly options: EventOptions;

  constructor(options: EventOptions = MandiantEventOptions) {
    this.options = options;
  }

  async alarm(ctx: AlarmWindow): Promise<MandiantPayload[]> {
    const url = new URL(this.options.url);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Mandiant RSS error: ${res.status} ${res.statusText}`);

    const xml = await res.text();
    const parser = new XMLParser();
    const parsed = parser.parse(xml);

    // RSS 2.0: rss.channel.item
    const rssItemsRaw = parsed?.rss?.channel?.item;

    // 혹시 모를 RDF: rdf:RDF.item (CVE RSS처럼)
    const rdfItemsRaw = parsed?.['rdf:RDF']?.item;

    const itemsRaw = rssItemsRaw ?? rdfItemsRaw ?? [];
    const items = Array.isArray(itemsRaw) ? itemsRaw : [itemsRaw];

    logFetchList(url.toString(), res.status, items.length);
    if (!items.length) return [];

    // 1) RSS -> 정규화
    const normalized: MandiantItem[] = items
      .map((it: any) => {
        const pubDate = it.pubDate ?? it['dc:date'] ?? it.date ?? null;
        const link = it.link ?? it.guid ?? '';

        return {
          id: String(it.guid ?? link ?? it.title ?? ''),
          title: String(it.title ?? ''),
          link: String(link ?? ''),
          pubDate: String(pubDate ?? ''),
          description: String(it.description ?? it['content:encoded'] ?? it.encoded ?? ''),
        };
      })
      .filter((it) => !!it.pubDate && !!it.link);

    if (!normalized.length) return [];

    // 2) 최신순 정렬 (break 최적화 위해)
    const sorted = [...normalized].sort((a, b) => {
      const da = timezoneToUtc(a.pubDate, this.options.timezone)?.getTime() ?? 0;
      const db = timezoneToUtc(b.pubDate, this.options.timezone)?.getTime() ?? 0;
      return db - da;
    });

    // 3) window 필터 (UTC 기준)
    const inWindow: MandiantItem[] = [];
    for (const it of sorted) {
      const publishedAtUtc = timezoneToUtc(it.pubDate, this.options.timezone);
      if (!publishedAtUtc) continue;

      const t = publishedAtUtc.getTime();
      if (t >= ctx.windowEndUtc.getTime()) continue;
      if (t < ctx.windowStartUtc.getTime()) break; // ✅ 최신순이라 여기서 끝

      inWindow.push(it);

      if (inWindow.length >= 3) break;
    }

    if (!inWindow.length) return [];

    // 4) payload 변환
    const payloads: MandiantPayload[] = [];
    for (const item of inWindow) {
      const payload = await this.buildPayload(item);
      if (payload) payloads.push(payload);
    }

    return payloads;
  }

  /**
   * LLM으로 한국어 제목/요약 생성
   * - 실패 시 원문 title 기반 폴백
   */
  async summarize(
    payload: MandiantItem,
  ): Promise<{ title: string; summary: string; desc: string }> {
    const cleanDesc = stripHtml(payload.description).slice(0, 2000);

    const prompt = `
다음 "리서치/위협 인텔리전스 RSS 항목"을 기반으로 한국어 JSON을 생성하세요.

### 원본 정보(영문 JSON)
${JSON.stringify(
  {
    title: payload.title,
    link: payload.link,
    pubDate: payload.pubDate,
    description: cleanDesc,
  },
  null,
  2,
)}

### 출력 형식(JSON만 출력)
{
  "title": ".",
  "desc": ".",
  "summary": "."
}

규칙:
- title: 자연스러운 한국어 제목(번역/다듬기)
- desc: 핵심 내용 1~2문장으로 정리
- summary:
  - 한국어로 2~3줄
  - 어떤 주제/이슈인지, 왜 중요한지(영향/대상)가 드러나게
- 반드시 JSON만 출력 (코드블록/설명 금지)
`;

    try {
      const content = await llmSummarize(prompt);
      if (!content) throw new Error('빈 응답');
      const obj = JSON.parse(content);

      return {
        title: String(obj.title ?? payload.title),
        desc: String(obj.desc ?? cleanDesc ?? ''),
        summary: String(obj.summary ?? payload.title),
      };
    } catch (e) {
      return {
        title: payload.title || '제목 없음',
        desc: cleanDesc || '',
        summary: payload.title || '요약 생성 실패',
      };
    }
  }

  /**
   * json -> payload 변환
   */
  async buildPayload(input: any): Promise<MandiantPayload | null> {
    const item = input as MandiantItem;
    if (!item?.link || !item?.pubDate) return null;

    const s = await this.summarize(item);

    return {
      title: s.title,
      summary: s.summary,
      link: item.link,
      publishedAt: new Date(item.pubDate),
      description: s.desc,
    };
  }

  /**
   * 디스코드 알람 포맷
   */
  format(payload: MandiantPayload): DiscordOutbound | null {
    console.log(payload);
    const embed = new EmbedBuilder()
      .setTitle(payload.title)
      .setURL(payload.link)
      .setTimestamp(new Date())
      .addFields(
        { name: '요약', value: payload.summary || '요약 없음' },
        {
          name: '핵심 정보',
          value: [
            `• 발행일(미국/현지): ${new Date(payload.publishedAt).toLocaleString('en-US', {
              timeZone: 'America/New_York',
            })}`,
            `• 발행일(한국/KST): ${timezoneToKst(
              payload.publishedAt,
              this.options.timezone,
            ).toLocaleString('ko-KR', {
              timeZone: 'Asia/Seoul',
            })}`,
          ].join('\n'),
        },
        { name: '설명', value: payload.description?.slice(0, 1024) || '설명 없음' },
        { name: 'URL', value: payload.link },
      )
      .setFooter({ text: 'Mandiant Research 알림봇' });

    console.log(embed);

    return { embeds: [embed] };
  }
}

export { MandiantEvent, MandiantEventOptions, MandiantPayload };
