import KeywordAnalysisPanel from '@/components/keyword-analysis-panel';

export default function Home() {
  return (
    <main className="flex-1">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">
              키워드 분석기
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              네이버 검색량 · 문서량 · 추이 · 경쟁도 분석
            </p>
          </div>
          <span className="text-xs text-gray-300 hidden sm:block">
            Naver Keyword Analyzer
          </span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <KeywordAnalysisPanel />
      </div>

      <footer className="border-t border-gray-200 bg-white mt-auto">
        <div className="max-w-6xl mx-auto px-4 py-3 text-center">
          <p className="text-xs text-gray-400">
            네이버 검색광고 API · 네이버 검색 API · 네이버 데이터랩 API 기반
          </p>
        </div>
      </footer>
    </main>
  );
}
