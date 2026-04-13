'use client';

import type { KeywordAnalysisResult } from '@/types/keyword';

interface MetricCardGridProps {
  data: KeywordAnalysisResult;
}

function formatNumber(num: number): string {
  return num.toLocaleString('ko-KR');
}

function getSaturationLabel(index: number): string {
  if (index < 1) return '매우 낮음';
  if (index < 5) return '낮음';
  if (index < 20) return '보통';
  if (index < 50) return '높음';
  return '매우 높음';
}

function getOpportunityLabel(score: number): string {
  if (score >= 70) return '매우 좋음';
  if (score >= 50) return '좋음';
  if (score >= 30) return '보통';
  return '낮음';
}

function getOpportunityColor(score: number): string {
  if (score >= 70) return 'text-green-600';
  if (score >= 50) return 'text-blue-600';
  if (score >= 30) return 'text-yellow-600';
  return 'text-red-500';
}

function getSaturationColor(index: number): string {
  if (index < 1) return 'text-green-600';
  if (index < 5) return 'text-blue-600';
  if (index < 20) return 'text-yellow-600';
  if (index < 50) return 'text-orange-500';
  return 'text-red-500';
}

export default function MetricCardGrid({ data }: MetricCardGridProps) {
  const { searchVolume, content, metrics } = data;

  const pcPercent = searchVolume.monthlyTotal > 0
    ? Math.round((searchVolume.monthlyPc / searchVolume.monthlyTotal) * 100)
    : 0;
  const mobilePercent = searchVolume.monthlyTotal > 0
    ? Math.round((searchVolume.monthlyMobile / searchVolume.monthlyTotal) * 100)
    : 0;

  return (
    <div className="space-y-4">
      {/* 월간 검색량 */}
      <div>
        <h3 className="text-xs font-medium text-gray-400 mb-2 tracking-wide">
          월간 검색량
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <MetricCard
            label="PC"
            value={formatNumber(searchVolume.monthlyPc)}
            sub={`${pcPercent}%`}
            borderColor="border-blue-500"
          />
          <MetricCard
            label="모바일"
            value={formatNumber(searchVolume.monthlyMobile)}
            sub={`${mobilePercent}%`}
            borderColor="border-purple-500"
          />
          <MetricCard
            label="Total"
            value={formatNumber(searchVolume.monthlyTotal)}
            borderColor="border-indigo-500"
            highlight
          />
        </div>
      </div>

      {/* 월간 콘텐츠 발행량 */}
      <div>
        <h3 className="text-xs font-medium text-gray-400 mb-2 tracking-wide">
          월간 콘텐츠 발행량
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <MetricCard
            label="블로그"
            value={formatNumber(content.monthlyPublication.blog)}
            borderColor="border-green-500"
          />
          <MetricCard
            label="카페"
            value={formatNumber(content.monthlyPublication.cafe)}
            sub="추정"
            borderColor="border-teal-500"
          />
          <MetricCard
            label="전체"
            value={formatNumber(content.monthlyPublication.total)}
            borderColor="border-emerald-500"
            highlight
          />
        </div>
      </div>

      {/* 분석 지표 */}
      <div>
        <h3 className="text-xs font-medium text-gray-400 mb-2 tracking-wide">
          분석 지표
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-lg border-l-4 border-orange-500 p-4 shadow-sm">
            <p className="text-xs text-gray-500 mb-1">콘텐츠 포화지수</p>
            <p className={`text-2xl font-bold ${getSaturationColor(metrics.saturationIndex)}`}>
              {metrics.saturationIndex.toFixed(1)}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {getSaturationLabel(metrics.saturationIndex)}
            </p>
          </div>
          <div className="bg-white rounded-lg border-l-4 border-rose-500 p-4 shadow-sm">
            <p className="text-xs text-gray-500 mb-1">기회 점수</p>
            <p className={`text-2xl font-bold ${getOpportunityColor(metrics.opportunityScore)}`}>
              {metrics.opportunityScore}점
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {getOpportunityLabel(metrics.opportunityScore)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  borderColor,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  borderColor: string;
  highlight?: boolean;
}) {
  return (
    <div className={`bg-white rounded-lg border-l-4 ${borderColor} p-4 shadow-sm`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-bold text-gray-900 ${highlight ? 'text-2xl' : ''}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}
