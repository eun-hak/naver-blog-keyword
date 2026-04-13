'use client';

import { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import type { TrendPoint } from '@/types/keyword';

interface TrendChartProps {
  data: TrendPoint[];
  keyword: string;
}

function formatPeriod(period: string): string {
  const parts = period.split('-');
  if (parts.length >= 2) {
    return `${parts[1]}/${parts[2] ?? ''}`.replace(/\/$/, '');
  }
  return period;
}

export default function TrendChart({ data, keyword }: TrendChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">
          검색 추이
        </h3>
        <p className="text-sm text-gray-400 text-center py-8">
          추이 데이터가 없습니다.
        </p>
      </div>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    label: formatPeriod(d.period),
  }));

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">
        &quot;{keyword}&quot; 검색 추이 (최근 12개월)
      </h3>
      <div className="h-64 min-w-0">
        {mounted ? (
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={{ stroke: '#e5e7eb' }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
                domain={[0, 100]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '13px',
                }}
                formatter={(value) => [`${Number(value).toFixed(1)}`, '검색 비율']}
                labelFormatter={(label) => `기간: ${label}`}
              />
              <Area
                type="monotone"
                dataKey="ratio"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#trendGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="w-full h-full bg-gray-50 rounded animate-pulse" />
        )}
      </div>
    </div>
  );
}
