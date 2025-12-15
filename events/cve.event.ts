import { ActionRowBuilder, ButtonBuilder, EmbedBuilder } from '@discordjs/builders';
import {
  AlarmWindow,
  DiscordOutbound,
  EventOptions,
  EventPayload,
  NvdCveChangeWrapper,
} from '../types';
import { Event } from './event';
import { severityToColor } from '../util/color';
import { formatKst } from '../util/time';
import { summarize as llmSummarize } from '../util/llm';
import { logError, logFetchList } from '../util/log';
import { NvdCveItem } from '../types';
import { getCweKoById } from '../util/cwe';
import { getAuthIcon } from '../util/thumnail';
import { FilteredDetail, filterSignificantDetails } from '../data/cve/modified';
import { ButtonStyle } from 'discord.js';

export type CveEventType = 'NEW' | 'MODIFIED';

const CveEventOptions: EventOptions = {
  intervalMs: 1000 * 60 * 10,
  url: 'https://services.nvd.nist.gov/rest/json/cves/2.0',
  discordChannelId: process.env.DISCORD_CVE_ALARM_ID ?? '',
  timezone: 'UTC',
};

interface CvePayload extends EventPayload, NvdCveItem {
  type: CveEventType;
  description: string;
  vectorSummary: string;
  referenceDigest: string;
  modifiedDetails?: FilteredDetail[];
  modifiedSummary?: string;
  modifiedDate?: Date;
}

export interface NvdCvesApiResponse {
  resultsPerPage: number;
  startIndex: number;
  totalResults: number;
  format?: string;
  version?: string;
  timestamp?: string;

  cveChanges?: NvdCveChangeWrapper[];
  vulnerabilities?: NvdCveItem[];
}

/**
 * LLM이 만들어 줄 CVE 검색 스펙(JSON) 타입
 */
interface CveSearchSpec {
  keywords?: string[];
  severity?: string[]; // ["LOW","MEDIUM","HIGH","CRITICAL"]
  dateRange?: {
    start: string | null;
    end: string | null;
  } | null;
  page?: {
    pageNumber?: number;
    pageSize?: number;
    maxPages?: number;
  } | null;
  sort?: {
    field?: 'published' | 'lastModified' | 'cvssScore';
    direction?: 'asc' | 'desc';
  } | null;
}

/**
 * CVE 이벤트
 */
class CveEvent implements Event<CvePayload> {
  readonly options: EventOptions;

  constructor(options: EventOptions = CveEventOptions) {
    this.options = options;
  }

  async alarm(ctx: AlarmWindow): Promise<CvePayload[]> {
    const payloads: CvePayload[] = [];

    const publicshedUrl = await setPublishedDateUrl(this.options.url, ctx);

    const publicshedData = await parseJson(publicshedUrl);
    const publishItems = publicshedData.vulnerabilities as NvdCveItem[];
    const publishedPayloads = await Promise.all(
      publishItems.map((item) => this.buildPayload({ ...item, type: 'NEW' })),
    );

    const modifiedUrl = await setModifiedDateUrl(this.options.url, ctx);
    const modifiedData = await parseJson(modifiedUrl);
    const modifiedItems = modifiedData.vulnerabilities as NvdCveItem[];
    const modifiedPayloads = await Promise.all(
      modifiedItems.map((item) => this.buildPayload({ ...item, type: 'MODIFIED' })),
    );

    payloads.push(...publishedPayloads, ...modifiedPayloads);

    return payloads;
  }

