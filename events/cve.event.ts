import { EmbedBuilder } from '@discordjs/builders';
import { DiscordOutbound, EventOptions, EventPayload } from '../types';
import { Event } from './event';
import { severityToColor } from '../util/color';
import { toKst } from '../util/time';
import { XMLParser } from 'fast-xml-parser';
import { summarize, search } from '../util/llm';

const CveEventOptions: EventOptions = {
  intervalMs: 1000 * 60 * 60 * 24,
  url: 'https://nvd.nist.gov/feeds/xml/cve/misc/nvd-rss.xml',
  discordChannelId: '1234567890',
  table: 'cve',
};

interface CvePayload extends EventPayload {
  title: string;
  cveId: string;
  severity: string;
  scoreStr: string;
  vectorStr: string;
  description: string;
}

interface CveItem {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

class CveEvent implements Event<CvePayload> {
  readonly options: EventOptions;

  constructor(options: EventOptions = CveEventOptions) {
    this.options = options;
  }

  async alarm(lastRunAt?: Date): Promise<CvePayload | null> {
    const url = new URL(this.options.url);

    // lastRunAt 이후만 보려면 여기에서 쿼리 파라미터 추가
    if (lastRunAt) {
      url.searchParams.set('pubStartDate', lastRunAt.toISOString());
    }

    const res = await fetch(url.toString());

    if (!res.ok) {
      throw new Error(`CVE API error: ${res.status} ${res.statusText}`);
    }

    const xml = await res.text();
    const parser = new XMLParser();
    const parsed = parser.parse(xml);

    const items = parsed?.rss?.channel?.item || [];
    if (!items.length) return null;

    const item = items[0]; // 가장 최신 1개

    const json: CveItem = {
      id: item.link, // RSS link를 유일 ID로 사용
      title: item.title,
      link: item.link,
      pubDate: item.pubDate,
      description: item.description,
    };

    return this.buildPayload(json);
  }

  async buildPayload(payload: CveItem): Promise<CvePayload | null> {
    const summary = await this.summarize(payload);
    const cveId = payload.title.split(' ')[0];

    const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${encodeURIComponent(cveId)}`;
    try {
      const res = await fetch(url);

      if (!res.ok) throw new Error(`NVD CVSS API error: ${res.status} ${res.statusText}`);

      const data = await res.json();
      const vuln = data.vulnerabilities?.[0];
      const metrics = vuln?.cve?.metrics;
      if (!metrics) return null;

      const v31 = metrics.cvssMetricV31?.[0];
      const v30 = metrics.cvssMetricV30?.[0];
      const v2 = metrics.cvssMetricV2?.[0];

      const source = v31 || v30 || v2;
      if (!source) return null;

      const cvssData = source.cvssData || source;

      const severity = (cvssData.baseSeverity || source.baseSeverity || 'UNKNOWN').toUpperCase();
      const scoreStr = String(cvssData.baseScore ?? '정보 없음');
      const vectorStr = cvssData.vectorString ?? '벡터 없음';

      return {
        title: summary.title,
        cveId,
        severity,
        scoreStr,
        vectorStr,
        summary: summary.summary,
        link: payload.link,
        publishedAt: new Date(payload.pubDate),
        description: summary.desc,
      };
    } catch (e) {
      throw new Error(`CVSS API error: ${e}`);
    }
  }

  async summarize(payload: CveItem): Promise<any> {
    const prompt = `
다음 CVE 정보를 기반으로 한국어 JSON과 요약을 생성하세요.

### 원본 정보(영문 JSON)
${JSON.stringify(payload, null, 2)}

### 출력 형식(JSON만 출력)
{
  "title": "...",
  "desc": "...",
  "summary": "..."
}

규칙:
- title: title의 자연스러운 한국어 번역
- desc: description의 한국어 번역 (없으면 ""로)
- summary:
  - 한국어로 2~3줄
  - 어떤 취약점인지, 어떤 컴포넌트/제품에 영향을 주는지
  - 위험도(낮음/중간/높음 추정)를 문장 안에 포함
`;

    try {
      const content = await summarize(prompt);
      if (!content) throw new Error('빈 응답');

      // LLM이 JSON만 출력하도록 요청했으므로 바로 파싱 시도
      return JSON.parse(content);
    } catch (e) {
      console.error('요약/번역 생성 오류:', e);
      return {
        title: '번역 오류',
        desc: '번역 오류',
        summary: '요약 생성 실패',
      };
    }
  }

  async search(question: string): Promise<CvePayload[]> {
    const prompt = `
다음 질문을 기반으로 CVE 정보를 검색하세요.

### 질문
${question}

위 사용자의 질문을 기반으로 NVD(API: https://services.nvd.nist.gov/rest/json/cves/2.0)에 요청할 수 있는 CVE 검색용 쿼리(URL Query Parameters 형태)를 생성해 주세요.

- 사용자의 질문을 기반으로 CVE 검색 스펙을 JSON 형태로 만들어라.
- JSON에는 다음과 같은 필드를 사용할 수 있다:
  - keywords: string[]  // 검색 키워드
  - severity: string[]  // ["LOW","MEDIUM","HIGH","CRITICAL"] 중 일부
  - dateRange: { start: "YYYY-MM-DD" | null, end: "YYYY-MM-DD" | null }
  - page: { pageNumber: number, pageSize: number, maxPages: number }
  - sort: { field: "published" | "lastModified" | "cvssScore", direction: "asc" | "desc" }

- page.maxPages는 5를 넘는 값을 넣어도 클라이언트에서 최대 5로 잘린다.
- 정렬이 명시되지 않으면 null 또는 필드를 생략해도 된다.
- 반드시 JSON만 출력하고, 주석이나 설명은 출력하지 마라.
`;

    try {
      const content = await search(prompt);
      if (!content) throw new Error('빈 응답');
    } catch (e) {
      throw new Error(`검색 오류: ${e}`);
    }

    return [];
  }

  formatAlarm(payload: CvePayload): DiscordOutbound | null {
    return new EmbedBuilder()
      .setTitle(`${payload.title} ${payload.cveId}`)
      .setURL(payload.link)
      .setColor(severityToColor(payload.severity))
      .setTimestamp(new Date())
      .addFields(
        {
          name: '요약',
          value: payload.summary,
        },
        {
          name: '핵심 정보',
          value: [
            `• 제목(KR): ${payload.title || '정보 없음'}`,
            `• 발행일(미국/현지): ${new Date(payload.publishedAt).toLocaleString('en-US', { timeZone: 'America/New_York' })}`,
            `• 발행일(한국/KST): ${toKst(payload.publishedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`,
          ].join('\n'),
        },
        {
          name: 'CVSS',
          value: `${payload.scoreStr}\n${payload.vectorStr}`,
          inline: true,
        },
        {
          name: 'URL',
          value: payload.link,
        },
      )
      .setFooter({ text: 'NVD CVE 알림봇' });
  }
}

export { CveEvent, CveEventOptions, CvePayload };
