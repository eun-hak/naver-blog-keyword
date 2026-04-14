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
  sort: 'sim' | 'date' = 'sim',
  start: number = 1
): Promise<NaverSearchResponse> {
  const headers = getSearchHeaders();
  const params = new URLSearchParams({
    query,
    display: String(display),
    sort,
    start: String(start),
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
  const DISPLAY = 100;
  const MAX_START = 1000;
  const PERIOD_DAYS = 30;

  const now = new Date();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - PERIOD_DAYS);
  cutoffDate.setHours(0, 0, 0, 0);

  // 1단계: 1000번째 게시글이 30일 이내인지 확인 → 외삽 필요 여부 판단
  const [firstPage, probe] = await Promise.all([
    searchNaver(keyword, SEARCH_TYPES.BLOG, DISPLAY, 'date', 1),
    searchNaver(keyword, SEARCH_TYPES.BLOG, 1, 'date', MAX_START),
  ]);

  const totalCount = firstPage.total;

  if (firstPage.items.length === 0) {
    return { monthlyCount: 0, totalCount };
  }

  const probeDate = probe.items[0]?.postdate
    ? parsePostDate(probe.items[0].postdate)
    : null;

  // 1000번째 글도 30일 이내 → 월간 발행량 > 1000이므로 날짜 기반 외삽
  if (probeDate && probeDate >= cutoffDate) {
    const newestDate = firstPage.items[0]?.postdate
      ? parsePostDate(firstPage.items[0].postdate)
      : now;
    const newest = newestDate ?? now;

    const daysCovered = Math.max(
      (newest.getTime() - probeDate.getTime()) / (1000 * 60 * 60 * 24),
      1
    );
    const dailyRate = MAX_START / daysCovered;
    const monthlyCount = Math.round(dailyRate * PERIOD_DAYS);

    return { monthlyCount, totalCount };
  }

  // 2단계: 1000개 이하 → 정확 집계 (이미 firstPage 가져옴)
  let monthlyCount = 0;
  let reachedOldPost = false;

  for (const item of firstPage.items) {
    if (!item.postdate) { reachedOldPost = true; break; }
    const d = parsePostDate(item.postdate);
    if (d && d >= cutoffDate) { monthlyCount++; }
    else { reachedOldPost = true; break; }
  }

  if (!reachedOldPost && firstPage.items.length === DISPLAY) {
    let start = 1 + DISPLAY;
    while (start <= MAX_START) {
      const page = await searchNaver(keyword, SEARCH_TYPES.BLOG, DISPLAY, 'date', start);
      if (page.items.length === 0) break;

      for (const item of page.items) {
        if (!item.postdate) { reachedOldPost = true; break; }
        const d = parsePostDate(item.postdate);
        if (d && d >= cutoffDate) { monthlyCount++; }
        else { reachedOldPost = true; break; }
      }

      if (reachedOldPost || page.items.length < DISPLAY) break;
      start += DISPLAY;
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

export async function fetchBlogTotalCount(keyword: string): Promise<number> {
  try {
    const result = await searchNaver(keyword, SEARCH_TYPES.BLOG, 1);
    return result.total;
  } catch {
    return 0;
  }
}

/**
 * [빠른 모드] 블로그 API 1회만 호출, 100개 내에서 카운트.
 * - isCapped=true → 100개 전부 30일 이내 (실제 발행량 ≥ 100, 정확한 값 모름)
 * - monthly=-1   → API 에러 (결과에서 제외)
 */
export async function fetchFastMonthlyBlogCount(
  keyword: string
): Promise<{ monthly: number; isCapped: boolean }> {
  const PERIOD_DAYS = 30;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - PERIOD_DAYS);
  cutoffDate.setHours(0, 0, 0, 0);

  try {
    const page = await searchNaver(keyword, SEARCH_TYPES.BLOG, 100, 'date', 1);
    if (page.items.length === 0) return { monthly: 0, isCapped: false };

    let count = 0;
    let hitOld = false;
    for (const item of page.items) {
      if (!item.postdate) continue;
      const d = parsePostDate(item.postdate);
      if (d && d >= cutoffDate) count++;
      else if (d) { hitOld = true; break; }
    }

    // 100개 모두 최근 (발행량이 100 이상) → 상한 표시
    const isCapped = !hitOld && page.items.length === 100 && count === 100;
    return { monthly: count, isCapped };
  } catch {
    return { monthly: -1, isCapped: false };
  }
}

/**
 * [정확한 모드] 블로그 API 2회 (첫 페이지 + probe) 호출, 외삽 포함.
 * - monthly: -1 은 API 에러(rate limit 등), 발굴 결과에서 제외해야 함
 * - monthly: 0  은 실제로 30일 내 발행 없음 (블루오션)
 */
export async function fetchQuickMonthlyBlogCount(
  keyword: string
): Promise<{ monthly: number; isOver1000: boolean }> {
  const PERIOD_DAYS = 30;
  const now = new Date();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - PERIOD_DAYS);
  cutoffDate.setHours(0, 0, 0, 0);

  try {
    // 첫 페이지(100개) + start=1000 동시 조회
    const [page, probe1000] = await Promise.all([
      searchNaver(keyword, SEARCH_TYPES.BLOG, 100, 'date', 1),
      searchNaver(keyword, SEARCH_TYPES.BLOG, 1, 'date', 1000),
    ]);

    if (page.items.length === 0) return { monthly: 0, isOver1000: false };

    const total = page.total;

    // probe 결정: total < 1000이면 마지막 글로 대체
    let probe = probe1000;
    let probeStart = 1000;
    if (!probe1000.items.length && total > 1 && total < 1000) {
      probeStart = total;
      probe = await searchNaver(keyword, SEARCH_TYPES.BLOG, 1, 'date', total);
    }

    const probeDate = probe.items[0]?.postdate
      ? parsePostDate(probe.items[0].postdate)
      : null;

    // probeStart번째 글도 30일 이내 → 외삽
    if (probeDate && probeDate >= cutoffDate) {
      const newestDate = page.items[0]?.postdate
        ? parsePostDate(page.items[0].postdate)
        : null;
      const newest = newestDate ?? now;
      const daysCovered = Math.max(
        (newest.getTime() - probeDate.getTime()) / (1000 * 60 * 60 * 24),
        1
      );
      const monthly = Math.round((probeStart / daysCovered) * PERIOD_DAYS);
      return { monthly, isOver1000: probeStart >= 1000 };
    }

    // probeStart번째가 30일 밖 → 100개 내 직접 카운트
    let count = 0;
    for (const item of page.items) {
      if (!item.postdate) continue; // postdate 없는 글은 건너뜀
      const d = parsePostDate(item.postdate);
      if (d && d >= cutoffDate) count++;
      else if (d) break; // 날짜순 정렬이므로 이후도 모두 30일 밖
    }

    return { monthly: count, isOver1000: false };
  } catch {
    // rate limit / 네트워크 에러 → -1로 표시, 발굴 결과에서 제외
    return { monthly: -1, isOver1000: false };
  }
}

function getNaverSessionCookie(): string | null {
  const aut = process.env.NAVER_NID_AUT;
  const ses = process.env.NAVER_NID_SES;
  if (!aut || !ses) return null;
  return `NID_AUT=${aut}; NID_SES=${ses}`;
}

// 카페 내부 API로 글의 writeDate(Unix ms)를 가져옴
// cafeId는 카페 링크 페이지 HTML에서 추출
async function fetchCafeArticleWriteDate(
  articleLink: string
): Promise<Date | null> {
  const session = getNaverSessionCookie();
  if (!session) return null;

  try {
    // 카페명/articleId 파싱: http://cafe.naver.com/{cafeName}/{articleId}
    const match = articleLink.match(/cafe\.naver\.com\/([^/]+)\/(\d+)/);
    if (!match) return null;
    const [, , articleId] = match;

    // 외부 페이지에서 cafeId 추출 (한 번만 필요)
    const outerRes = await fetch(articleLink, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36',
        Cookie: session,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      redirect: 'follow',
    });
    if (!outerRes.ok) return null;

    const outerHtml = await outerRes.text();
    const cafeIdMatch = outerHtml.match(/[Cc]afe[Ii][Dd][="\s:]+(\d{5,})/);
    if (!cafeIdMatch) return null;
    const cafeId = cafeIdMatch[1];

    // 카페 글 내부 API 호출
    const apiUrl = `https://apis.naver.com/cafe-web/cafe-articleapi/v2.1/cafes/${cafeId}/articles/${articleId}`;
    const apiRes = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36',
        Cookie: session,
        Accept: 'application/json, text/plain, */*',
        Referer: articleLink,
      },
    });
    if (!apiRes.ok) return null;

    const data = await apiRes.json();
    const writeDate: number | undefined = data?.result?.article?.writeDate;
    if (!writeDate) return null;

    return new Date(writeDate);
  } catch {
    return null;
  }
}

