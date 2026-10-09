import { intervalsOverlap, isValidVisitInterval } from './visit-interval.js';

describe('visit interval domain rules', () => {
  const at = (value: string) => new Date(`2030-01-01T${value}:00.000Z`);

  it('uses positive half-open intervals so adjacent visits do not overlap', () => {
    const first = { startAt: at('10:00'), endAt: at('11:00') };
    const adjacent = { startAt: at('11:00'), endAt: at('12:00') };
    const overlap = { startAt: at('10:59'), endAt: at('11:30') };
    expect(isValidVisitInterval(first)).toBe(true);
    expect(
      isValidVisitInterval({ startAt: at('10:00'), endAt: at('10:00') }),
    ).toBe(false);
    expect(intervalsOverlap(first, adjacent)).toBe(false);
    expect(intervalsOverlap(first, overlap)).toBe(true);
  });
});
