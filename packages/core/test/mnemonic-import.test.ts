import { describe, expect, it } from 'vitest';
import { HDKey, buildWalletExport, derivePath, fingerprintHex, publicKeyToAddress } from '../src/crypto/hd';
import {
  VALID_WORD_COUNTS,
  entropyToMnemonic,
  inspectMnemonic,
  mnemonicToSeed,
  tokenizeMnemonic,
} from '../src/crypto/mnemonic';
import { TestDrbg } from './helpers/synthetic';

/**
 * Tests for the mnemonic import path.
 *
 * Importing an existing wallet is where expensive, silent mistakes happen, so the
 * validator has to do more than answer "valid / invalid": it must say which word is
 * wrong and what the user probably meant.
 */

const VECTOR =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('inspectMnemonic', () => {
  it('accepts a valid 12-word phrase', () => {
    const result = inspectMnemonic(VECTOR);
    expect(result.checksumValid).toBe(true);
    expect(result.issue).toBeNull();
    expect(result.wordCount).toBe(12);
    expect(result.strength).toBe(128);
    expect(result.allWordsKnown).toBe(true);
    expect(result.validWordCount).toBe(true);
  });

  it('accepts every supported word count', () => {
    for (const wordCount of VALID_WORD_COUNTS) {
      const strength = (wordCount * 32) / 3;
      const mnemonic = entropyToMnemonic(new TestDrbg(`import-${wordCount}`).bytes(strength / 8));
      const result = inspectMnemonic(mnemonic);
      expect(result.checksumValid, `${wordCount} words`).toBe(true);
      expect(result.strength).toBe(strength);
      expect(result.wordCount).toBe(wordCount);
      expect(result.issue).toBeNull();
    }
  });

  it('tolerates how humans actually paste mnemonics', () => {
    // Newlines, full-width and ideographic spaces, uppercase, stray padding.
    for (const messy of [
      VECTOR.replace(/ /gu, '\n'),
      VECTOR.replace(/ /gu, '\u3000'),
      VECTOR.toUpperCase(),
      `  ${VECTOR}  `,
      VECTOR.replace(/ /gu, '   '),
    ]) {
      expect(inspectMnemonic(messy).checksumValid, JSON.stringify(messy.slice(0, 24))).toBe(true);
    }
  });

  it('parses every separator format people actually paste', () => {
    // The bug this covers: a single-space split turned comma-separated and
    // numbered-list input into one token, so the UI reported "1 word" (or, when the
    // field was unusable, "0 words") and the user had no idea why.
    const words = VECTOR.split(' ');
    const numbered = words.map((word, index) => `${index + 1}. ${word}`).join(' ');
    const numberedLines = words.map((word, index) => `${index + 1}. ${word}`).join('\n');
    for (const [label, input] of [
      ['plain spaces', VECTOR],
      ['newlines', words.join('\n')],
      ['ascii commas', words.join(', ')],
      ['chinese commas', words.join('、')],
      ['full-width commas', words.join('，')],
      ['semicolons', words.join('; ')],
      ['pipes', words.join(' | ')],
      ['tabs', words.join('\t')],
      ['numbered list', numbered],
      ['numbered list, one per line', numberedLines],
      ['numbered with parens', words.map((w, i) => `${i + 1}) ${w}`).join(' ')],
      ['zero-width spaces', words.join('\u200b')],
      ['non-breaking spaces', words.join('\u00a0')],
      ['ideographic spaces', words.join('\u3000')],
      ['uppercase', VECTOR.toUpperCase()],
      ['padded and messy', `  ${numberedLines}  `],
    ] as const) {
      const result = inspectMnemonic(input);
      expect(result.wordCount, label).toBe(12);
      expect(result.checksumValid, `${label}: ${result.issue ?? ''}`).toBe(true);
      expect(result.canonical, label).toBe(VECTOR);
      expect(tokenizeMnemonic(input), label).toEqual(words);
    }
  });

  it('keeps a mistyped word as one token so it can be named', () => {
    const words = VECTOR.split(' ');
    words[4] = 'aband0n';
    const result = inspectMnemonic(`1. ${words.join(' 2. ')}`);
    expect(result.wordCount).toBe(12);
    expect(result.invalidWords).toHaveLength(1);
    expect(result.invalidWords[0]!.word).toBe('aband0n');
    expect(result.invalidWords[0]!.suggestions).toContain('abandon');
  });

  it('names the offending word and suggests a correction', () => {
    const words = VECTOR.split(' ');
    words[6] = 'abandom';
    const result = inspectMnemonic(words.join(' '));
    expect(result.checksumValid).toBe(false);
    expect(result.invalidWords).toHaveLength(1);
    expect(result.invalidWords[0]!.index).toBe(6);
    expect(result.invalidWords[0]!.word).toBe('abandom');
    expect(result.invalidWords[0]!.suggestions).toContain('abandon');
    // The message must be actionable, and 1-based like a human counts.
    expect(result.issue).toContain('第 7 个单词');
    expect(result.issue).toContain('abandom');
  });

  it('reports every unknown word, not just the first', () => {
    const words = VECTOR.split(' ');
    words[0] = 'zzzz';
    words[11] = 'qqqq';
    const result = inspectMnemonic(words.join(' '));
    expect(result.invalidWords.map((entry) => entry.index)).toEqual([0, 11]);
  });

  it('distinguishes a bad checksum from an unknown word', () => {
    // All words real, order wrong: this is the dangerous case, because the phrase
    // looks plausible and no offline device can prove it is not yours. The classic
    // test phrase is no use here — every word in it is "abandon", so a swap is a
    // no-op. Use a phrase whose words actually differ.
    const distinct = entropyToMnemonic(new TestDrbg('swap-test').bytes(16));
    const words = distinct.split(' ');
    const first = words[2]!;
    const second = words[9]!;
    expect(first).not.toBe(second);
    [words[2], words[9]] = [second, first];

    const result = inspectMnemonic(words.join(' '));
    expect(result.allWordsKnown).toBe(true);
    expect(result.invalidWords).toHaveLength(0);
    expect(result.checksumValid).toBe(false);
    expect(result.issue).toContain('校验位');
    expect(result.issue).toContain('顺序');
  });

  it('catches a single dropped word as a checksum failure', () => {
    const distinct = entropyToMnemonic(new TestDrbg('dropped').bytes(16));
    const words = distinct.split(' ');
    words.splice(5, 1);
    const result = inspectMnemonic(words.join(' '));
    expect(result.wordCount).toBe(11);
    expect(result.validWordCount).toBe(false);
    expect(result.issue).toContain('11');
  });

  it('explains an invalid word count instead of just rejecting', () => {
    const result = inspectMnemonic('abandon abandon abandon');
    expect(result.validWordCount).toBe(false);
    expect(result.strength).toBeNull();
    expect(result.issue).toContain('3');
    expect(result.issue).toContain('12 / 15 / 18 / 21 / 24');
  });

  it('handles empty and whitespace-only input without throwing', () => {
    for (const input of ['', '   ', '\n\n', '\u3000']) {
      const result = inspectMnemonic(input);
      expect(result.wordCount).toBe(0);
      expect(result.checksumValid).toBe(false);
      expect(result.issue).toBeTruthy();
    }
  });

  it('agrees with the derivation path the rest of the app uses', () => {
    // An imported phrase must produce the same wallet as a generated one would, or
    // "import" would silently mean "import something else".
    const inspection = inspectMnemonic(VECTOR);
    expect(inspection.checksumValid).toBe(true);
    const root = HDKey.fromMasterSeed(mnemonicToSeed(inspection.words.join(' '), ''));
    const exported = buildWalletExport(root, { accounts: 1 });
    expect(exported.masterFingerprint).toBe(fingerprintHex(root));
    expect(exported.accounts[0]!.firstAddress).toBe(
      publicKeyToAddress(derivePath(root, "m/44'/60'/0'/0/0").publicKey!),
    );
    // The classic test phrase is a well-known address, so this is externally checkable.
    expect(exported.accounts[0]!.firstAddress).toBe('0x9858EfFD232B4033E47d90003D41EC34EcaEda94');
  });
});
