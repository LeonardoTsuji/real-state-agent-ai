import { consumeRateLimit, resetRateLimitsForTests } from './rate-limit.js';

describe('consumeRateLimit', () => {
  beforeEach(() => resetRateLimitsForTests());

  it('enforces independent per-identity quotas within a window', () => {
    expect(consumeRateLimit('broker:a:/api/ai', 2, 60_000).allowed).toBe(true);
    expect(consumeRateLimit('broker:a:/api/ai', 2, 60_000).allowed).toBe(true);
    expect(consumeRateLimit('broker:a:/api/ai', 2, 60_000).allowed).toBe(false);
    expect(consumeRateLimit('broker:b:/api/ai', 2, 60_000).allowed).toBe(true);
  });
});
