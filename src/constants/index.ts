export const NAVER_AD_API_BASE = 'https://api.naver.com';
export const NAVER_SEARCH_API_BASE = 'https://openapi.naver.com/v1/search';
export const NAVER_DATALAB_API_BASE = 'https://openapi.naver.com/v1/datalab/search';

export const SEARCH_TYPES = {
  BLOG: 'blog',
  CAFE: 'cafearticle',
  NEWS: 'news',
  WEB: 'webkr',
} as const;

export const CACHE_TTL_MS = 30 * 60 * 1000; // 30분
export const MAX_CACHE_SIZE = 500;

export const METRICS_CONFIG = {
  OPPORTUNITY_WEIGHTS: {
    SEARCH_VOLUME: 0.4,
    LOW_COMPETITION: 0.35,
    LONG_TAIL_BONUS: 0.15,
    TREND_BONUS: 0.1,
  },
  SATURATION_DECIMAL_PLACES: 2,
  OPPORTUNITY_SCORE_MAX: 100,
  OPPORTUNITY_SCORE_MIN: 0,
  HIGH_COMPETITION_PENALTY_THRESHOLD: 10,
  LONG_TAIL_WORD_COUNT_THRESHOLD: 3,
} as const;

export const DATALAB_DEFAULT_PERIOD_MONTHS = 12;

export const ERROR_MESSAGES = {
  KEYWORD_REQUIRED: '키워드를 입력해주세요.',
  API_LIMIT_EXCEEDED: 'API 호출 한도를 초과했습니다. 잠시 후 다시 시도해주세요.',
  NAVER_AD_API_ERROR: '네이버 검색광고 API 호출 중 오류가 발생했습니다.',
  NAVER_SEARCH_API_ERROR: '네이버 검색 API 호출 중 오류가 발생했습니다.',
  NAVER_DATALAB_API_ERROR: '네이버 데이터랩 API 호출 중 오류가 발생했습니다.',
  INTERNAL_ERROR: '서버 내부 오류가 발생했습니다.',
  ENV_MISSING: (key: string) => `환경변수 ${key}가 설정되지 않았습니다.`,
} as const;
