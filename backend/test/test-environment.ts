if (process.env.NODE_ENV !== 'test') {
  throw new Error('End-to-end tests require NODE_ENV=test');
}
const testDatabaseUrl = process.env.DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error('DATABASE_URL must point to the dedicated e2e database');
}
const testDatabase = new URL(testDatabaseUrl);
const isLoopback =
  testDatabase.hostname === 'localhost' ||
  testDatabase.hostname === '127.0.0.1' ||
  testDatabase.hostname === '[::1]';
const testDatabaseName = testDatabase.pathname.slice(1);
if (!isLoopback || testDatabaseName !== 'corretor_copilot_test') {
  throw new Error(
    'End-to-end tests may only use the local corretor_copilot_test database',
  );
}
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-validation';
// Keep the worker queue separate from development/demo processes. Each run
// gets a namespace so delayed work retained by Redis cannot steal test jobs.
process.env.WORKFLOW_QUEUE_NAME = `copilot-e2e-${process.pid}`;
process.env.PROCESS_ROLE = 'all';
process.env.AI_PROVIDER = 'mock';