async function getMonthlyCafeCount(keyword: string): Promise<{
  monthlyCount: number;
  totalCount: number;
  isEstimated: boolean;
}> {
  const PERIOD_DAYS = 30;
  const MAX_START = 1000;

  const now = new Date();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - PERIOD_DAYS);
  cutoffDate.setHours(0, 0, 0, 0);

  const firstPage = await searchNaver(keyword, SEARCH_TYPES.CAFE, 1, 'date', 1);
  const totalCount = firstPage.total;
  if (totalCount === 0) return { monthlyCount: 0, totalCount: 0, isEstimated: false };

  const newestLink = firstPage.items[0]?.link;
  const session = getNaverSessionCookie();

  // 세션 없으면 추정
  if (!session) {
    return { monthlyCount: -1, totalCount, isEstimated: true };
  }

  // total이 1000 이상이면 start=1000, 아니면 start=total(마지막 글)
  const probeStart = totalCount >= MAX_START ? MAX_START : totalCount;
  const probePage = await searchNaver(keyword, SEARCH_TYPES.CAFE, 1, 'date', probeStart);

  const probeLink = probePage.items[0]?.link;
  if (!probeLink) return { monthlyCount: -1, totalCount, isEstimated: true };

  // 최신 글과 탐색 글 날짜를 병렬로 가져옴
  const [newestDate, probeDate] = await Promise.all([
    newestLink ? fetchCafeArticleWriteDate(newestLink) : Promise.resolve(now),
    fetchCafeArticleWriteDate(probeLink),
  ]);

  if (!probeDate) {
    return { monthlyCount: -1, totalCount, isEstimated: true };
  }

  const newest = newestDate ?? now;

  if (totalCount >= MAX_START && probeDate >= cutoffDate) {
    // 1000번째 글도 30일 이내 → 외삽
    const daysCovered = Math.max(
      (newest.getTime() - probeDate.getTime()) / (1000 * 60 * 60 * 24),
      1
    );
    const monthlyCount = Math.round((MAX_START / daysCovered) * PERIOD_DAYS);
    return { monthlyCount, totalCount, isEstimated: false };
  }

  // total < 1000이거나 probeDate가 30일 밖인 경우
  // → 전체 스팬 대비 최근 30일 비율로 발행량 추정
  const totalSpan = Math.max(
    (newest.getTime() - probeDate.getTime()) / (1000 * 60 * 60 * 24),
    1
  );
  const recentSpan = Math.min(
    Math.max((newest.getTime() - cutoffDate.getTime()) / (1000 * 60 * 60 * 24), 0),
    PERIOD_DAYS
  );
  const monthlyCount = Math.round((recentSpan / totalSpan) * probeStart);
  return { monthlyCount: Math.max(0, monthlyCount), totalCount, isEstimated: false };
}

