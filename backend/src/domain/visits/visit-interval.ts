export type TimeInterval = { startAt: Date; endAt: Date };

export function isValidVisitInterval(interval: TimeInterval): boolean {
  return interval.startAt.getTime() < interval.endAt.getTime();
}

export function intervalsOverlap(a: TimeInterval, b: TimeInterval): boolean {
  return a.startAt < b.endAt && b.startAt < a.endAt;
}
