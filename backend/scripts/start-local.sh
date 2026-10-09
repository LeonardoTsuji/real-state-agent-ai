#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f .env ]]; then
  echo 'Arquivo .env ausente. Copie .env.example para .env e gere JWT_SECRET.' >&2
  exit 1
fi

docker compose up -d --wait
pnpm prisma:generate
pnpm prisma:deploy
pnpm start:dev
