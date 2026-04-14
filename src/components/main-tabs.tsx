'use client';

import { useState } from 'react';
import KeywordAnalysisPanel from '@/components/keyword-analysis-panel';
import KeywordDiscoveryPanel from '@/components/keyword-discovery-panel';

const TABS = [
  { id: 'analyze', label: '키워드 분석', icon: '📊' },
  { id: 'discover', label: '키워드 발굴', icon: '🔍' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function MainTabs() {
  const [activeTab, setActiveTab] = useState<TabId>('analyze');

  return (
    <div className="space-y-5">
      {/* 탭 네비게이션 */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      {activeTab === 'analyze' && <KeywordAnalysisPanel />}
      {activeTab === 'discover' && <KeywordDiscoveryPanel />}
    </div>
  );
}
