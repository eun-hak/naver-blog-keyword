import { getSearchVolume } from '@/lib/naver-ad';
import { getContentAnalysis, fetchBlogTotalCount } from '@/lib/naver-search';
import { getKeywordTrend } from '@/lib/naver-datalab';
import { analysisCache } from '@/lib/cache';
import { calculateAllMetrics, calculateOpportunityScore } from '@/utils/metrics';
import type { KeywordAnalysisResult } from '@/types/keyword';

const CACHE_PREFIX = 'analysis:';

export async function analyzeKeyword(
  keyword: string
): Promise<KeywordAnalysisResult> {
  const cacheKey = `${CACHE_PREFIX}${keyword.toLowerCase().trim()}`;
  const cached = analysisCache.get<KeywordAnalysisResult>(cacheKey);
  if (cached) return cached;

  const [searchVolumeResult, contentAnalysis, trendResult] = await Promise.all([
    getSearchVolume(keyword),
    getContentAnalysis(keyword),
    getKeywordTrend(keyword),
  ]);

  const metrics = calculateAllMetrics({
    monthlySearchTotal: searchVolumeResult.monthlyTotalQcCnt,
    monthlyPublicationTotal: contentAnalysis.monthlyPublication.total,
    keyword,
    trendPoints: trendResult.points,
  });

  // 검색량 기준 정렬 후 전체 연관 키워드의 블로그 총 문서수를 병렬 조회
  const topRelated = [...searchVolumeResult.relatedKeywords]
    .sort((a, b) => b.monthlyTotalQcCnt - a.monthlyTotalQcCnt);

  const blogCounts = await Promise.all(
    topRelated.map((rk) => fetchBlogTotalCount(rk.keyword))
  );

  const relatedKeywords = topRelated
    .map((rk, i) => ({
      ...rk,
      totalBlogCount: blogCounts[i],
      opportunityScore: calculateOpportunityScore({
        monthlySearchTotal: rk.monthlyTotalQcCnt,
        monthlyPublicationTotal: 0,
        totalBlogCount: blogCounts[i],
        keyword: rk.keyword,
      }),
    }))
    .sort((a, b) => b.opportunityScore - a.opportunityScore);

  const result: KeywordAnalysisResult = {
    keyword,
    searchVolume: {
      monthlyPc: searchVolumeResult.monthlyPcQcCnt,
      monthlyMobile: searchVolumeResult.monthlyMobileQcCnt,
      monthlyTotal: searchVolumeResult.monthlyTotalQcCnt,
    },
    content: contentAnalysis,
    trend: trendResult.points,
    metrics,
    relatedKeywords,
    analyzedAt: new Date().toISOString(),
  };

  analysisCache.set(cacheKey, result);

  return result;
}
