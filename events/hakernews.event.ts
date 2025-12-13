// src/events/hackernews.event.ts
import { EmbedBuilder } from '@discordjs/builders';
import { AlarmWindow, DiscordOutbound, EventOptions, EventPayload } from '../types';
import { Event } from './event';
import { toKst } from '../util/time';
import { summarize as llmSummarize, search as llmSearch, extractJsonObject } from '../util/llm';
import { logFetchList } from '../util/log';

const HackerNewsEventOptions: EventOptions = {
  intervalMs: 1000 * 60 * 5, // 5분마다
  url: 'https://hn.algolia.com/api/v1/search?tags=front_page',
  discordChannelId: process.env.DISCORD_CHANNEL_ID ?? '',
  timezone: 'UTC',
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

  async alarm(ctx: AlarmWindow): Promise<HackerNewsPayload[]> {
    const res = await fetch(this.options.url); // front_page
    if (!res.ok) throw new Error(`HackerNews API error: ${res.status}`);

    const data = await res.json();
    const hits = Array.isArray(data.hits) ? data.hits : [];
    logFetchList(this.options.url, res.status, hits.length);

    const payloads: HackerNewsPayload[] = [];
    for (const hit of hits) {
      const title = hit.title ?? hit.story_title ?? '';
      const link =
        hit.url ?? hit.story_url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`;

      // ★ LLM 없이 기술/AI/보안 글만 필터링
      if (!isTechArticle(title, link)) continue;

      if (!hit.created_at_i) continue;
      const publishedAtUtc = new Date(hit.created_at_i * 1000);

      const t = publishedAtUtc.getTime();
      if (t < ctx.windowStartUtc.getTime() || t >= ctx.windowEndUtc.getTime()) continue;

      const payload = await this.buildPayload(hit);
      if (payload) payloads.push(payload);
    }

    return payloads;
  }

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
    logFetchList(url, res.status, hits.length);

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
      '다음 글의 핵심 내용을 한국어로 자연스럽게 요약해줘. 3~5줄 사이로 요약해줘.',
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
  format(payload: HackerNewsPayload): DiscordOutbound | null {
    const rawTitle = (payload.title ?? '').trim();
    const title =
      rawTitle.length > 256 ? `${rawTitle.slice(0, 253)}...` : rawTitle || 'Untitled (Hacker News)';

    console.log('title', title);
    console.log('payload', payload);

    const embed = new EmbedBuilder()
      .setAuthor({
        name: 'Hacker News',
        iconURL: 'https://upload.wikimedia.org/wikipedia/commons/d/d1/Y_Combinator_logo.svg',
      })
      .setTitle(title)
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

    return {
      content: payload.link,
      embeds: [embed],
    };
  }
}

const TECH_DOMAINS = [
  'github.com',
  'gitlab.com',
  'medium.com',
  'dev.to',
  'cloudflare.com',
  'aws.amazon.com',
  'azure.microsoft.com',
  'googleblog.com',
  'engineering.linkedin.com',
  'engineering.fb.com',
  'arstechnica.com',
  'linux.org',
  'kernel.org',
  'rust-lang.org',
  'python.org',
  'golang.org',
  'webkit.org',
  'mozilla.org',
  'chromium.org',
  'stackoverflow.blog',
];

const AI_DOMAINS = [
  'openai.com',
  'huggingface.co',
  'anthropic.com',
  'deepmind.com',
  'pytorch.org',
  'tensorflow.org',
  'arxiv.org',
  'kaggle.com',
];

const SECURITY_DOMAINS = [
  'krebsonsecurity.com',
  'bleepingcomputer.com',
  'securityweek.com',
  'nvd.nist.gov',
  'cve.mitre.org',
  'hackaday.com',
  'malwarebytes.com',
  'research.checkpoint.com',
];

const KEYWORD_TECH = [
  'software',
  'hardware',
  'programming',
  'developer',
  'engineer',
  'linux',
  'kernel',
  'database',
  'compiler',
  'gpu',
  'cpu',
  'chip',
  'infra',
  'cloud',
  'server',
  'architecture',
  'performance',
  'open source',
];

const KEYWORD_AI = [
  'ai',
  'artificial intelligence',
  'machine learning',
  'deep learning',
  'gpt',
  'llm',
  'transformer',
  'neural',
];

const KEYWORD_SECURITY = [
  'security',
  'cybersecurity',
  'exploit',
  'vulnerability',
  'cve',
  'sql injection',
  'malware',
  'rce',
  'xss',
  '0-day',
];

function isTechByUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;

    return (
      TECH_DOMAINS.some((d) => host.includes(d)) ||
      AI_DOMAINS.some((d) => host.includes(d)) ||
      SECURITY_DOMAINS.some((d) => host.includes(d))
    );
  } catch {
    return false;
  }
}

function isTechByTitle(title: string): boolean {
  const lower = title.toLowerCase();

  return (
    KEYWORD_TECH.some((k) => lower.includes(k)) ||
    KEYWORD_AI.some((k) => lower.includes(k)) ||
    KEYWORD_SECURITY.some((k) => lower.includes(k))
  );
}

export function isTechArticle(title: string, url: string): boolean {
  return isTechByUrl(url) || isTechByTitle(title);
}
