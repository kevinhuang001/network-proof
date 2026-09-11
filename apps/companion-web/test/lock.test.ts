import { describe, expect, it } from 'vitest';
import { createPasscodeRecord, verifyPasscode } from '../src/lib/lock';

/**
 * The companion's lock.
 *
 * What is asserted here is deliberately narrow, because the lock itself is narrow: it
 * verifies a passcode and nothing more. The tests that matter are that a wrong passcode is
 * refused, that two records never share a salt, and that a corrupted record fails closed
 * rather than throwing into a render — a lock that crashes open is worse than no lock.
 */
describe('companion passcode', () => {
  it('accepts the passcode it was created with, and refuses others', () => {
    const record = createPasscodeRecord('correct horse battery');
    expect(verifyPasscode('correct horse battery', record)).toBe(true);
    expect(verifyPasscode('correct horse batter', record)).toBe(false);
    expect(verifyPasscode('Correct horse battery', record)).toBe(false);
    expect(verifyPasscode('', record)).toBe(false);
  });

  it('never stores the passcode itself', () => {
    const passcode = 'a-very-recognisable-passcode';
    const serialised = JSON.stringify(createPasscodeRecord(passcode));
    expect(serialised).not.toContain(passcode);
    // And the record is an Argon2id output, not a hash that could be replayed as the input.
    expect(serialised).toContain('argon2id');
  });

  it('salts every record, so the same passcode yields a different verifier', () => {
    const a = createPasscodeRecord('same passcode here');
    const b = createPasscodeRecord('same passcode here');
    expect(a.salt).not.toBe(b.salt);
    expect(a.verifier).not.toBe(b.verifier);
    // Both still verify: the salt is per record, not part of the passcode.
    expect(verifyPasscode('same passcode here', a)).toBe(true);
    expect(verifyPasscode('same passcode here', b)).toBe(true);
  });

  it('fails closed on a corrupted record', () => {
    const record = createPasscodeRecord('something memorable');
    expect(verifyPasscode('something memorable', { ...record, verifier: 'not-hex' })).toBe(false);
    expect(verifyPasscode('something memorable', { ...record, salt: '' })).toBe(false);
    expect(verifyPasscode('something memorable', { ...record, verifier: '' })).toBe(false);
  });
});
