import { describe, expect, it } from 'vitest';
import { currentPeriodKey } from '../src/services/usage';

describe('usage period key', () => {
  it('uses a stable UTC YYYY-MM key', () => {
    expect(currentPeriodKey(new Date('2026-10-13T12:00:00.000Z'))).toBe('2026-10');
  });
  it('handles month rollover in UTC', () => {
    expect(currentPeriodKey(new Date('2026-11-01T00:00:00.000Z'))).toBe('2026-11');
  });
});
