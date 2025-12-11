// src/events/hackernews.event.ts
import { EmbedBuilder } from '@discordjs/builders';
import { DiscordOutbound, EventOptions, EventPayload } from '../types';
import { Event } from './event';
import { toKst } from '../util/time';
import { summarize as llmSummarize, search as llmSearch, extractJsonObject } from '../util/llm';

const HackerNewsEventOptions: EventOptions = {
  intervalMs: 1000 * 60 * 10, // 10분마다
  url: 'https://hn.algolia.com/api/v1/search?tags=front_page',
  discordChannelId: process.env.DISCORD_CHANNEL_ID ?? '',
  table: 'hacker_news',
};

interface HackerNewsApiHit {
  objectID: string;
  title?: string;
  story_title?: string;
  url?: string;
  story_url?: string;
  author?: string;
  points?: number;
  num_comments?: number;
  _tags?: string[];
  created_at?: string;
}

export interface HackerNewsPayload extends EventPayload {
  id: string;
  title: string;
  author: string;
  points: number;
  commentCount: number;
  tags: string[];
}

/**
 * Hacker News 이벤트
 */
export class HackerNewsEvent implements Event<HackerNewsPayload> {
  public readonly options = HackerNewsEventOptions;

  /**
   * 주기 알람
   */
  async alarm(lastRunAt?: Date): Promise<HackerNewsPayload | null> {
    const res = await fetch(this.options.url); // front_page
    if (!res.ok) {
      if (res.status >= 500) return null;
      throw new Error(`HackerNews API error: ${res.status}`);
    }

    const data = await res.json();
    const hits = Array.isArray(data.hits) ? data.hits : [];

    const results: HackerNewsPayload[] = [];

    for (const hit of hits) {
      const title = hit.title ?? hit.story_title ?? '';
      const tags = Array.isArray(hit._tags) ? hit._tags : [];

      // 🚫 기술 키워드 없는 글은 스킵
      if (!isTechArticle(title, tags)) continue;

      const payload = await this.buildPayload(hit);
      if (payload) results.push(payload);
    }

    return results[0] ?? null;
  }

  /**
   * 검색용 (slash command 등)
   */
  async search(params: { query: string }): Promise<HackerNewsPayload[]> {
    const url = `https://hn.algolia.com/api/v1/search_by_date?tags=story&query=${encodeURIComponent(
      params.query,
    )}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HackerNews search API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    const hits: HackerNewsApiHit[] = Array.isArray(data.hits) ? data.hits : [];

    const payloads: HackerNewsPayload[] = [];
    for (const hit of hits) {
      const payload = await this.buildPayload(hit);
      if (payload) payloads.push(payload);
    }

    return payloads;
  }

  /**
   * LLM 요약
   */
  async summarize(payload: HackerNewsPayload): Promise<string> {
    const prompt = [
      '다음 글의 핵심 내용을 한국어로 자연스럽게 요약해줘. 5~10줄 사이로 요약해줘.',
      '주관적 의견 없이 사실 위주로 간결하게 정리해줘.',
      '',
      `제목: ${payload.title}`,
      `링크: ${payload.link}`,
      `포인트: ${payload.points}`,
      `댓글 수: ${payload.commentCount}`,
    ].join('\n');

    const raw = await llmSummarize(prompt);

    return raw?.replace(/\. /g, '.\n').replace(/\.$/, '.') ?? '';
  }

  /**
   * HN API 결과 → 내부 Payload
   */
  async buildPayload(hit: HackerNewsApiHit): Promise<HackerNewsPayload | null> {
    if (!hit || !hit.objectID) return null;

    const id = String(hit.objectID);
    const title = hit.title ?? hit.story_title ?? '(제목 없음)';
    const link =
      hit.url ?? hit.story_url ?? `https://news.ycombinator.com/item?id=${encodeURIComponent(id)}`;

    const author = hit.author ?? 'unknown';
    const points = hit.points ?? 0;
    const commentCount = hit.num_comments ?? 0;
    const tags = Array.isArray(hit._tags) ? hit._tags : [];

    const createdAtIso = hit.created_at ?? new Date().toISOString();
    const publishedAt = new Date(createdAtIso);

    // 공통 EventPayload + 확장 필드 모두 포함
    const payload: HackerNewsPayload = {
      summary: '', // 일단 비워두고 LLM 결과로 채움
      link,
      publishedAt,

      id,
      title,
      author,
      points,
      commentCount,
      tags,
    };

    // 요약 생성
    try {
      const summary = await this.summarize(payload);
      payload.summary = summary;
    } catch {
      payload.summary = title;
    }

    return payload;
  }

  /**
   * Discord용 포맷 (CVE 형식 참고해서 Embed)
   */
  formatAlarm(payload: HackerNewsPayload): DiscordOutbound | null {
    return new EmbedBuilder()
      .setAuthor({
        name: 'Hacker News',
        iconURL: 'https://upload.wikimedia.org/wikipedia/commons/d/d1/Y_Combinator_logo.svg',
      })
      .setTitle(payload.title)
      .setURL(payload.link)
      .setDescription(payload.summary)
      .addFields(
        {
          name: 'Points',
          value: String(payload.points),
          inline: true,
        },
        {
          name: 'Comments',
          value: String(payload.commentCount),
          inline: true,
        },
        {
          name: '작성 시간 (KST)',
          value: `${toKst(payload.publishedAt).toISOString()} (${toKst(
            payload.publishedAt,
          ).toLocaleString('ko-KR', {
            timeZone: 'Asia/Seoul',
          })})`,
          inline: false,
        },
      )
      .setFooter({ text: `작성자: ${payload.author}` })
      .setTimestamp(payload.publishedAt)
      .setColor(0xff6600); // HN 브랜드 색상
  }
}

const TECH_KEYWORDS = [
  // 일반 기술
  'software',
  'hardware',
  'programming',
  'developer',
  'engineering',
  'kernel',
  'linux',
  'unix',
  'database',
  'storage',
  'compiler',
  'gpu',
  'cpu',
  'chip',
  'firmware',
  'driver',
  'browser',
  'web',
  'cloud',
  'infrastructure',
  'virtualization',
  'wasm',
  'llvm',
  'network',

  // AI
  'ai',
  'artificial intelligence',
  'machine learning',
  'deep learning',
  'gpt',
  'llm',
  'transformer',
  'neural',

  // 보안
  'security',
  'cybersecurity',
  'vulnerability',
  'exploit',
  'hacking',
  'malware',
  'cve',
  'rce',
  'encryption',
];

function isTechArticle(title: string, tags: string[]): boolean {
  const lower = title.toLowerCase();

  // title에 기술 키워드 포함 여부
  if (TECH_KEYWORDS.some((k) => lower.includes(k))) return true;

  // HN tags로도 기술 글 여부 간접 판단 가능
  if (tags.includes('show_hn')) return true; // 개발 프로젝트
  if (tags.includes('ask_hn')) return false; // 기술 잡담은 제외

  return false;
}
