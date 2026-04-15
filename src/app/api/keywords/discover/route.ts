import { NextRequest } from 'next/server';
import { fetchKeywordStats } from '@/lib/naver-ad';
import {
  fetchFastMonthlyBlogCount,
  fetchQuickMonthlyBlogCount,
  fetchAutocompleteSuggestions,
} from '@/lib/naver-search';

export interface DiscoveredKeyword {
  keyword: string;
  monthlyTotalQcCnt: number;
  monthlyPcQcCnt: number;
  monthlyMobileQcCnt: number;
  monthlyBlogCount: number;
  isCapped: boolean;
  isOver1000: boolean;
  opportunityRatio: number;
  level: 1 | 2 | 3;
}

export type DiscoverEvent =
  | { type: 'progress'; message: string; done: number; total: number }
  | { type: 'found'; keyword: DiscoveredKeyword }
  | { type: 'done'; total: number };

// ── 모드별 설정 ──
const MODE_CONFIG = {
  fast: {
    docBatch: 8,
    docDelay: 150,
    hintDelay: 200,
    retryOnError: false,
    label: '빠른 발굴',
  },
  accurate: {
    docBatch: 3,
    docDelay: 600,
    hintDelay: 350,
    retryOnError: true,
    label: '정확한 발굴',
  },
} as const;

type Mode = keyof typeof MODE_CONFIG;
const HINT_BATCH = 5;

// 자동완성 확장에 쓸 한글 자모/접미사
const SUFFIXES = [
  '', // 기본 검색
  ' ', // 공백 뒤 자동완성
  '추천', '방법', '후기', '나이', '정보', '뜻', '종류',
  '비용', '효과', '부작용', '차이', '순위',
];
const JAMO = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeCount(v: number | string): number {
  if (typeof v === 'string') return v === '< 10' ? 5 : (parseInt(v) || 0);
  return isNaN(v) ? 0 : v;
}

// ────────────────────────────────────────────
// 0단계: 시드 키워드 대량 확보 (자동완성 + 조합)
// ────────────────────────────────────────────
async function collectSeeds(
  keyword: string,
  onProgress?: (msg: string) => void
): Promise<string[]> {
  const seeds = new Set<string>();
  seeds.add(keyword);

  // 1) 자동완성: 기본 + 접미사 조합
  const autocompleteQueries = SUFFIXES.map((s) => `${keyword}${s}`);
  // 2) 자동완성: 자모 접미 (ex: "정년ㄱ", "정년ㄴ" ...)
  for (const j of JAMO) {
    autocompleteQueries.push(`${keyword} ${j}`);
    autocompleteQueries.push(`${keyword}${j}`);
  }

  onProgress?.(`자동완성 ${autocompleteQueries.length}개 쿼리 수집 중...`);

  // 4개씩 병렬 요청 (자동완성 API는 rate limit 여유)
  const AC_BATCH = 4;
  for (let i = 0; i < autocompleteQueries.length; i += AC_BATCH) {
    const batch = autocompleteQueries.slice(i, i + AC_BATCH);
    const results = await Promise.all(batch.map(fetchAutocompleteSuggestions));
    for (const suggestions of results) {
      for (const s of suggestions) {
        seeds.add(s.trim());
      }
    }
    if (i + AC_BATCH < autocompleteQueries.length) await delay(80);
  }

  onProgress?.(`자동완성에서 ${seeds.size}개 시드 확보`);
  return Array.from(seeds);
}

// ────────────────────────────────────────────
// Ad API 배치 호출: 시드들의 검색량 조회
// ────────────────────────────────────────────
interface VolumeInfo { pc: number; mobile: number; total: number }

