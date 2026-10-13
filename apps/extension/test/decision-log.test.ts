import { describe, expect, it } from 'vitest';
import { DecisionLog } from '../src/background/decisionLog';

describe('service-worker decision log', () => {
  it('preserves only the newest entries', () => {
    const log = new DecisionLog(2);
    log.record('a', 'https://a.test', 'ok', 1);
    log.record('b', 'https://b.test', 'reject', 2);
    log.record('c', 'https://c.test', 'ok', 3);
    expect(log.list().map((item) => item.method)).toEqual(['c','b']);
  });
  it('returns independent snapshots', () => {
    const log = new DecisionLog();
    log.record('a', 'https://a.test', 'ok', 1);
    log.list()[0]!.method = 'mutated';
    expect(log.list()[0]!.method).toBe('a');
  });
});
