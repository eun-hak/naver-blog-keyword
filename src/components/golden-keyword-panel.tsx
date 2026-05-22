'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type {
  DiscoveredKeyword,
  DiscoverEvent,
} from '@/app/api/keywords/discover/route';

function formatNum(n: number) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`;
  return n.toLocaleString();
}

type SortKey = 'opportunityRatio' | 'monthlyTotalQcCnt' | 'monthlyBlogCount';

export default function GoldenKeywordPanel() {
  const [keyword, setKeyword] = useState('');
  const [maxDocs, setMaxDocs] = useState(30);
  const [minSearch, setMinSearch] = useState(1000);
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [results, setResults] = useState<DiscoveredKeyword[]>([]);
  const [isDone, setIsDone] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('opportunityRatio');
  const [sortAsc, setSortAsc] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const sorted = [...results].sort((a, b) => {
    const diff = (a[sortKey] as number) - (b[sortKey] as number);
    return sortAsc ? diff : -diff;
  });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const handleStart = useCallback(async () => {
    if (!keyword.trim()) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setIsRunning(true);
    setResults([]);
    setIsDone(false);
    setLogs([
      `🏆 "${keyword}" 황금 키워드 탐색 시작 — 월발행 < ${maxDocs} · 검색량 ≥ ${minSearch.toLocaleString()}`,
    ]);
    setProgressPct(0);

    let localCount = 0;

    try {
      const res = await fetch('/api/keywords/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: keyword.trim(),
          maxDocs,
          minSearch,
          mode: 'fast',
        }),
        signal: abortRef.current.signal,
      });

      if (!res.body) throw new Error('No stream');
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event: DiscoverEvent = JSON.parse(line.slice(6));
            if (event.type === 'progress') {
              setLogs((prev) => [...prev, `  ${event.message}`]);
              setProgressPct(event.done);
            } else if (event.type === 'found') {
              const kw = event.keyword;
              // 황금은 정확한 수치만 인정 — 100+ 근사치(isCapped)는 제외
              if (kw.isCapped) continue;
              localCount++;
              setResults((prev) => [...prev, kw]);
              setLogs((prev) => [
                ...prev,
                `  🏆 [${kw.level}단계] ${kw.keyword} — 검색 ${formatNum(kw.monthlyTotalQcCnt)} / 월발행 ${kw.monthlyBlogCount}건`,
              ]);
            } else if (event.type === 'done') {
              setIsDone(true);
              setProgressPct(100);
            }
          } catch {
            /* 파싱 오류 무시 */
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setLogs((prev) => [...prev, `❌ 오류: ${err.message}`]);
      }
    } finally {
      setIsRunning(false);
      setIsDone(true);
      setLogs((prev) => [...prev, `🏁 완료 — 황금 ${localCount}개 발견`]);
    }
  }, [keyword, maxDocs, minSearch]);

  const handleStop = () => {
    abortRef.current?.abort();
    setIsRunning(false);
    setIsDone(true);
    setLogs((prev) => [...prev, '⏹ 중지됨']);
  };

  const exportCSV = () => {
    const header = '키워드,월검색량,PC,모바일,월간발행량,기회비율,단계';
    const rows = sorted.map(
      (k) =>
        `${k.keyword},${k.monthlyTotalQcCnt},${k.monthlyPcQcCnt},${k.monthlyMobileQcCnt},${k.monthlyBlogCount},${k.opportunityRatio.toFixed(1)},${k.level}`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['﻿' + csv], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `golden-${keyword}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortBtn = ({ col, label }: { col: SortKey; label: string }) => (
    <button
      onClick={() => handleSort(col)}
      className={`flex items-center gap-0.5 text-xs ${
        sortKey === col
          ? 'text-amber-600 font-semibold'
          : 'text-gray-400 hover:text-gray-700'
      }`}
    >
      {label}
      <span className="text-[10px]">
        {sortKey === col ? (sortAsc ? '▲' : '▼') : '↕'}
      </span>
    </button>
  );

  const hasStarted = logs.length > 0;
  const hasResults = results.length > 0;

  return (
    <div className="space-y-4">
      {/* ── 안내 카드 ── */}
      <div className="bg-gradient-to-r from-amber-50 to-yellow-50 rounded-xl border-2 border-amber-200 p-3.5">
        <div className="flex items-start gap-2.5">
          <span className="text-2xl">🏆</span>
          <div>
            <div className="text-sm font-semibold text-amber-900 mb-0.5">
              황금 키워드 발굴
            </div>
            <div className="text-xs text-amber-700 leading-5">
              월간 발행량이 매우 적으면서 검색량이 높은{' '}
              <span className="font-semibold">&quot;수요 ≫ 공급&quot;</span>{' '}
              키워드만 추립니다. 빠른 모드 고정 · 100+ 근사치 키워드는 자동 제외.
            </div>
          </div>
        </div>
      </div>

      {/* ── 조건 설정 ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48">
            <label className="text-xs text-gray-500 mb-1 block">
              시드 키워드
            </label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) =>
                e.key === 'Enter' && !isRunning && handleStart()
              }
              placeholder="예: 축구"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              disabled={isRunning}
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              월발행 &lt;
            </label>
            <input
              type="number"
              value={maxDocs}
              onChange={(e) => setMaxDocs(Number(e.target.value))}
              className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-amber-500"
              min={0}
              disabled={isRunning}
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              검색량 ≥
            </label>
            <input
              type="number"
              value={minSearch}
              onChange={(e) => setMinSearch(Number(e.target.value))}
              className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-amber-500"
              min={0}
              disabled={isRunning}
            />
          </div>

          <div className="flex gap-2">
            {isRunning ? (
              <button
                onClick={handleStop}
                className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600"
              >
                중지
              </button>
            ) : (
              <button
                onClick={handleStart}
                disabled={!keyword.trim()}
                className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium disabled:opacity-40 transition-colors hover:bg-amber-600"
              >
                🏆 황금 발굴
              </button>
            )}
          </div>
        </div>

        {/* 프리셋 */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400">빠른설정:</span>
          {[
            { label: '엄격', maxDocs: 30, minSearch: 1000 },
            { label: '표준', maxDocs: 50, minSearch: 500 },
            { label: '완화', maxDocs: 80, minSearch: 300 },
          ].map((p) => (
            <button
              key={p.label}
              onClick={() => {
                setMaxDocs(p.maxDocs);
                setMinSearch(p.minSearch);
              }}
              disabled={isRunning}
              className="text-xs px-2.5 py-1 border border-gray-200 rounded-full text-gray-500 hover:border-amber-400 hover:text-amber-600 transition-colors disabled:opacity-40"
            >
              {p.label} (발행&lt;{p.maxDocs} / 검색≥{p.minSearch})
            </button>
          ))}
        </div>

        {/* 진행바 */}
        {hasStarted && (
          <div className="mt-3">
            <div className="w-full bg-gray-100 rounded-full h-1">
              <div
                className={`h-1 rounded-full transition-all duration-500 ${
                  isDone ? 'bg-green-500' : 'bg-amber-500'
                } ${isRunning ? 'animate-pulse' : ''}`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── 로그 + 결과 ── */}
      {hasStarted && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 로그 */}
          <div className="bg-gray-950 rounded-xl border border-gray-800 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800">
              <span className="text-xs font-mono text-gray-400">탐색 로그</span>
              {isRunning && (
                <span className="flex items-center gap-1.5 text-xs text-amber-400">
                  <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
                  실행 중
                </span>
              )}
              {isDone && !isRunning && (
                <span className="text-xs text-gray-500">완료</span>
              )}
            </div>
            <div
              ref={logRef}
              className="h-80 overflow-y-auto p-4 space-y-0.5 font-mono"
            >
              {logs.map((log, i) => (
                <div
                  key={i}
                  className={`text-xs leading-5 ${
                    log.includes('🏆')
                      ? 'text-amber-400'
                      : log.includes('❌')
                        ? 'text-red-400'
                        : log.includes('🏁')
                          ? 'text-yellow-400'
                          : 'text-gray-500'
                  }`}
                >
                  {log}
                </div>
              ))}
              {isRunning && (
                <div className="text-xs text-gray-600 animate-pulse">▋</div>
              )}
            </div>
          </div>

          {/* 결과 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-800">
                  🏆 황금 키워드
                </span>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                  {results.length}개
                </span>
              </div>
              {isDone && results.length > 0 && (
                <button
                  onClick={exportCSV}
                  className="text-xs text-gray-400 hover:text-amber-600 border border-gray-200 rounded-md px-2.5 py-1"
                >
                  CSV
                </button>
              )}
            </div>

            {hasResults ? (
              <div className="h-80 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50 border-b border-gray-100 z-10">
                    <tr>
                      <th className="text-left py-2 px-3 text-gray-400 w-6">
                        #
                      </th>
                      <th className="text-left py-2 px-2 text-gray-400">
                        키워드
                      </th>
                      <th className="text-right py-2 px-2">
                        <SortBtn col="monthlyTotalQcCnt" label="검색량" />
                      </th>
                      <th className="text-right py-2 px-2">
                        <SortBtn col="monthlyBlogCount" label="월발행" />
                      </th>
                      <th className="text-right py-2 px-2">
                        <SortBtn col="opportunityRatio" label="기회" />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((kw, i) => (
                      <tr
                        key={kw.keyword}
                        className={`border-b border-gray-50 hover:bg-amber-50/30 ${
                          i < 3 ? 'bg-amber-50/40' : ''
                        }`}
                      >
                        <td className="py-2 px-3 text-gray-300">{i + 1}</td>
                        <td className="py-2 px-2 font-medium text-gray-800">
                          <div className="flex items-center gap-1">
                            <span>{kw.keyword}</span>
                            <span
                              className={`text-[10px] ${
                                kw.level === 1
                                  ? 'text-blue-400'
                                  : kw.level === 2
                                    ? 'text-purple-400'
                                    : 'text-teal-400'
                              }`}
                            >
                              {kw.level}단계
                            </span>
                          </div>
                        </td>
                        <td className="py-2 px-2 text-right text-gray-700 font-mono">
                          {formatNum(kw.monthlyTotalQcCnt)}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-green-600 font-semibold">
                          {kw.monthlyBlogCount}
                        </td>
                        <td className="py-2 px-2 text-right">
                          <OppBadge ratio={kw.opportunityRatio} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-80 flex items-center justify-center text-gray-300 text-sm">
                {isRunning
                  ? '탐색 중...'
                  : isDone
                    ? '황금 키워드 없음 — 조건을 완화해보세요'
                    : '결과 없음'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 초기 상태 ── */}
      {!hasStarted && (
        <div className="bg-amber-50/30 rounded-xl border border-dashed border-amber-200 p-10 text-center">
          <div className="text-3xl mb-3">🏆</div>
          <p className="text-sm font-medium text-amber-700 mb-1">
            황금 키워드 발굴
          </p>
          <p className="text-xs text-amber-600/70 mb-5">
            월간 발행 {maxDocs} 미만 · 월간 검색{' '}
            {minSearch.toLocaleString()} 이상의 블루오션 키워드
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {['축구', '운세', '로블록스', '다이어트', '부업'].map((kw) => (
              <button
                key={kw}
                onClick={() => setKeyword(kw)}
                className="px-3 py-1.5 bg-white border border-amber-200 rounded-full text-xs text-amber-700 hover:border-amber-400 hover:bg-amber-50 transition-colors"
              >
                {kw}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OppBadge({ ratio }: { ratio: number }) {
  if (ratio >= 200)
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-600">
        최고
      </span>
    );
  if (ratio >= 50)
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-600">
        높음
      </span>
    );
  if (ratio >= 10)
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-100 text-yellow-600">
        보통
      </span>
    );
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-500">
      낮음
    </span>
  );
}
