// src/events/hackernews.event.ts
import { EmbedBuilder } from '@discordjs/builders';
import { DiscordOutbound, EventOptions, EventPayload } from '../types';
import { Event } from './event';
import { toKst } from '../util/time';
import { summarize as llmSummarize, search as llmSearch, extractJsonObject } from '../util/llm';

const HackerNewsEventOptions: EventOptions = {
  intervalMs: 1000 * 60, // 10분마다
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
    const res = await fetch(this.options.url);
    if (!res.ok) {
      throw new Error(`HackerNews API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    const hits: HackerNewsApiHit[] = Array.isArray(data.hits) ? data.hits : [];

    const payloads: HackerNewsPayload[] = [];
    for (const hit of hits) {
      const payload = await this.buildPayload(hit);
      if (payload) payloads.push(payload);
    }

    return payloads[0] ?? null;
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
      '다음 Hacker News 글을 한국어로 2~3줄 정도로 요약해줘.',
      '보안 / 클라우드 / AI 관련 이슈면 그 점을 강조해서 설명해줘.',
      '',
      `제목: ${payload.title}`,
      `링크: ${payload.link}`,
      `포인트: ${payload.points}`,
      `댓글 수: ${payload.commentCount}`,
    ].join('\n');

    const raw = await llmSummarize(prompt);

    return raw ?? '';
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
    const description = (payload.summary ?? '').trim() || payload.title || '내용 없음';

    const embed = new EmbedBuilder()
      .setTitle(payload.title)
      .setURL(payload.link)
      .setDescription(description)
      .addFields(
        {
          name: 'Points',
          value: `${payload.points}`,
          inline: true,
        },
        {
          name: 'Comments',
          value: `${payload.commentCount}`,
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
      .setFooter({ text: `Hacker News • ${payload.author}` })
      .setTimestamp(payload.publishedAt);

    // CVE처럼 embeds 기반 DiscordOutbound 리턴
    const outbound: DiscordOutbound = {
      embeds: [embed],
    };

    return outbound;
  }
}
