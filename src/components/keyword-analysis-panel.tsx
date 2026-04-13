'use client';

import { useState } from 'react';
import KeywordSearchForm from './keyword-search-form';
import MetricCardGrid from './metric-card-grid';
import TrendChart from './trend-chart';
import RelatedKeywordTable from './related-keyword-table';
import type { KeywordAnalysisResult, AnalysisResponse } from '@/types/keyword';

type PanelState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: KeywordAnalysisResult }
  | { status: 'error'; message: string };

export default function KeywordAnalysisPanel() {
  const [state, setState] = useState<PanelState>({ status: 'idle' });

  const handleSearch = async (keyword: string) => {
    setState({ status: 'loading' });

    try {
      const res = await fetch(
        `/api/keywords/analyze?keyword=${encodeURIComponent(keyword)}`
      );
      const json: AnalysisResponse = await res.json();

      if (!json.success) {
        setState({ status: 'error', message: json.error });
        return;
      }

      setState({ status: 'success', data: json.data });
    } catch {
      setState({
        status: 'error',
        message: '네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
      });
    }
  };

  return (
    <div className="space-y-6">
      <KeywordSearchForm
        onSearch={handleSearch}
        isLoading={state.status === 'loading'}
      />

      {state.status === 'idle' && (
        <div className="text-center py-16">
          <div className="text-4xl mb-4 text-gray-300">
            <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <p className="text-gray-400 text-sm">
            키워드를 입력하면 검색량, 문서량, 추이, 기회 점수를 분석합니다.
          </p>
        </div>
      )}

      {state.status === 'loading' && (
        <div className="text-center py-16">
          <svg
            className="animate-spin h-8 w-8 mx-auto text-blue-500 mb-4"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12" cy="12" r="10"
              stroke="currentColor" strokeWidth="4" fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <p className="text-gray-500 text-sm">
            키워드를 분석하고 있습니다...
          </p>
          <p className="text-gray-400 text-xs mt-1">
            네이버 API를 조회하는 중이며 수 초 정도 소요될 수 있습니다.
          </p>
        </div>
      )}

      {state.status === 'error' && (
        <div className="text-center py-12">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md mx-auto">
            <p className="text-red-600 font-medium text-sm mb-1">분석 실패</p>
            <p className="text-red-500 text-sm">{state.message}</p>
          </div>
        </div>
      )}

      {state.status === 'success' && (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-gray-800">
              &quot;{state.data.keyword}&quot; 분석 결과
            </h2>
            <span className="text-xs text-gray-400">
              {new Date(state.data.analyzedAt).toLocaleString('ko-KR')}
            </span>
          </div>

          <MetricCardGrid data={state.data} />

          <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
            <TrendChart
              data={state.data.trend}
              keyword={state.data.keyword}
            />
          </div>

          <RelatedKeywordTable
            keywords={state.data.relatedKeywords}
            onKeywordClick={handleSearch}
          />
        </div>
      )}
    </div>
  );
}