  // CvePayload 빌더
  async buildPayload(input: NvdCveItem | any): Promise<CvePayload> {
    const summary = await this.summarize(input);

    const payload: CvePayload = {
      type: input.type,
      ...input,
      link: 'https://nvd.nist.gov/vuln/detail/' + input.cve.id,
      publishedAt: new Date(input.cve.published ?? ''),
      summary: summary.summary,
      vectorSummary: summary.vectorSummary,
      referenceDigest: summary.referenceDigest,
    };

    if (input.type === 'MODIFIED') {
      const url = `https://services.nvd.nist.gov/rest/json/cvehistory/2.0?cveId=${input.cve.id}`;
      const data = await parseJson(url);

      const changes = data.cveChanges;
      if (changes?.length) {
        // 2) 이번 이벤트에서 push된 detail만 필터
        const filteredDetails = filterSignificantDetails(changes[0].change.details);

        // 여기서 filteredDetails만 사용
        payload.modifiedDetails = filteredDetails;
        payload.modifiedDate = new Date(changes[0].change.created);

        const prompt = `
        다음은 CVE 변경 이력에서 이번 이벤트로 실제로 변경(push)된 내용만이다.

- 전체 CVE 설명을 다시 쓰지 마라.
- 과거 상태를 추정하지 마라.
- 이번 변경으로 무엇이 어떻게 달라졌는지만 요약하라.

아래 변경 내용을 한국어로 2~3줄로 요약하라.
가능하면 보안 영향(위험도 상승/하락, 대응 필요 여부)을 한 줄로 덧붙여라.

[변경 이벤트]
cveid: ${payload.cve.id}
eventName: ${changes[0].change.eventName}
created: ${changes[0].change.created}
변경 내용: ${JSON.stringify(filteredDetails, null, 2)}
        `;

        const content = await llmSummarize(prompt);
        if (!content) throw new Error('빈 응답');

        payload.modifiedSummary = content;
      }
    }

    return payload;
  }

  /**
   * LLM으로 한국어 제목/설명/요약 생성
   */
  async summarize(payload: NvdCveItem): Promise<any> {
    const prompt = `
다음 CVE 정보로 한국어 요약 JSON을 생성해.

[1] CVE 핵심 정보
- cveId: ${payload.cve.id}
- published: ${payload.cve.published}
- lastModified: ${payload.cve.lastModified}
- status: ${payload.cve.vulnStatus}
- description_en: ${payload.cve.descriptions.map((d) => d.value).join('\n')}

[2] CVSS (정규화 필드)
${JSON.stringify(payload.cve.metrics?.cvssMetricV40?.[0]?.cvssData ?? {}, null, 2)}

[3] Evidence (참고 링크에서 발췌한 텍스트, 없으면 빈 배열)
${JSON.stringify(payload.cve.references ?? [], null, 2)}

출력(JSON만):
{
  "summary": "2~3줄. 무엇/대상/영향/대응 힌트(있으면)",
  "vectorSummary": "1줄. 반드시: 공격경로+권한/사용자개입+영향(시스템/후속) 순서",
  "referenceDigest": "1~2줄. evidence에서 확인된 패치/권고/연구/릴리즈노트 핵심만",
}

규칙:
- summary: 2~3줄(무엇/대상/영향/대응 힌트가 evidence에 있으면 포함)
- vectorSummary: 1줄(공격경로+권한/사용자개입+영향(시스템/후속) 순서). NOT_DEFINED 언급 금지.
- referenceDigest:
  - EvidenceSnippets에 패치 버전/완화책/권고가 명시된 경우에만 구체적으로 작성
  - 없으면 "해결/완화 정보는 참조 링크에서 확인 필요"처럼 보수적으로 작성
  - 추측 금지
`;

    try {
      const content = await llmSummarize(prompt);
      if (!content) throw new Error('빈 응답');

      return JSON.parse(content);
    } catch (e) {
      logError(`cve.summarize:${payload.cve.id}`, e);
      return {
        summary: '요약 생성 실패',
        vectorSummary: '벡터 요약 생성 실패',
        referenceDigest: '참고 링크 생성 실패',
      };
    }
  }

