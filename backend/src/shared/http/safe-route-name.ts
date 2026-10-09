import type { Request } from 'express';

export function safeRouteName(request: Request): string {
  const route: unknown = request.route;
  if (typeof route !== 'object' || route === null) return 'unmatched_route';
  const path: unknown = (route as { path?: unknown }).path;
  return typeof path === 'string' ? path : 'unmatched_route';
}