async function fetchVolumes(
  seeds: string[],
  alreadySeen: Set<string>,
  minSearch: number,
  hintDelay: number,
  onProgress?: (msg: string) => void
): Promise<{
  candidates: Map<string, VolumeInfo>;
  allKeywords: Map<string, number>;
}> {
  const candidates = new Map<string, VolumeInfo>();
  const allKeywords = new Map<string, number>();

  for (let i = 0; i < seeds.length; i += HINT_BATCH) {
    const batch = seeds.slice(i, i + HINT_BATCH);
    const batchNum = Math.floor(i / HINT_BATCH) + 1;
    const totalBatches = Math.ceil(seeds.length / HINT_BATCH);
    onProgress?.(`Ad API ${batchNum}/${totalBatches}`);

    try {
      const list = await fetchKeywordStats(batch);
      for (const item of list) {
        const kw = item.relKeyword;
        if (alreadySeen.has(kw)) continue;
        const pc = normalizeCount(item.monthlyPcQcCnt);
        const mobile = normalizeCount(item.monthlyMobileQcCnt);
        const total = pc + mobile;
        allKeywords.set(kw, total);
        if (total >= minSearch) candidates.set(kw, { pc, mobile, total });
        alreadySeen.add(kw);
      }
    } catch { /* 배치 실패 무시 */ }

    if (i + HINT_BATCH < seeds.length) await delay(hintDelay);
  }

  return { candidates, allKeywords };
}

// ────────────────────────────────────────────
// 월간 발행량 조회 + 결과 emit
// ────────────────────────────────────────────
async function filterAndEmit(
  candidates: Map<string, VolumeInfo>,
  maxMonthly: number,
  level: 1 | 2 | 3,
  mode: Mode,
  alreadyFound: Map<string, DiscoveredKeyword>,
  emit: (kw: DiscoveredKeyword) => void,
  onProgress?: (msg: string) => void
): Promise<void> {
  const cfg = MODE_CONFIG[mode];
  const words = Array.from(candidates.keys()).filter((k) => !alreadyFound.has(k));
  if (words.length === 0) return;

  for (let i = 0; i < words.length; i += cfg.docBatch) {
    const batch = words.slice(i, i + cfg.docBatch);
    onProgress?.(`${i + 1}~${Math.min(i + cfg.docBatch, words.length)} / ${words.length}개`);

    let fetchResults: Array<{ monthly: number; isCapped?: boolean; isOver1000?: boolean }>;

    if (mode === 'fast') {
      fetchResults = await Promise.all(batch.map((kw) => fetchFastMonthlyBlogCount(kw)));
    } else {
      fetchResults = await Promise.all(
        batch.map(async (kw) => {
          let res = await fetchQuickMonthlyBlogCount(kw);
          if (res.monthly === -1 && cfg.retryOnError) {
            await delay(1200);
            res = await fetchQuickMonthlyBlogCount(kw);
          }
          return res;
        })
      );
    }

    for (let j = 0; j < batch.length; j++) {
      const kw = batch[j];
      const { monthly } = fetchResults[j];
      const isCapped = (fetchResults[j] as { isCapped?: boolean }).isCapped ?? false;
      const isOver1000 = (fetchResults[j] as { isOver1000?: boolean }).isOver1000 ?? false;
      const vol = candidates.get(kw)!;

      if (monthly < 0) continue;
      if (isCapped && maxMonthly <= 100) continue;
      if (!isCapped && monthly > maxMonthly) continue;
      if (alreadyFound.has(kw)) continue;

      const effectiveMonthly = isCapped ? 100 : monthly;
      const entry: DiscoveredKeyword = {
        keyword: kw,
        monthlyTotalQcCnt: vol.total,
        monthlyPcQcCnt: vol.pc,
        monthlyMobileQcCnt: vol.mobile,
        monthlyBlogCount: effectiveMonthly,
        isCapped,
        isOver1000,
        opportunityRatio: vol.total / (effectiveMonthly + 1),
        level,
      };
      alreadyFound.set(kw, entry);
      emit(entry);
    }

    if (i + cfg.docBatch < words.length) await delay(cfg.docDelay);
  }
}

