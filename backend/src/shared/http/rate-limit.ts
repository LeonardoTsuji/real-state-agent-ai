import { HttpException, HttpStatus } from '@nestjs/common';

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
let nextCleanupAt = 0;

export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;

  if (now >= nextCleanupAt || buckets.size > 20_000) {
    for (const [entry, value] of buckets) {
      if (value.resetAt <= now) buckets.delete(entry);
    }
    nextCleanupAt = now + windowMs;
  }

  return {
    allowed: bucket.count <= limit,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

export function enforceRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): void {
  const result = consumeRateLimit(key, limit, windowMs);
  if (!result.allowed)
    throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
}

export function resetRateLimitsForTests(): void {
  buckets.clear();
  nextCleanupAt = 0;
}
