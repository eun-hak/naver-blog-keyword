'use client';

import { type FormEvent } from 'react';

interface KeywordSearchFormProps {
  value: string;
  onChange: (keyword: string) => void;
  onSearch: (keyword: string) => void;
  isLoading: boolean;
}

export default function KeywordSearchForm({
  value,
  onChange,
  onSearch,
  isLoading,
}: KeywordSearchFormProps) {
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSearch(trimmed);
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      <div className="flex gap-3">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="분석할 키워드를 입력하세요"
          className="flex-1 px-4 py-3 text-base border border-gray-300 rounded-lg
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     bg-white text-gray-900 placeholder-gray-400"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !value.trim()}
          className="px-6 py-3 text-base font-medium text-white bg-blue-600 rounded-lg
                     hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed
                     transition-colors whitespace-nowrap"
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
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
              분석 중...
            </span>
          ) : (
            '키워드 분석'
          )}
        </button>
      </div>
    </form>
  );
}
