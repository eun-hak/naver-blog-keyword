export interface SearchVolumeResult {
  keyword: string;
  monthlyPcQcCnt: number;
  monthlyMobileQcCnt: number;
  monthlyTotalQcCnt: number;
  competitionIndex: string;
  relatedKeywords: RelatedKeyword[];
}

export interface RelatedKeyword {
  keyword: string;
  monthlyPcQcCnt: number;
  monthlyMobileQcCnt: number;
  monthlyTotalQcCnt: number;
  competitionIndex: string;
  totalBlogCount?: number;
}

export interface MonthlyPublication {
  blog: number;
  cafe: number;
  cafeIsEstimated?: boolean;
  total: number;
}

export interface TotalDocuments {
  blog: number;
  cafe: number;
  news: number;
  web: number;
  total: number;
}

export interface ContentAnalysis {
  monthlyPublication: MonthlyPublication;
  totalDocuments: TotalDocuments;
}

export interface TrendPoint {
  period: string;
  ratio: number;
}

export interface KeywordTrendResult {
  keyword: string;
  points: TrendPoint[];
}

export interface KeywordMetrics {
  saturationIndex: number;
  predictedMonthlySearch: number | null;
  opportunityScore: number;
}

export interface KeywordAnalysisResult {
  keyword: string;
  searchVolume: {
    monthlyPc: number;
    monthlyMobile: number;
    monthlyTotal: number;
  };
  content: ContentAnalysis;
  trend: TrendPoint[];
  metrics: KeywordMetrics;
  relatedKeywords: Array<
    RelatedKeyword & {
      opportunityScore?: number;
    }
  >;
  analyzedAt: string;
}

export interface AnalysisApiResponse {
  success: true;
  data: KeywordAnalysisResult;
}

export interface AnalysisApiError {
  success: false;
  error: string;
  code?: string;
}

export type AnalysisResponse = AnalysisApiResponse | AnalysisApiError;
