import { BadRequestException } from '@nestjs/common';

export type CursorPosition = { at: Date; id: string; scope?: string };

export function decodeCursor(
  cursor?: string,
  expectedScope?: string,
): CursorPosition | undefined {
  if (!cursor) return undefined;
  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as {
      at?: unknown;
      id?: unknown;
      scope?: unknown;
    };
    if (typeof decoded.at !== 'string' || typeof decoded.id !== 'string')
      throw new Error();
    const at = new Date(decoded.at);
    if (Number.isNaN(at.getTime()) || !/^[0-9a-f-]{36}$/i.test(decoded.id))
      throw new Error();
    if (expectedScope !== undefined && decoded.scope !== expectedScope)
      throw new Error();
    return {
      at,
      id: decoded.id,
      scope: typeof decoded.scope === 'string' ? decoded.scope : undefined,
    };
  } catch {
    throw new BadRequestException('Invalid cursor');
  }
}

export function encodeCursor(at: Date, id: string, scope = ''): string {
  return Buffer.from(
    JSON.stringify({ at: at.toISOString(), id, scope }),
  ).toString('base64url');
}

export function cursorWhere(
  position?: CursorPosition,
  field = 'createdAt',
  direction: 'lt' | 'gt' = 'lt',
) {
  if (!position) return undefined;
  return {
    OR: [
      { [field]: { [direction]: position.at } },
      { [field]: position.at, id: { [direction]: position.id } },
    ],
  };
}

export function cursorPage<T extends { id: string }>(
  items: T[],
  limit: number,
  getDate: (item: T) => Date,
  scope = '',
) {
  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  const last = data.at(-1);
  return {
    items: data,
    nextCursor:
      hasMore && last ? encodeCursor(getDate(last), last.id, scope) : null,
  };
}
