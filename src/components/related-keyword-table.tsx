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
  return 'bg-gray-100 text-gray-600';
}

export default function RelatedKeywordTable({
  keywords,
  onKeywordClick,
}: RelatedKeywordTableProps) {
  if (keywords.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">
          연관 키워드
        </h3>
        <p className="text-sm text-gray-400 text-center py-8">
          연관 키워드가 없습니다.
        </p>
      </div>
    );
  }

  const sorted = [...keywords].sort(
    (a, b) => b.monthlyTotalQcCnt - a.monthlyTotalQcCnt
  );

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">
        연관 키워드 ({keywords.length}개)
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">
                키워드
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">
                월간 검색량
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 hidden sm:table-cell">
                PC
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 hidden sm:table-cell">
                모바일
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">
                기회 점수
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((kw) => (
              <tr
                key={kw.keyword}
                className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
              >
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
                <td className="text-right py-2.5 px-3 text-gray-600 hidden sm:table-cell">
                  {formatNumber(kw.monthlyPcQcCnt)}
                </td>
                <td className="text-right py-2.5 px-3 text-gray-600 hidden sm:table-cell">
                  {formatNumber(kw.monthlyMobileQcCnt)}
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
