#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "오류: .env 파일이 없습니다. 프로젝트 루트에 .env를 만들어 주세요."
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "의존성 설치 중..."
  npm install
fi

echo "개발 서버 시작: http://localhost:3000"
exec npm run dev
