import { NextRequest } from 'next/server';
import { fetchKeywordStats } from '@/lib/naver-ad';
import { fetchFastMonthlyBlogCount, fetchQuickMonthlyBlogCount } from '@/lib/naver-search';

export interface DiscoveredKeyword {
  keyword: string;
  monthlyTotalQcCnt: number;
  monthlyPcQcCnt: number;
  monthlyMobileQcCnt: number;
  monthlyBlogCount: number;
  isCapped: boolean;    // 빠른 모드: 실제 발행량이 100 이상일 수 있음
  isOver1000: boolean;  // 정확 모드: 외삽 여부
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
    docBatch: 8,        // 배치당 병렬 키워드 수
    docDelay: 150,      // 배치 사이 딜레이 (ms)
    hintDelay: 200,     // Ad API 배치 딜레이
    maxSeedsL2: 40,
    maxSeedsL3: 20,
    retryOnError: false,
    label: '빠른 발굴',
  },
  accurate: {
    docBatch: 3,        // 배치당 병렬 키워드 수 (각 2 API 콜 → 배치당 최대 6콜)
    docDelay: 600,      // rate limit 여유 딜레이
    hintDelay: 350,
    maxSeedsL2: 40,
    maxSeedsL3: 20,
    retryOnError: true,  // rate limit 에러 시 재시도
    label: '정확한 발굴',
  },
} as const;

type Mode = keyof typeof MODE_CONFIG;
const HINT_BATCH = 5;

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeCount(v: number | string): number {
  if (typeof v === 'string') return v === '< 10' ? 5 : (parseInt(v) || 0);
  return isNaN(v) ? 0 : v;
}

async function expandWithHints(
  seeds: string[],
  alreadySeen: Set<string>,
  minSearch: number,
  hintDelay: number,
  onProgress?: (msg: string) => void
): Promise<Map<string, { pc: number; mobile: number; total: number }>> {
  const discovered = new Map<string, { pc: number; mobile: number; total: number }>();

  for (let i = 0; i < seeds.length; i += HINT_BATCH) {
    const batch = seeds.slice(i, i + HINT_BATCH);
    onProgress?.(`Ad API ${Math.floor(i / HINT_BATCH) + 1}/${Math.ceil(seeds.length / HINT_BATCH)}`);

    try {
      const list = await fetchKeywordStats(batch);
      for (const item of list) {
        const kw = item.relKeyword;
        if (alreadySeen.has(kw)) continue;
        const pc = normalizeCount(item.monthlyPcQcCnt);
        const mobile = normalizeCount(item.monthlyMobileQcCnt);
        const total = pc + mobile;
        if (total >= minSearch) discovered.set(kw, { pc, mobile, total });
        alreadySeen.add(kw);
      }
    } catch { /* 배치 실패 무시 */ }

    if (i + HINT_BATCH < seeds.length) await delay(hintDelay);
  }

  return discovered;
}

async function filterAndEmit(
  candidates: Map<string, { pc: number; mobile: number; total: number }>,
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
      // 빠른 모드: 1 API 콜/키워드
      fetchResults = await Promise.all(batch.map((kw) => fetchFastMonthlyBlogCount(kw)));
    } else {
      // 정확 모드: 2 API 콜/키워드 + rate limit 에러 시 재시도
      fetchResults = await Promise.all(
        batch.map(async (kw) => {
          let res = await fetchQuickMonthlyBlogCount(kw);
          if (res.monthly === -1 && cfg.retryOnError) {
            await delay(1200); // rate limit 풀릴 때까지 대기
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

      // -1 은 에러 → 제외 / isCapped 는 실제 100+ → maxMonthly > 100이어야 포함
      if (monthly < 0) continue;
      if (isCapped && maxMonthly <= 100) continue; // 빠른 모드: 100 이상인데 threshold 낮으면 제외
      if (!isCapped && monthly > maxMonthly) continue;
      if (alreadyFound.has(kw)) continue;

      const effectiveMonthly = isCapped ? 100 : monthly; // 표시용
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
        catch { /* 스트림 종료 후 무시 */ }
      }

      try {
        const found = new Map<string, DiscoveredKeyword>();
        const seen = new Set<string>([keyword]);

        // ── 1단계 ──
        send({ type: 'progress', message: `"${keyword}" 연관 키워드 수집 중...`, done: 0, total: 100 });

        const rawL1 = await fetchKeywordStats([keyword]);
        const level1Candidates = new Map<string, { pc: number; mobile: number; total: number }>();

        for (const item of rawL1) {
          const kw = item.relKeyword;
          seen.add(kw);
          const pc = normalizeCount(item.monthlyPcQcCnt);
          const mobile = normalizeCount(item.monthlyMobileQcCnt);
          const total = pc + mobile;
          if (total >= minSearch) level1Candidates.set(kw, { pc, mobile, total });
        }

        send({ type: 'progress', message: `1단계: ${level1Candidates.size}개 후보 발견`, done: 5, total: 100 });

        await filterAndEmit(level1Candidates, maxDocs, 1, mode, found,
          (kw) => send({ type: 'found', keyword: kw }),
          (msg) => send({ type: 'progress', message: `1단계 ${msg}`, done: 10, total: 100 })
        );

        send({ type: 'progress', message: `1단계 완료 (${found.size}개). 2단계 확장 중...`, done: 30, total: 100 });

        // ── 2단계 ──
        const seeds2 = Array.from(level1Candidates.keys())
          .sort((a, b) => level1Candidates.get(b)!.total - level1Candidates.get(a)!.total)
          .slice(0, cfg.maxSeedsL2);

        const level2Candidates = await expandWithHints(seeds2, seen, minSearch, cfg.hintDelay,
          (msg) => send({ type: 'progress', message: `2단계 ${msg}`, done: 40, total: 100 })
        );

        if (level2Candidates.size > 0) {
          send({ type: 'progress', message: `2단계: ${level2Candidates.size}개 신규 후보`, done: 55, total: 100 });
          await filterAndEmit(level2Candidates, maxDocs, 2, mode, found,
            (kw) => send({ type: 'found', keyword: kw }),
            (msg) => send({ type: 'progress', message: `2단계 ${msg}`, done: 60, total: 100 })
          );
        }

        send({ type: 'progress', message: `2단계 완료 (${found.size}개). 3단계 심층 확장 중...`, done: 70, total: 100 });

        // ── 3단계 ──
        const seeds3 = [
          ...Array.from(level2Candidates.entries()).sort(([, a], [, b]) => b.total - a.total).slice(0, 10).map(([k]) => k),
          ...Array.from(level1Candidates.entries()).sort(([, a], [, b]) => b.total - a.total).slice(0, 10).map(([k]) => k),
        ].filter((k, i, arr) => arr.indexOf(k) === i).slice(0, cfg.maxSeedsL3);

        const level3Candidates = await expandWithHints(seeds3, seen, minSearch, cfg.hintDelay,
          (msg) => send({ type: 'progress', message: `3단계 ${msg}`, done: 80, total: 100 })
        );

        if (level3Candidates.size > 0) {
          send({ type: 'progress', message: `3단계: ${level3Candidates.size}개 신규 후보`, done: 88, total: 100 });
          await filterAndEmit(level3Candidates, maxDocs, 3, mode, found,
            (kw) => send({ type: 'found', keyword: kw }),
            (msg) => send({ type: 'progress', message: `3단계 ${msg}`, done: 92, total: 100 })
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
