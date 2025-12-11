import { EmbedBuilder } from '@discordjs/builders';
import { DiscordOutbound, EventOptions, EventPayload } from '../types';
import { Event } from './event';
import { severityToColor } from '../util/color';
import { toKst, toUtcIsoDate } from '../util/time';
import { XMLParser } from 'fast-xml-parser';
import { summarize as llmSummarize, search as llmSearch, extractJsonObject } from '../util/llm';

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

  /**
   * 알람용: RSS에서 최신 1개 가져와서 CvePayload로 변환
   */
  async alarm(lastRunAt?: Date): Promise<CvePayload | null> {
    const url = new URL(this.options.url);

    // lastRunAt 이후만 보려면 여기서 파라미터 추가 가능
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

  /**
   * 공통 Payload 빌더
   * - 입력이 RSS(CveItem) 이든
   * - NVD 검색 결과(vuln: { cve: ... }) 이든
   * 둘 다 처리 가능하게 만듦
   */
  async buildPayload(input: CveItem | any): Promise<CvePayload | null> {
    let item: CveItem;
    let metrics: any | undefined;

    // NVD 검색 결과 형태: { cve: { ... } }
    if (input && typeof input === 'object' && 'cve' in input) {
      const cve = input.cve;
      const cveId: string = cve.id;
      const published: string = cve.published ?? cve.publishedDate ?? '';
      const link = `https://nvd.nist.gov/vuln/detail/${cveId}`;

      const descEn =
        cve.descriptions?.find((d: any) => d.lang === 'en')?.value ||
        cve.descriptions?.[0]?.value ||
        '';

      const titleBase =
        cve.titles?.find((t: any) => t.lang === 'en')?.title || cve.titles?.[0]?.title || cveId;

      item = {
        id: cveId,
        title: `${cveId} ${titleBase}`.trim(),
        link,
        pubDate: published,
        description: descEn,
      };

      metrics = cve.metrics;
    } else {
      // RSS 형태(CveItem) 그대로
      item = input as CveItem;
    }

    const cveId = item.title.split(' ')[0];

    // CVSS 정보 준비
    if (!metrics) {
      // RSS에서 온 경우: NVD API를 한 번 더 호출해서 metrics 채움
      const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${encodeURIComponent(
        cveId,
      )}`;

      try {
        const res = await fetch(url);

        if (!res.ok) throw new Error(`NVD CVSS API error: ${res.status} ${res.statusText}`);

        const data = await res.json();
        const vuln = data.vulnerabilities?.[0];
        metrics = vuln?.cve?.metrics;
      } catch (e) {
        throw new Error(`CVSS API error: ${e}`);
      }
    }

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

    // 한국어 요약/번역
    const summary = await this.summarize(item);

    return {
      title: summary.title,
      cveId,
      severity,
      scoreStr,
      vectorStr,
      summary: summary.summary,
      link: item.link,
      publishedAt: new Date(item.pubDate),
      description: summary.desc,
    };
  }

  /**
   * LLM으로 한국어 제목/설명/요약 생성
   */
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
      const content = await llmSummarize(prompt);
      if (!content) throw new Error('빈 응답');

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

  /**
   * 자연어 질문 → LLM으로 JSON spec 생성 → NVD 검색 → CvePayload[]
   */
  async search(question: string): Promise<CvePayload[]> {
    const now = new Date().toISOString();

    const prompt = `
다음 질문을 기반으로 CVE 정보를 검색하기 위한 "검색 스펙"을 JSON으로 만들어 주세요.

### 질문
${question}

### 현재 시간 (UTC)
${now}

- 사용자의 질문을 기반으로 CVE 검색 스펙을 JSON 형태로 만들어라.
- JSON에는 다음과 같은 필드를 사용할 수 있다:
  - keywords: string[]  // 검색 키워드
  - severity: string[]  // ["LOW","MEDIUM","HIGH","CRITICAL"] 중 일부
  - dateRange: { start: "YYYY-MM-DD" | null, end: "YYYY-MM-DD" | null }
  - page: { pageNumber: number, pageSize: number, maxPages: number }
  - sort: { field: "published" | "lastModified" | "cvssScore", direction: "asc" | "desc" }

규칙:
- page.maxPages는 5를 초과하더라도, 실제 클라이언트에서는 최대 5페이지만 조회한다.
- 정렬이 명시되지 않으면 sort 필드를 생략해도 된다.
- 반드시 JSON만 출력하고, 주석이나 설명은 출력하지 마라.
- 특히, \`\`\`json 이나 \`\`\` 같은 코드 블록 문자를 절대 사용하지 마라.
- 오직 순수 JSON 객체만 출력해라.
`;

    let spec: CveSearchSpec;
    try {
      const content = await llmSearch(prompt);
      if (!content) throw new Error('빈 응답');

      const json = extractJsonObject(content);
      spec = JSON.parse(json) as CveSearchSpec;
    } catch (e) {
      throw new Error(`검색 스펙 생성 오류: ${e}`);
    }

    // 헬퍼 함수에 buildPayload를 넘겨서 실제 검색 수행
    return searchCveWithSpec(spec, (input) => this.buildPayload(input));
  }

  /**
   * 디스코드 알람 포맷
   */
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
            `• 발행일(미국/현지): ${new Date(payload.publishedAt).toLocaleString('en-US', {
              timeZone: 'America/New_York',
            })}`,
            `• 발행일(한국/KST): ${toKst(payload.publishedAt).toLocaleString('ko-KR', {
              timeZone: 'Asia/Seoul',
            })}`,
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

export { CveEvent, CveEventOptions, CvePayload, CveSearchSpec };

/* ────────────────────────────────
 * 헬퍼 함수들 (클래스 밖)
 * ────────────────────────────────
 */

/**
 * LLM이 만든 JSON 스펙을 기반으로:
 * - NVD API를 최대 5페이지까지 호출하고
 * - 정렬 적용 후
 * - CvePayload[]로 변환
 */
async function searchCveWithSpec(
  spec: CveSearchSpec,
  buildPayload: (input: any) => Promise<CvePayload | null>,
): Promise<CvePayload[]> {
  const pageSize = Math.max(1, Math.min(spec.page?.pageSize ?? 20, 200));
  const maxPages = Math.min(spec.page?.maxPages ?? 1, 5);
  const startPage = Math.max(1, spec.page?.pageNumber ?? 1);

  const allVulns: any[] = [];

  for (let i = 0; i < maxPages; i++) {
    const pageIndex = startPage - 1 + i;
    const startIndex = pageIndex * pageSize;

    const url = buildNvdQueryUrl(spec, { startIndex, resultsPerPage: pageSize });
    const res = await fetch(url);

    if (!res.ok) {
      console.error(`NVD 검색 요청 실패: ${res.status} ${res.statusText}`);
      break;
    }

    const data = await res.json();
    const vulns = data.vulnerabilities ?? [];
    if (!vulns.length) break;

    allVulns.push(...vulns);

    if (vulns.length < pageSize) break; // 마지막 페이지
  }

  const sorted = sortVulnerabilities(allVulns, spec.sort ?? undefined);

  const payloads: CvePayload[] = [];
  for (const vuln of sorted) {
    const p = await buildPayload(vuln);
    if (p) payloads.push(p);
  }

  return payloads;
}

/**
 * JSON 스펙 + 페이징으로 NVD 쿼리 URL 생성
 */
function buildNvdQueryUrl(
  spec: CveSearchSpec,
  paging: { startIndex: number; resultsPerPage: number },
): string {
  const base = new URL('https://services.nvd.nist.gov/rest/json/cves/2.0');

  // ────────────────────────────────────────
  // keywords (공백 합치기)
  // ────────────────────────────────────────
  if (spec.keywords && spec.keywords.length > 0) {
    base.searchParams.set('keywordSearch', spec.keywords.join(' '));
  }

  // ────────────────────────────────────────
  // severity (NVD는 단일 값만 받음 → 배열이면 가장 높은 값 선택)
  // ────────────────────────────────────────
  if (spec.severity && spec.severity.length > 0) {
    const order = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    const normalized = spec.severity
      .map((s) => s.toUpperCase())
      .filter((s) => order.includes(s))
      .sort((a, b) => order.indexOf(a) - order.indexOf(b));

    if (normalized.length > 0) {
      // 배열이 와도 단일 값만 보냄 (CRITICAL/HIGH 우선)
      base.searchParams.set('cvssV3Severity', normalized[0]);
    }
  }

  // ────────────────────────────────────────
  // 날짜 범위
  // NVD 요구 형식: 2024-06-01T00:00:00.000Z
  // ────────────────────────────────────────
  if (spec.dateRange?.start) {
    base.searchParams.set('pubStartDate', `${spec.dateRange.start}T00:00:00.000Z`);
  }

  if (spec.dateRange?.end) {
    base.searchParams.set('pubEndDate', `${spec.dateRange.end}T23:59:59.999Z`);
  }

  // ────────────────────────────────────────
  // 페이징
  // ────────────────────────────────────────
  base.searchParams.set('startIndex', String(paging.startIndex));
  base.searchParams.set('resultsPerPage', String(paging.resultsPerPage));

  const url = base.toString();
  console.log('[NVD URL]', url);
  return url;
}

/**
 * sort 스펙에 따라 NVD vulnerabilities 배열 정렬
 */
function sortVulnerabilities(vulns: any[], sort?: CveSearchSpec['sort']): any[] {
  if (!sort?.field) return vulns;
  const dir = sort.direction === 'asc' ? 1 : -1;

  return [...vulns].sort((a, b) => {
    const cveA = a.cve;
    const cveB = b.cve;

    if (sort.field === 'published') {
      const da = new Date(cveA?.published ?? 0).getTime();
      const db = new Date(cveB?.published ?? 0).getTime();
      return (da - db) * dir;
    }

    if (sort.field === 'lastModified') {
      const da = new Date(cveA?.lastModified ?? 0).getTime();
      const db = new Date(cveB?.lastModified ?? 0).getTime();
      return (da - db) * dir;
    }

    if (sort.field === 'cvssScore') {
      const scoreA =
        cveA?.metrics?.cvssMetricV31?.[0]?.cvssData?.baseScore ??
        cveA?.metrics?.cvssMetricV30?.[0]?.cvssData?.baseScore ??
        cveA?.metrics?.cvssMetricV2?.[0]?.baseScore ??
        0;

      const scoreB =
        cveB?.metrics?.cvssMetricV31?.[0]?.cvssData?.baseScore ??
        cveB?.metrics?.cvssMetricV30?.[0]?.cvssData?.baseScore ??
        cveB?.metrics?.cvssMetricV2?.[0]?.baseScore ??
        0;

      return (scoreA - scoreB) * dir;
    }

    return 0;
  });
}
