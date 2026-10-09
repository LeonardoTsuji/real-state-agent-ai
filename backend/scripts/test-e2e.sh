#!/usr/bin/env bash
set -euo pipefail

if [[ "${NODE_ENV:-}" == 'production' ]]; then
  echo 'Refusing to run destructive e2e setup with NODE_ENV=production.' >&2
  exit 1
fi

test_database_url="${DATABASE_URL_TEST:-postgresql://copilot:local_only_change_me@localhost:5432/corretor_copilot_test?schema=public}"
database_identity="$(node -e 'const u = new URL(process.argv[1]); console.log(`${u.hostname}:${u.pathname.slice(1)}`)' "$test_database_url")"

if [[ "$database_identity" != 'localhost:corretor_copilot_test' && \
      "$database_identity" != '127.0.0.1:corretor_copilot_test' && \
      "$database_identity" != '[::1]:corretor_copilot_test' ]]; then
  echo 'E2E database must be corretor_copilot_test on loopback; refusing to migrate or reset another database.' >&2
  exit 1
fi

export NODE_ENV=test
export DATABASE_URL="$test_database_url"
docker compose -p real-state-agent up -d --wait
node --input-type=module <<'JAVASCRIPT'
import pg from 'pg';
const adminUrl = new URL(process.env.DATABASE_URL);
adminUrl.pathname = '/postgres';
adminUrl.search = '';
const admin = new pg.Client({ connectionString: adminUrl.toString() });
await admin.connect();
try {
  const existing = await admin.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    ['corretor_copilot_test'],
  );
  if (!existing.rowCount) {
    await admin.query('CREATE DATABASE corretor_copilot_test');
  }
} finally {
  await admin.end();
}
JAVASCRIPT
node_modules/.bin/prisma generate
node_modules/.bin/prisma migrate deploy
NODE_OPTIONS=--experimental-vm-modules node_modules/.bin/jest --config ./test/jest-e2e.json "$@"
