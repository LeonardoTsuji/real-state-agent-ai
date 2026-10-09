import pg from 'pg';
import { spawn } from 'node:child_process';
import { demoDatabaseURL } from './demo-database.mjs';
const databaseURL = demoDatabaseURL();
const env = {
  ...process.env,
  DATABASE_URL: databaseURL,
  NODE_ENV: 'development',
  DEMO_MODE: 'true',
  AI_PROVIDER: 'mock',
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
  JWT_SECRET:
    process.env.JWT_SECRET ??
    'copilot-demo-local-only-secret-at-least-32-chars',
  PROCESS_ROLE: 'all',
  WORKFLOW_QUEUE_NAME: 'copilot-demo-workflows',
  API_PROXY_TARGET: `http://127.0.0.1:${process.env.PORT ?? 3000}`,
};
const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} terminou com código ${code}`)),
    );
  });
await run('docker', ['compose', 'up', '-d', '--wait']);
const adminURL = new URL(databaseURL);
adminURL.pathname = '/postgres';
adminURL.search = '';
const admin = new pg.Pool({ connectionString: adminURL.toString() });
try {
  const exists = await admin.query(
    "SELECT 1 FROM pg_database WHERE datname = 'corretor_copilot_demo'",
  );
  if (!exists.rowCount)
    await admin.query('CREATE DATABASE corretor_copilot_demo');
} finally {
  await admin.end();
}
await run('node_modules/.bin/prisma', ['generate']);
await run('node_modules/.bin/prisma', ['migrate', 'deploy']);
await run('node_modules/.bin/nest', ['build']);
await run('node', ['scripts/seed-demo.mjs']);
const api = spawn('node', ['dist/main.js'], { stdio: 'inherit', env });
const frontend = spawn('node_modules/.bin/vite', ['--host', '127.0.0.1'], {
  cwd: new URL('../../frontend/', import.meta.url),
  stdio: 'inherit',
  env,
});
const close = () => {
  api.kill('SIGTERM');
  frontend.kill('SIGTERM');
};
process.on('SIGINT', close);
process.on('SIGTERM', close);
api.on('exit', (code) => {
  frontend.kill('SIGTERM');
  if (code) process.exitCode = code;
});
frontend.on('exit', (code) => {
  api.kill('SIGTERM');
  if (code) process.exitCode = code;
});
