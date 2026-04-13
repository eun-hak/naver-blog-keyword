import { NAVER_SEARCH_API_BASE, SEARCH_TYPES, ERROR_MESSAGES } from '@/constants';
import type { NaverSearchResponse, NaverSearchType } from '@/types/naver-api';
import type { ContentAnalysis } from '@/types/keyword';

function getSearchHeaders() {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      ERROR_MESSAGES.ENV_MISSING('NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET')
    );
  }

  return {
    'X-Naver-Client-Id': clientId,
    'X-Naver-Client-Secret': clientSecret,
  };
}

export async function searchNaver(
  query: string,
  type: NaverSearchType,
  display: number = 1,
  sort: 'sim' | 'date' = 'sim'
): Promise<NaverSearchResponse> {
  const headers = getSearchHeaders();
  const params = new URLSearchParams({
    query,
    display: String(display),
    sort,
  });

  const url = `${NAVER_SEARCH_API_BASE}/${type}?${params.toString()}`;
  const response = await fetch(url, { headers });

  if (!response.ok) {
    const body = await response.text();
    console.error(
      `[NaverSearch] API error: type=${type}, status=${response.status}, body=${body}`
    );

    if (response.status === 429) {
      throw new Error(ERROR_MESSAGES.API_LIMIT_EXCEEDED);
    }
    throw new Error(
      `${ERROR_MESSAGES.NAVER_SEARCH_API_ERROR} (type: ${type}, status: ${response.status})`
    );
  }

  return response.json();
}

function parsePostDate(postdate: string): Date | null {
  if (!postdate || postdate.length !== 8) return null;
  const year = parseInt(postdate.substring(0, 4));
  const month = parseInt(postdate.substring(4, 6)) - 1;
  const day = parseInt(postdate.substring(6, 8));
  const date = new Date(year, month, day);
  if (isNaN(date.getTime())) return null;
  return date;
}

async function getMonthlyBlogCount(keyword: string): Promise<{
  monthlyCount: number;
  totalCount: number;
}> {
  const result = await searchNaver(keyword, SEARCH_TYPES.BLOG, 100, 'date');
  const totalCount = result.total;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  let monthlyCount = 0;
  for (const item of result.items) {
    if (item.postdate) {
      const postDate = parsePostDate(item.postdate);
      if (postDate && postDate >= thirtyDaysAgo) {
        monthlyCount++;
      }
    }
  }

  return { monthlyCount, totalCount };
}

async function getTotalDocumentCount(
  keyword: string,
  type: NaverSearchType
): Promise<number> {
  const result = await searchNaver(keyword, type, 1);
  return result.total;
}

// TODO: 카페 API는 postdate를 제공하지 않아 정확한 월간 발행량 산출 불가.
// 블로그의 월간/총 비율을 기반으로 추정.
// 추후 네이버 카페 크롤링이나 별도 데이터 소스로 정밀도 개선 가능.
function estimateMonthlyCafeCount(
  cafeTotalCount: number,
  blogMonthlyCount: number,
  blogTotalCount: number
): number {
  if (blogTotalCount === 0) return 0;
  const monthlyRatio = blogMonthlyCount / blogTotalCount;
  return Math.round(cafeTotalCount * monthlyRatio);
}

export async function getContentAnalysis(
  keyword: string
): Promise<ContentAnalysis> {
  const [blogResult, cafeTotal, newsTotal, webTotal] = await Promise.all([
    getMonthlyBlogCount(keyword),
    getTotalDocumentCount(keyword, SEARCH_TYPES.CAFE),
    getTotalDocumentCount(keyword, SEARCH_TYPES.NEWS),
    getTotalDocumentCount(keyword, SEARCH_TYPES.WEB),
  ]);

  const estimatedMonthlyCafe = estimateMonthlyCafeCount(
    cafeTotal,
    blogResult.monthlyCount,
    blogResult.totalCount
  );

  return {
    monthlyPublication: {
      blog: blogResult.monthlyCount,
      cafe: estimatedMonthlyCafe,
      total: blogResult.monthlyCount + estimatedMonthlyCafe,
    },
    totalDocuments: {
      blog: blogResult.totalCount,
      cafe: cafeTotal,
      news: newsTotal,
      web: webTotal,
      total: blogResult.totalCount + cafeTotal + newsTotal + webTotal,
    },
  };
}
