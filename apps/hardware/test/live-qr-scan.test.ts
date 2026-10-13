import { describe, expect, it } from 'vitest';
import { shouldAcceptFrame } from '../src/lib/liveQrScan';

describe('live QR frame acceptance', () => {
  it('ignores empty frames', () => {
    expect(shouldAcceptFrame('', '', 2000, 0)).toBe(false);
  });
  it('avoids duplicate static frames within one second', () => {
    expect(shouldAcceptFrame('NP-REQ:one', 'NP-REQ:one', 1200, 1100)).toBe(false);
    expect(shouldAcceptFrame('NP-REQ:one', 'NP-REQ:one', 2200, 1100)).toBe(true);
  });
  it('immediately accepts successive different fountain fragments', () => {
    expect(shouldAcceptFrame('NP-REQ:two', 'NP-REQ:one', 1200, 1190)).toBe(true);
  });
});
