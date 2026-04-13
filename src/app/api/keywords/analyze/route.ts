import { NextRequest, NextResponse } from 'next/server';
import { analyzeKeyword } from '@/services/keyword-analysis';
import { ERROR_MESSAGES } from '@/constants';
import type { AnalysisResponse } from '@/types/keyword';

export async function GET(
  request: NextRequest
): Promise<NextResponse<AnalysisResponse>> {
  const keyword = request.nextUrl.searchParams.get('keyword')?.trim();

  if (!keyword) {
    return NextResponse.json(
      { success: false, error: ERROR_MESSAGES.KEYWORD_REQUIRED },
      { status: 400 }
    );
  }

  try {
    const result = await analyzeKeyword(keyword);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : ERROR_MESSAGES.INTERNAL_ERROR;
    const isRateLimit = message.includes('한도');

    console.error(`[API /keywords/analyze] keyword="${keyword}" error:`, message);

    return NextResponse.json(
      {
        success: false,
        error: message,
        code: isRateLimit ? 'RATE_LIMIT' : 'INTERNAL_ERROR',
      },
      { status: isRateLimit ? 429 : 500 }
    );
  }
}