  // 디스코드 알람 포맷
  async format(payload: CvePayload): Promise<DiscordOutbound | null> {
    const source = normalizeDomain(payload.cve.sourceIdentifier);

    const cweKo = await getCweKoById(payload.cve.weaknesses?.[0]?.description?.[0]?.value ?? '');

    const embed =
      payload.type === 'NEW'
        ? new EmbedBuilder()
            .setAuthor({
              name: '신규 NVD CVE',
              iconURL: (await getAuthIcon()) ?? undefined,
            })
            .setTitle(`${payload.cve.id}`)
            .setURL(payload.link)
            .setColor(
              severityToColor(
                payload.cve.metrics?.cvssMetricV40?.[0]?.cvssData.baseSeverity ?? 'LOW',
              ),
            )
            .setTimestamp(new Date())
            .addFields(
              {
                name: '제공자',
                value: source,
              },
              {
                name: '취약점',
                value: ` - ${payload.cve.weaknesses?.[0]?.description?.[0]?.value}\n - 명칭: ${cweKo?.nameEn ?? ''}\n - 설명: ${cweKo?.descriptionKo ?? ''}`,
              },
              {
                name: 'CVSS',
                value: ` - 점수: ${payload.cve.metrics?.cvssMetricV40?.[0]?.cvssData.baseScore ?? 0}\n - 요약: ${payload.vectorSummary}`,
                inline: true,
              },
              {
                name: '내용',
                value: payload.summary,
              },
              {
                name: '발행일',
                value: `${this.options.timezone}/ ${formatKst(payload.publishedAt)}`,
              },
              {
                name: '참고 정보',
                value: payload.referenceDigest,
              },
              {
                name: 'URL',
                value: payload.link,
              },
            )
            .setFooter({ text: 'NVD CVE' })
        : new EmbedBuilder()
            .setAuthor({
              name: '변경 NVD CVE',
              iconURL: (await getAuthIcon()) ?? undefined,
            })
            .setTitle(`${payload.cve.id}`)
            .setURL(payload.link)
            .setColor(
              severityToColor(
                payload.cve.metrics?.cvssMetricV40?.[0]?.cvssData.baseSeverity ?? 'LOW',
              ),
            )
            .setTimestamp(new Date())
            .addFields(
              {
                name: '제공자',
                value: source,
              },
              {
                name: '취약점',
                value: ` - ${payload.cve.weaknesses?.[0]?.description?.[0]?.value}\n - 명칭: ${cweKo?.nameEn ?? ''}\n - 설명: ${cweKo?.descriptionKo ?? ''}`,
              },
              {
                name: 'CVSS',
                value: ` - 점수: ${payload.cve.metrics?.cvssMetricV40?.[0]?.cvssData.baseScore ?? 0}\n - 요약: ${payload.vectorSummary}`,
                inline: true,
              },
              {
                name: '내용',
                value: payload.summary,
              },
              {
                name: '수정 내용',
                value: payload.modifiedSummary ?? '',
              },
              {
                name: '수정일',
                value: `${this.options.timezone}/ ${formatKst(payload.modifiedDate ?? new Date())}`,
              },
              {
                name: '발행일',
                value: `${this.options.timezone}/ ${formatKst(payload.publishedAt)}`,
              },
              {
                name: '참고 정보',
                value: payload.referenceDigest,
              },
              {
                name: 'URL',
                value: payload.link,
              },
            )
            .setFooter({ text: 'NVD CVE' });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('상세 보기').setURL(payload.link),
    );

    return { embeds: [embed], components: [row] };
  }
}

export { CveEvent, CveEventOptions, CvePayload, CveSearchSpec };

// API 호출 후 JSON 파싱
async function parseJson(url: string): Promise<NvdCvesApiResponse> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NVD API error: ${res.status} ${res.statusText}`);

  const data = (await res.json()) as NvdCvesApiResponse;
  logFetchList(url, res.status, data.vulnerabilities?.length ?? 0);

  return data;
}

// 발행일 기준 URL 설정
async function setPublishedDateUrl(url: string, ctx: AlarmWindow): Promise<string> {
  const newUrl = new URL(url);
  newUrl.searchParams.set('pubStartDate', ctx.windowStartUtc.toISOString());
  newUrl.searchParams.set('pubEndDate', ctx.windowEndUtc.toISOString());
  newUrl.searchParams.set('startIndex', String(0));
  newUrl.searchParams.set('resultsPerPage', String(200));

  return newUrl.toString();
}

async function setModifiedDateUrl(url: string, ctx: AlarmWindow): Promise<string> {
  const newUrl = new URL(url);
  newUrl.searchParams.set('lastModStartDate', ctx.windowStartUtc.toISOString());
  newUrl.searchParams.set('lastModEndDate', ctx.windowEndUtc.toISOString());
  newUrl.searchParams.set('startIndex', String(0));
  newUrl.searchParams.set('resultsPerPage', String(200));

  return newUrl.toString();
}

function normalizeDomain(domain: string): string {
  const parts = domain.split('.');
  return parts.length > 2 ? parts.slice(-2).join('.') : domain;
}