// ────────────────────────────────────────────
// POST handler
// ────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const body = await request.json();
  const keyword: string = (body.keyword ?? '').trim();
  const maxDocs: number = Number(body.maxDocs ?? 500);
  const minSearch: number = Number(body.minSearch ?? 100);
  const mode: Mode = body.mode === 'accurate' ? 'accurate' : 'fast';

  if (!keyword) return new Response('keyword required', { status: 400 });

  const cfg = MODE_CONFIG[mode];
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: DiscoverEvent) {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); }
        catch { /* stream closed */ }
      }

      try {
        const found = new Map<string, DiscoveredKeyword>();
        const seen = new Set<string>([keyword]);

        // ═══════════════════════════════════
        // 0단계: 시드 대량 확보 (자동완성 + 조합)
        // ═══════════════════════════════════
        send({ type: 'progress', message: `네이버 자동완성으로 시드 키워드 수집 중...`, done: 0, total: 100 });

        const allSeeds = await collectSeeds(keyword, (msg) =>
          send({ type: 'progress', message: msg, done: 2, total: 100 })
        );

        send({
          type: 'progress',
          message: `0단계: 자동완성에서 ${allSeeds.length}개 시드 확보. Ad API로 검색량 조회 중...`,
          done: 5,
          total: 100,
        });

        // ═══════════════════════════════════
        // 1단계: 자동완성 시드 → Ad API 검색량 조회
        // ═══════════════════════════════════
        const l1Result = await fetchVolumes(allSeeds, seen, minSearch, cfg.hintDelay,
          (msg) => send({ type: 'progress', message: `1단계 ${msg}`, done: 15, total: 100 })
        );

        send({
          type: 'progress',
          message: `1단계: ${l1Result.allKeywords.size}개 연관어 발견 (검색량 통과: ${l1Result.candidates.size}개), 월발행 조회 중...`,
          done: 25,
          total: 100,
        });

        await filterAndEmit(l1Result.candidates, maxDocs, 1, mode, found,
          (kw) => send({ type: 'found', keyword: kw }),
          (msg) => send({ type: 'progress', message: `1단계 ${msg}`, done: 30, total: 100 })
        );

        send({ type: 'progress', message: `1단계 완료 (${found.size}개). 2단계 확장 중...`, done: 40, total: 100 });

        // ═══════════════════════════════════
        // 2단계: 1단계 전체 키워드로 Ad API 재확장
        // ═══════════════════════════════════
        const seeds2 = Array.from(l1Result.allKeywords.entries())
          .sort(([, a], [, b]) => b - a)
          .slice(0, 50)
          .map(([k]) => k);

        const l2Result = await fetchVolumes(seeds2, seen, minSearch, cfg.hintDelay,
          (msg) => send({ type: 'progress', message: `2단계 ${msg}`, done: 50, total: 100 })
        );

        send({
          type: 'progress',
          message: `2단계: ${l2Result.allKeywords.size}개 신규 (검색량 통과: ${l2Result.candidates.size}개)`,
          done: 60,
          total: 100,
        });

        if (l2Result.candidates.size > 0) {
          await filterAndEmit(l2Result.candidates, maxDocs, 2, mode, found,
            (kw) => send({ type: 'found', keyword: kw }),
            (msg) => send({ type: 'progress', message: `2단계 ${msg}`, done: 65, total: 100 })
          );
        }

        send({ type: 'progress', message: `2단계 완료 (${found.size}개). 3단계 심층 확장 중...`, done: 75, total: 100 });

        // ═══════════════════════════════════
        // 3단계: 2단계 + 1단계 상위 키워드로 한 번 더 확장
        // ═══════════════════════════════════
        const seeds3 = [
          ...Array.from(l2Result.allKeywords.entries()).sort(([, a], [, b]) => b - a).slice(0, 15).map(([k]) => k),
          ...Array.from(l1Result.allKeywords.entries()).sort(([, a], [, b]) => b - a).slice(0, 15).map(([k]) => k),
        ].filter((k, i, arr) => arr.indexOf(k) === i).slice(0, 25);

        const l3Result = await fetchVolumes(seeds3, seen, minSearch, cfg.hintDelay,
          (msg) => send({ type: 'progress', message: `3단계 ${msg}`, done: 85, total: 100 })
        );

        send({
          type: 'progress',
          message: `3단계: ${l3Result.allKeywords.size}개 신규 (검색량 통과: ${l3Result.candidates.size}개)`,
          done: 90,
          total: 100,
        });

        if (l3Result.candidates.size > 0) {
          await filterAndEmit(l3Result.candidates, maxDocs, 3, mode, found,
            (kw) => send({ type: 'found', keyword: kw }),
            (msg) => send({ type: 'progress', message: `3단계 ${msg}`, done: 95, total: 100 })
          );
        }

        send({ type: 'done', total: found.size });
      } catch (err) {
        const msg = err instanceof Error ? err.message : '알 수 없는 오류';
        send({ type: 'progress', message: `오류: ${msg}`, done: 100, total: 100 });
        send({ type: 'done', total: 0 });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
