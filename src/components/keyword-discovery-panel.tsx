'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { DiscoveredKeyword, DiscoverEvent } from '@/app/api/keywords/discover/route';

type Mode = 'fast' | 'accurate';

function formatNum(n: number) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`;
  return n.toLocaleString();
}

type SortKey = 'opportunityRatio' | 'monthlyTotalQcCnt' | 'monthlyBlogCount';

const PRESETS = [
  { label: '블루오션', maxDocs: 100, minSearch: 100 },
  { label: '적정', maxDocs: 500, minSearch: 100 },
  { label: '넓게', maxDocs: 1000, minSearch: 50 },
];

const MODE_INFO: Record<Mode, { label: string; desc: string; time: string; color: string }> = {
  fast: {
    label: '⚡ 빠른 발굴',
    desc: '1 API콜/키워드 · API 부하 낮음 · 월발행 100+ 키워드는 근사치',
    time: '약 30~90초',
    color: 'blue',
  },
  accurate: {
    label: '🎯 정확한 발굴',
    desc: '2 API콜/키워드 · 외삽으로 정확한 월발행량 · rate limit 재시도',
    time: '약 2~5분',
    color: 'purple',
  },
};

export default function KeywordDiscoveryPanel() {
  const [keyword, setKeyword] = useState('');
  const [maxDocs, setMaxDocs] = useState(500);
  const [minSearch, setMinSearch] = useState(100);
  const [mode, setMode] = useState<Mode>('fast');
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
    else { setSortKey(key); setSortAsc(false); }
  };

  const handleStart = useCallback(async () => {
    if (!keyword.trim()) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setIsRunning(true);
    setResults([]);
    setIsDone(false);
    setLogs([`🚀 "${keyword}" ${MODE_INFO[mode].label} 시작 (예상 소요: ${MODE_INFO[mode].time})`]);
    setProgressPct(0);

    try {
      const res = await fetch('/api/keywords/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: keyword.trim(), maxDocs, minSearch, mode }),
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
              setResults((prev) => [...prev, kw]);
              const pubLabel = kw.isCapped
                ? `${kw.monthlyBlogCount}건+`
                : `${kw.monthlyBlogCount}건`;
              setLogs((prev) => [
                ...prev,
                `  ✅ [${kw.level}단계] ${kw.keyword} — 검색 ${formatNum(kw.monthlyTotalQcCnt)} / 월발행 ${pubLabel}`,
              ]);
            } else if (event.type === 'done') {
              setIsDone(true);
              setProgressPct(100);
            }
          } catch { /* 파싱 오류 무시 */ }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setLogs((prev) => [...prev, `❌ 오류: ${err.message}`]);
      }
    } finally {
      setIsRunning(false);
      setIsDone(true);
      setLogs((prev) => [...prev, `🏁 완료 (${results.length}개 발굴)`]);
    }
  }, [keyword, maxDocs, minSearch, mode, results.length]);

  const handleStop = () => {
    abortRef.current?.abort();
    setIsRunning(false);
    setIsDone(true);
    setLogs((prev) => [...prev, '⏹ 중지됨']);
  };

  const exportCSV = () => {
    const header = '키워드,월검색량,PC,모바일,월간발행량,근사치여부,기회비율,단계';
    const rows = sorted.map((k) =>
      `${k.keyword},${k.monthlyTotalQcCnt},${k.monthlyPcQcCnt},${k.monthlyMobileQcCnt},${k.monthlyBlogCount}${k.isCapped ? '+' : ''},${k.isCapped ? '근사' : '정확'},${k.opportunityRatio.toFixed(1)},${k.level}`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `discover-${keyword}-${mode}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const SortBtn = ({ col, label }: { col: SortKey; label: string }) => (
    <button
      onClick={() => handleSort(col)}
      className={`flex items-center gap-0.5 text-xs ${sortKey === col ? 'text-blue-600 font-semibold' : 'text-gray-400 hover:text-gray-700'}`}
    >
      {label}
      <span className="text-[10px]">{sortKey === col ? (sortAsc ? '▲' : '▼') : '↕'}</span>
    </button>
  );

  const hasStarted = logs.length > 0;
  const hasResults = results.length > 0;

  return (
    <div className="space-y-4">
      {/* ── 모드 선택 ── */}
      <div className="grid grid-cols-2 gap-3">
        {(Object.entries(MODE_INFO) as [Mode, typeof MODE_INFO[Mode]][]).map(([m, info]) => (
          <button
            key={m}
            onClick={() => !isRunning && setMode(m)}
            disabled={isRunning}
            className={`text-left p-3.5 rounded-xl border-2 transition-all ${
              mode === m
                ? m === 'fast'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-purple-500 bg-purple-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            } disabled:opacity-50`}
          >
            <div className={`text-sm font-semibold mb-0.5 ${mode === m ? (m === 'fast' ? 'text-blue-700' : 'text-purple-700') : 'text-gray-700'}`}>
              {info.label}
            </div>
            <div className="text-xs text-gray-500 leading-4">{info.desc}</div>
            <div className={`text-xs mt-1.5 font-medium ${mode === m ? (m === 'fast' ? 'text-blue-500' : 'text-purple-500') : 'text-gray-400'}`}>
              ⏱ {info.time}
            </div>
          </button>
        ))}
      </div>

      {/* ── 조건 설정 ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48">
            <label className="text-xs text-gray-500 mb-1 block">시드 키워드</label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !isRunning && handleStart()}
              placeholder="예: 운세"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isRunning}
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">월간발행 ≤</label>
            <input
              type="number"
              value={maxDocs}
              onChange={(e) => setMaxDocs(Number(e.target.value))}
              className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
              min={0}
              disabled={isRunning}
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">검색량 ≥</label>
            <input
              type="number"
              value={minSearch}
              onChange={(e) => setMinSearch(Number(e.target.value))}
              className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
              min={0}
              disabled={isRunning}
            />
          </div>

          <div className="flex gap-2">
            {isRunning ? (
              <button onClick={handleStop} className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600">
                중지
              </button>
            ) : (
              <button
                onClick={handleStart}
                disabled={!keyword.trim()}
                className={`px-4 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-40 transition-colors ${
                  mode === 'fast' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-purple-600 hover:bg-purple-700'
                }`}
              >
                발굴 시작
              </button>
            )}
          </div>
        </div>

        {/* 프리셋 */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400">빠른설정:</span>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => { setMaxDocs(p.maxDocs); setMinSearch(p.minSearch); }}
              disabled={isRunning}
              className="text-xs px-2.5 py-1 border border-gray-200 rounded-full text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors disabled:opacity-40"
            >
              {p.label} (발행≤{p.maxDocs} / 검색≥{p.minSearch})
            </button>
          ))}
          {mode === 'fast' && (
            <span className="text-xs text-amber-500 ml-1">⚡ 빠른 모드: 월발행 100+ 키워드는 근사치(~)로 표시</span>
          )}
        </div>

        {/* 진행바 */}
        {hasStarted && (
          <div className="mt-3">
            <div className="w-full bg-gray-100 rounded-full h-1">
              <div
                className={`h-1 rounded-full transition-all duration-500 ${
                  isDone ? 'bg-green-500' : mode === 'fast' ? 'bg-blue-500' : 'bg-purple-500'
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
                <span className="flex items-center gap-1.5 text-xs text-green-400">
                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                  실행 중
                </span>
              )}
              {isDone && !isRunning && <span className="text-xs text-gray-500">완료</span>}
            </div>
            <div ref={logRef} className="h-80 overflow-y-auto p-4 space-y-0.5 font-mono">
              {logs.map((log, i) => (
                <div
                  key={i}
                  className={`text-xs leading-5 ${
                    log.includes('✅') ? 'text-green-400' :
                    log.includes('❌') ? 'text-red-400' :
                    log.includes('🏁') || log.includes('🚀') ? 'text-yellow-400' :
                    'text-gray-500'
                  }`}
                >
                  {log}
                </div>
              ))}
              {isRunning && <div className="text-xs text-gray-600 animate-pulse">▋</div>}
            </div>
          </div>

          {/* 결과 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-800">발굴 결과</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${mode === 'fast' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                  {results.length}개
                </span>
                {mode === 'accurate' && (
                  <span className="text-xs text-purple-500">정확한 수치</span>
                )}
              </div>
              {isDone && results.length > 0 && (
                <button onClick={exportCSV} className="text-xs text-gray-400 hover:text-blue-600 border border-gray-200 rounded-md px-2.5 py-1">
                  CSV
                </button>
              )}
            </div>

            {hasResults ? (
              <div className="h-80 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50 border-b border-gray-100 z-10">
                    <tr>
                      <th className="text-left py-2 px-3 text-gray-400 w-6">#</th>
                      <th className="text-left py-2 px-2 text-gray-400">키워드</th>
                      <th className="text-right py-2 px-2"><SortBtn col="monthlyTotalQcCnt" label="검색량" /></th>
                      <th className="text-right py-2 px-2"><SortBtn col="monthlyBlogCount" label="월발행" /></th>
                      <th className="text-right py-2 px-2"><SortBtn col="opportunityRatio" label="기회" /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((kw, i) => (
                      <tr key={kw.keyword} className={`border-b border-gray-50 hover:bg-gray-50 ${i < 3 ? 'bg-amber-50/40' : ''}`}>
                        <td className="py-2 px-3 text-gray-300">{i + 1}</td>
                        <td className="py-2 px-2 font-medium text-gray-800">
                          <div className="flex items-center gap-1">
                            <span>{kw.keyword}</span>
                            <span className={`text-[10px] ${kw.level === 1 ? 'text-blue-400' : kw.level === 2 ? 'text-purple-400' : 'text-teal-400'}`}>
                              {kw.level}단계
                            </span>
                          </div>
                        </td>
                        <td className="py-2 px-2 text-right text-gray-700 font-mono">{formatNum(kw.monthlyTotalQcCnt)}</td>
                        <td className="py-2 px-2 text-right font-mono">
                          <span className={
                            kw.isCapped ? 'text-amber-500' :
                            kw.monthlyBlogCount <= 50 ? 'text-green-600 font-semibold' :
                            kw.monthlyBlogCount <= 200 ? 'text-orange-500' : 'text-gray-600'
                          }>
                            {kw.isCapped ? `~${kw.monthlyBlogCount}+` : kw.monthlyBlogCount}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right"><OppBadge ratio={kw.opportunityRatio} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-80 flex items-center justify-center text-gray-300 text-sm">
                {isRunning ? '탐색 중...' : '결과 없음'}
              </div>
            )}

            {/* 범례 */}
            {hasResults && mode === 'fast' && (
              <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
                <p className="text-xs text-gray-400">
                  <span className="text-amber-500 font-medium">~100+</span> = 실제 월발행 100 이상 (근사치) · 정확한 값은 <span className="text-purple-500">정확한 발굴</span> 모드 사용
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 초기 상태 */}
      {!hasStarted && (
        <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-10 text-center">
          <div className="text-3xl mb-3">🔍</div>
          <p className="text-sm font-medium text-gray-600 mb-1">키워드 자동 발굴</p>
          <p className="text-xs text-gray-400 mb-5">
            3단계 확장 탐색으로 월간 발행량이 적고 검색량이 높은 블루오션 키워드를 찾습니다
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {['운세', '로블록스', '다이어트', '주식투자', '부업'].map((kw) => (
              <button key={kw} onClick={() => setKeyword(kw)}
                className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors">
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
  if (ratio >= 200) return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-600">최고</span>;
  if (ratio >= 50)  return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-600">높음</span>;
  if (ratio >= 10)  return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-100 text-yellow-600">보통</span>;
  return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-500">낮음</span>;
}
