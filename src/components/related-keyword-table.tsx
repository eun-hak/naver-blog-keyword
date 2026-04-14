'use client';

import type { RelatedKeyword } from '@/types/keyword';

interface RelatedKeywordTableProps {
  keywords: Array<RelatedKeyword & { opportunityScore?: number }>;
  onKeywordClick?: (keyword: string) => void;
}

function formatNumber(num: number): string {
  return num.toLocaleString('ko-KR');
}

function getScoreBadgeClass(score: number): string {
  if (score >= 70) return 'bg-green-100 text-green-700';
  if (score >= 50) return 'bg-blue-100 text-blue-700';
  if (score >= 30) return 'bg-yellow-100 text-yellow-700';
  return 'bg-gray-100 text-gray-500';
}

function getRowClass(rank: number): string {
  if (rank === 1) return 'bg-amber-50 border-amber-200';
  if (rank === 2) return 'bg-gray-50 border-gray-200';
  if (rank === 3) return 'bg-orange-50 border-orange-200';
  return 'border-gray-100';
}

function getRankBadge(rank: number) {
  if (rank === 1)
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-400 text-white text-xs font-bold">
        1
      </span>
    );
  if (rank === 2)
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-400 text-white text-xs font-bold">
        2
      </span>
    );
  if (rank === 3)
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-orange-400 text-white text-xs font-bold">
        3
      </span>
    );
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 text-xs text-gray-400">
      {rank}
    </span>
  );
}

function getCompetitionLabel(totalBlogCount: number, monthlySearch: number): {
  label: string;
  className: string;
} {
  if (monthlySearch === 0) return { label: '-', className: 'text-gray-400' };
  const ratio = totalBlogCount / monthlySearch;
  if (ratio < 1) return { label: '매우 낮음', className: 'text-green-600 font-medium' };
  if (ratio < 5) return { label: '낮음', className: 'text-green-500' };
  if (ratio < 20) return { label: '보통', className: 'text-yellow-600' };
  return { label: '높음', className: 'text-red-500' };
}

export default function RelatedKeywordTable({
  keywords,
  onKeywordClick,
}: RelatedKeywordTableProps) {
  if (keywords.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">연관 키워드</h3>
        <p className="text-sm text-gray-400 text-center py-8">
          연관 키워드가 없습니다.
        </p>
      </div>
    );
  }

  // 기회 점수 기준 정렬 (서버에서 이미 정렬되어 오지만 방어적으로 한번 더)
  const sorted = [...keywords].sort(
    (a, b) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0)
  );

  const top3 = sorted.slice(0, 3);

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">
          연관 키워드{' '}
          <span className="text-gray-400 font-normal">({keywords.length}개)</span>
        </h3>
        <span className="text-xs text-gray-400">기회 점수 순 정렬</span>
      </div>

      {/* 상위 3개 추천 키워드 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        {top3.map((kw, i) => {
          const rank = i + 1;
          const borderColors = ['border-amber-300', 'border-gray-300', 'border-orange-300'];
          const bgColors = ['bg-amber-50', 'bg-gray-50', 'bg-orange-50'];
          const labels = ['🥇 최고 추천', '🥈 2위', '🥉 3위'];
          return (
            <button
              key={kw.keyword}
              onClick={() => onKeywordClick?.(kw.keyword)}
              className={`text-left p-3 rounded-lg border ${borderColors[i]} ${bgColors[i]} hover:opacity-80 transition-opacity`}
            >
              <div className="text-xs text-gray-500 mb-1">{labels[rank - 1]}</div>
              <div className="font-semibold text-gray-900 text-sm truncate mb-2">
                {kw.keyword}
              </div>
              <div className="flex justify-between text-xs text-gray-600">
                <span>검색 {formatNumber(kw.monthlyTotalQcCnt)}</span>
                {kw.totalBlogCount !== undefined && (
                  <span>문서 {formatNumber(kw.totalBlogCount)}</span>
                )}
              </div>
              {kw.opportunityScore != null && (
                <div className="mt-2">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getScoreBadgeClass(kw.opportunityScore)}`}
                  >
                    점수 {kw.opportunityScore}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* 전체 목록 테이블 */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-center py-2 px-2 text-xs font-medium text-gray-500 w-10">
                순위
              </th>
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">
                키워드
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">
                월간 검색량
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 hidden md:table-cell">
                블로그 문서수
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 hidden sm:table-cell">
                경쟁도
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">
                기회 점수
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((kw, i) => {
              const rank = i + 1;
              const competition =
                kw.totalBlogCount !== undefined
                  ? getCompetitionLabel(kw.totalBlogCount, kw.monthlyTotalQcCnt)
                  : null;
              return (
                <tr
                  key={kw.keyword}
                  className={`border-b ${getRowClass(rank)} hover:brightness-95 transition-all`}
                >
                  <td className="py-2.5 px-2 text-center">{getRankBadge(rank)}</td>
                  <td className="py-2.5 px-3">
                    <button
                      onClick={() => onKeywordClick?.(kw.keyword)}
                      className="text-blue-600 hover:text-blue-800 hover:underline text-left"
                      title={`"${kw.keyword}" 분석하기`}
                    >
                      {kw.keyword}
                    </button>
                  </td>
                  <td className="text-right py-2.5 px-3 font-medium text-gray-900">
                    {formatNumber(kw.monthlyTotalQcCnt)}
                  </td>
                  <td className="text-right py-2.5 px-3 text-gray-600 hidden md:table-cell">
                    {kw.totalBlogCount !== undefined
                      ? formatNumber(kw.totalBlogCount)
                      : '-'}
                  </td>
                  <td className="text-right py-2.5 px-3 hidden sm:table-cell">
                    {competition ? (
                      <span className={`text-xs ${competition.className}`}>
                        {competition.label}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">-</span>
                    )}
                  </td>
                  <td className="text-right py-2.5 px-3">
                    {kw.opportunityScore != null ? (
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getScoreBadgeClass(kw.opportunityScore)}`}
                      >
                        {kw.opportunityScore}
                      </span>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
