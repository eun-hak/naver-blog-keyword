export interface NaverAdKeywordResult {
  relKeyword: string;
  monthlyPcQcCnt: number;
  monthlyMobileQcCnt: number;
  monthlyAvePcClkCnt: number;
  monthlyAveMobileClkCnt: number;
  monthlyAvePcCtr: number;
  monthlyAveMobileCtr: number;
  plAvgDepth: number;
  compIdx: string;
}

export interface NaverAdKeywordResponse {
  keywordList: NaverAdKeywordResult[];
}

export interface NaverSearchResponse {
  lastBuildDate: string;
  total: number;
  start: number;
  display: number;
  items: NaverSearchItem[];
}

export interface NaverSearchItem {
  title: string;
  link: string;
  description: string;
  bloggername?: string;
  bloggerlink?: string;
  postdate?: string;
  cafename?: string;
  cafeurl?: string;
}

export type NaverSearchType = 'blog' | 'cafearticle' | 'news' | 'webkr';

export interface NaverDatalabRequest {
  startDate: string;
  endDate: string;
  timeUnit: 'date' | 'week' | 'month';
  keywordGroups: Array<{
    groupName: string;
    keywords: string[];
  }>;
  device?: 'pc' | 'mo' | '';
  ages?: string[];
  gender?: string;
}

export interface NaverDatalabResponse {
  startDate: string;
  endDate: string;
  timeUnit: string;
  results: Array<{
    title: string;
    keywords: string[];
    data: Array<{
      period: string;
      ratio: number;
    }>;
  }>;
}
