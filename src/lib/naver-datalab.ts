import {
  NAVER_DATALAB_API_BASE,
  DATALAB_DEFAULT_PERIOD_MONTHS,
  ERROR_MESSAGES,
} from '@/constants';
import type { NaverDatalabResponse } from '@/types/naver-api';
import type { KeywordTrendResult } from '@/types/keyword';

function getDatalabHeaders() {
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
    'Content-Type': 'application/json',
  };
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getDefaultDateRange(): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - DATALAB_DEFAULT_PERIOD_MONTHS);
  return {
    startDate: formatDate(start),
    endDate: formatDate(end),
  };
}

export async function fetchKeywordTrend(
  keyword: string,
  options?: {
    startDate?: string;
    endDate?: string;
    timeUnit?: 'date' | 'week' | 'month';
    device?: 'pc' | 'mo' | '';
  }
): Promise<NaverDatalabResponse> {
  const headers = getDatalabHeaders();
  const { startDate, endDate } = options?.startDate && options?.endDate
    ? { startDate: options.startDate, endDate: options.endDate }
    : getDefaultDateRange();

  const body = {
    startDate,
    endDate,
    timeUnit: options?.timeUnit ?? 'week',
    keywordGroups: [
      {
        groupName: keyword,
        keywords: [keyword],
      },
    ],
    ...(options?.device ? { device: options.device } : {}),
  };

  const response = await fetch(NAVER_DATALAB_API_BASE, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const responseBody = await response.text();
    console.error(
      `[NaverDatalab] API error: status=${response.status}, body=${responseBody}`
    );

    if (response.status === 429) {
      throw new Error(ERROR_MESSAGES.API_LIMIT_EXCEEDED);
    }
    throw new Error(
      `${ERROR_MESSAGES.NAVER_DATALAB_API_ERROR} (status: ${response.status})`
    );
  }

  return response.json();
}

export function normalizeTrendResult(
  response: NaverDatalabResponse,
  keyword: string
): KeywordTrendResult {
  const result = response.results?.[0];
  if (!result) {
    return { keyword, points: [] };
  }

  return {
    keyword,
    points: result.data.map((d) => ({
      period: d.period,
      ratio: d.ratio,
    })),
  };
}

export async function getKeywordTrend(
  keyword: string,
  options?: {
    startDate?: string;
    endDate?: string;
    timeUnit?: 'date' | 'week' | 'month';
    device?: 'pc' | 'mo' | '';
  }
): Promise<KeywordTrendResult> {
  const response = await fetchKeywordTrend(keyword, options);
  return normalizeTrendResult(response, keyword);
}
