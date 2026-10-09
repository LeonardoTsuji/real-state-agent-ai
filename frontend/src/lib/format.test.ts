import { describe, expect, it } from 'vitest';
import { parseMoney, money, localInput, toUTC, time, date } from './format';

describe('BRL represented in integer cents', () => {
  it.each([
    ['R$ 1.380.000,00', 138000000],
    ['0,01', 1],
    ['10,10', 1010],
    ['0,29', 29],
    ['21474836,47', 2147483647],
  ])('converts %s precisely', (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
    expect(Number.isInteger(parseMoney(input))).toBe(true);
  });
  it.each([
    '-1,00',
    '1,001',
    '1e3',
    'R$ abc',
    '21474836,48',
    '900719925474099100',
  ])('rejects invalid or overflowing values %s', (input) => {
    expect(() => parseMoney(input)).toThrow();
  });
  it('distinguishes missing values from zero and preserves the displayed currency', () => {
    expect(money(null)).toBe('Não informado');
    expect(money(0).replace(/\s/g, ' ')).toBe('R$ 0,00');
    expect(money(138000000).replace(/\s/g, ' ')).toBe('R$ 1.380.000,00');
  });
});

describe('Brasília visits and UTC transport', () => {
  it('roundtrips a visit input without depending on the host timezone', () => {
    const utc = toUTC('2026-10-08T11:00');
    expect(utc).toBe('2026-10-08T14:00:00.000Z');
    expect(localInput(utc)).toBe('2026-10-08T11:00');
    expect(time(utc)).toBe('11:00');
  });
  it('handles the previous local date at the UTC midnight boundary', () => {
    expect(localInput('2026-10-09T01:05:00.000Z')).toBe('2026-10-08T22:05');
    expect(date('2026-10-09T01:05:00.000Z')).toBe('08/10/2026');
  });
  it.each([
    '2026-02-31T11:00',
    '2026-13-01T11:00',
    '2026-10-08T25:00',
    '08/10/2026 11:00',
  ])('rejects impossible or ambiguous timestamps %s', (input) => {
    expect(() => toUTC(input)).toThrow();
  });
});