function estimateMonthlyCafeCount(
  cafeTotalCount: number,
  blogMonthlyCount: number,
  blogTotalCount: number
): number {
  if (blogTotalCount === 0) return 0;
  return Math.round(cafeTotalCount * (blogMonthlyCount / blogTotalCount));
}

export async function getContentAnalysis(
  keyword: string
): Promise<ContentAnalysis> {
  const [blogResult, cafeResult, newsTotal, webTotal] = await Promise.all([
    getMonthlyBlogCount(keyword),
    getMonthlyCafeCount(keyword),
    getTotalDocumentCount(keyword, SEARCH_TYPES.NEWS),
    getTotalDocumentCount(keyword, SEARCH_TYPES.WEB),
  ]);

  const monthlyCafe =
    cafeResult.monthlyCount >= 0
      ? cafeResult.monthlyCount
      : estimateMonthlyCafeCount(
          cafeResult.totalCount,
          blogResult.monthlyCount,
          blogResult.totalCount
        );

  const isEstimated = cafeResult.isEstimated;

  return {
    monthlyPublication: {
      blog: blogResult.monthlyCount,
      cafe: monthlyCafe,
      cafeIsEstimated: isEstimated,
      total: blogResult.monthlyCount + monthlyCafe,
    },
    totalDocuments: {
      blog: blogResult.totalCount,
      cafe: cafeResult.totalCount,
      news: newsTotal,
      web: webTotal,
      total: blogResult.totalCount + cafeResult.totalCount + newsTotal + webTotal,
    },
  };
}
