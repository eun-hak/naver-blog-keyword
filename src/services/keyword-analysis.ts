import { getSearchVolume } from '@/lib/naver-ad';
import { getContentAnalysis } from '@/lib/naver-search';
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

  const relatedKeywords = searchVolumeResult.relatedKeywords.map((rk) => ({
    ...rk,
    opportunityScore: calculateOpportunityScore({
      monthlySearchTotal: rk.monthlyTotalQcCnt,
      monthlyPublicationTotal: contentAnalysis.monthlyPublication.total,
      keyword: rk.keyword,
    }),
  }));

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
