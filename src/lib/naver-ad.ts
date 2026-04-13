import crypto from 'crypto';
import { NAVER_AD_API_BASE, ERROR_MESSAGES } from '@/constants';
import type { NaverAdKeywordResult } from '@/types/naver-api';
import type { SearchVolumeResult, RelatedKeyword } from '@/types/keyword';

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(ERROR_MESSAGES.ENV_MISSING(key));
  }
  return value;
}

function generateSignature(
  timestamp: string,
  method: string,
  path: string,
  secretKey: string
): string {
  const message = `${timestamp}.${method}.${path}`;
  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(message);
  return hmac.digest('base64');
}

function buildHeaders(method: string, path: string) {
  const customerId = getEnvOrThrow('NAVER_AD_CUSTOMER_ID');
  const accessLicense = getEnvOrThrow('NAVER_AD_ACCESS_LICENSE');
  const secretKey = getEnvOrThrow('NAVER_AD_SECRET_KEY');

  const timestamp = String(Date.now());
  const signature = generateSignature(timestamp, method, path, secretKey);

  return {
    'Content-Type': 'application/json; charset=UTF-8',
    'X-Timestamp': timestamp,
    'X-API-KEY': accessLicense,
    'X-Customer': customerId,
    'X-Signature': signature,
  };
}

function sanitizeKeywordForAd(keyword: string): string {
  return keyword.replace(/\s+/g, '').trim();
}

export async function fetchKeywordStats(
  hintKeywords: string[]
): Promise<NaverAdKeywordResult[]> {
  const path = '/keywordstool';
  const method = 'GET';
  const headers = buildHeaders(method, path);

  const sanitized = hintKeywords.map(sanitizeKeywordForAd).filter(Boolean);
  const encodedKeywords = sanitized.map(encodeURIComponent).join(',');
  const url = `${NAVER_AD_API_BASE}${path}?hintKeywords=${encodedKeywords}&showDetail=1`;

  const response = await fetch(url, { method, headers });

  if (!response.ok) {
    const body = await response.text();
    console.error(
      `[NaverAd] API error: status=${response.status}, body=${body}`
    );

    if (response.status === 429) {
      throw new Error(ERROR_MESSAGES.API_LIMIT_EXCEEDED);
    }
    throw new Error(
      `${ERROR_MESSAGES.NAVER_AD_API_ERROR} (status: ${response.status})`
    );
  }

  const data = await response.json();
  return data.keywordList as NaverAdKeywordResult[];
}

function normalizeCount(value: number | string): number {
  if (typeof value === 'string' && value === '< 10') return 5;
  const num = Number(value);
  return isNaN(num) ? 0 : num;
}

function normalizeForComparison(str: string): string {
  return str.replace(/\s+/g, '').toLowerCase();
}

export function normalizeKeywordResults(
  keywordList: NaverAdKeywordResult[],
  targetKeyword: string
): SearchVolumeResult {
  const normalizedTarget = normalizeForComparison(targetKeyword);

  const main = keywordList.find(
    (k) => normalizeForComparison(k.relKeyword) === normalizedTarget
  );

  const monthlyPc = main ? normalizeCount(main.monthlyPcQcCnt) : 0;
  const monthlyMobile = main ? normalizeCount(main.monthlyMobileQcCnt) : 0;

  const relatedKeywords: RelatedKeyword[] = keywordList
    .filter((k) => normalizeForComparison(k.relKeyword) !== normalizedTarget)
    .map((k) => ({
      keyword: k.relKeyword,
      monthlyPcQcCnt: normalizeCount(k.monthlyPcQcCnt),
      monthlyMobileQcCnt: normalizeCount(k.monthlyMobileQcCnt),
      monthlyTotalQcCnt:
        normalizeCount(k.monthlyPcQcCnt) +
        normalizeCount(k.monthlyMobileQcCnt),
      competitionIndex: k.compIdx ?? 'unknown',
    }));

  return {
    keyword: targetKeyword,
    monthlyPcQcCnt: monthlyPc,
    monthlyMobileQcCnt: monthlyMobile,
    monthlyTotalQcCnt: monthlyPc + monthlyMobile,
    competitionIndex: main?.compIdx ?? 'unknown',
    relatedKeywords,
  };
}

export async function getSearchVolume(
  keyword: string
): Promise<SearchVolumeResult> {
  const keywordList = await fetchKeywordStats([keyword]);
  return normalizeKeywordResults(keywordList, keyword);
}
