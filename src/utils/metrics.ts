import { METRICS_CONFIG } from '@/constants';
import type { TrendPoint, KeywordMetrics } from '@/types/keyword';

const {
  OPPORTUNITY_WEIGHTS,
  SATURATION_DECIMAL_PLACES,
  OPPORTUNITY_SCORE_MAX,
  OPPORTUNITY_SCORE_MIN,
  LONG_TAIL_WORD_COUNT_THRESHOLD,
} = METRICS_CONFIG;

/**
 * 콘텐츠 포화지수: 월간 발행량 대비 월간 검색량 비율.
 * 값이 높을수록 경쟁이 치열함 (콘텐츠 공급 > 검색 수요).
 * 예: 월간 발행 100건, 월간 검색 18,700건 → 0.53
 */
export function calculateSaturationIndex(
  monthlyPublicationTotal: number,
  monthlySearchTotal: number
): number {
  if (monthlySearchTotal === 0) return 0;
  const raw = (monthlyPublicationTotal / monthlySearchTotal) * 100;
  return Number(raw.toFixed(SATURATION_DECIMAL_PLACES));
}

export function calculatePredictedMonthlySearch(
  monthlySearchTotal: number,
  trendPoints: TrendPoint[]
): number | null {
  if (trendPoints.length < 4) return null;

  const recent = trendPoints.slice(-4);
  const older = trendPoints.slice(-8, -4);

  if (older.length === 0) return monthlySearchTotal;

  const recentAvg =
    recent.reduce((sum, p) => sum + p.ratio, 0) / recent.length;
  const olderAvg =
    older.reduce((sum, p) => sum + p.ratio, 0) / older.length;

  if (olderAvg === 0) return monthlySearchTotal;

  const trendMultiplier = recentAvg / olderAvg;
  return Math.round(monthlySearchTotal * trendMultiplier);
}

/**
 * 기회 점수 (0~100): 이 키워드로 콘텐츠를 만들었을 때의 노출 가능성.
 * - 검색량이 높을수록 가산
 * - 월간 발행량이 적을수록 가산 (경쟁 적음)
 * - 롱테일 키워드 보너스
 * - 상승 추세 보너스
 */
export function calculateOpportunityScore(params: {
  monthlySearchTotal: number;
  monthlyPublicationTotal: number;
  keyword: string;
  trendPoints?: TrendPoint[];
}): number {
  const { monthlySearchTotal, monthlyPublicationTotal, keyword, trendPoints } = params;

  if (monthlySearchTotal === 0) return 0;

  // 검색량 점수: log 스케일 정규화 (0~40)
  const searchScore =
    Math.min(Math.log10(Math.max(monthlySearchTotal, 1)) / 5, 1) *
    OPPORTUNITY_SCORE_MAX *
    OPPORTUNITY_WEIGHTS.SEARCH_VOLUME;

  // 경쟁도 점수: 월간 발행량 대비 검색량 (발행 적을수록 높음) (0~35)
  const pubToSearchRatio = monthlyPublicationTotal / Math.max(monthlySearchTotal, 1);
  const competitionScore =
    Math.max(1 - Math.min(pubToSearchRatio * 10, 1), 0) *
    OPPORTUNITY_SCORE_MAX *
    OPPORTUNITY_WEIGHTS.LOW_COMPETITION;

  // 롱테일 보너스 (0~15)
  const wordCount = keyword.trim().split(/\s+/).length;
  const longTailScore =
    wordCount >= LONG_TAIL_WORD_COUNT_THRESHOLD
      ? OPPORTUNITY_SCORE_MAX * OPPORTUNITY_WEIGHTS.LONG_TAIL_BONUS
      : (wordCount / LONG_TAIL_WORD_COUNT_THRESHOLD) *
        OPPORTUNITY_SCORE_MAX *
        OPPORTUNITY_WEIGHTS.LONG_TAIL_BONUS;

  // 추세 보너스: 최근 상승세 (0~10)
  let trendScore = 0;
  if (trendPoints && trendPoints.length >= 4) {
    const recent = trendPoints.slice(-4);
    const older = trendPoints.slice(-8, -4);
    if (older.length > 0) {
      const recentAvg =
        recent.reduce((sum, p) => sum + p.ratio, 0) / recent.length;
      const olderAvg =
        older.reduce((sum, p) => sum + p.ratio, 0) / older.length;
      if (olderAvg > 0 && recentAvg > olderAvg) {
        trendScore =
          Math.min((recentAvg / olderAvg - 1) * 2, 1) *
          OPPORTUNITY_SCORE_MAX *
          OPPORTUNITY_WEIGHTS.TREND_BONUS;
      }
    }
  }

  const total = searchScore + competitionScore + longTailScore + trendScore;
  return Math.round(
    Math.max(OPPORTUNITY_SCORE_MIN, Math.min(OPPORTUNITY_SCORE_MAX, total))
  );
}

export function calculateAllMetrics(params: {
  monthlySearchTotal: number;
  monthlyPublicationTotal: number;
  keyword: string;
  trendPoints: TrendPoint[];
}): KeywordMetrics {
  return {
    saturationIndex: calculateSaturationIndex(
      params.monthlyPublicationTotal,
      params.monthlySearchTotal
    ),
    predictedMonthlySearch: calculatePredictedMonthlySearch(
      params.monthlySearchTotal,
      params.trendPoints
    ),
    opportunityScore: calculateOpportunityScore(params),
  };
}
