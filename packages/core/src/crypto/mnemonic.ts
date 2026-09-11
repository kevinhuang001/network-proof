import {
  entropyToMnemonic as bip39EntropyToMnemonic,
  mnemonicToEntropy as bip39MnemonicToEntropy,
  mnemonicToSeedSync,
  validateMnemonic as bip39ValidateMnemonic,
} from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { NetProofError } from '../errors';

/** BIP39 master-secret strengths we support, in bits. */
export const SEED_STRENGTHS = [128, 160, 192, 224, 256] as const;
export type SeedStrength = (typeof SEED_STRENGTHS)[number];

export const WORDLIST = wordlist;

export function isSeedStrength(value: number): value is SeedStrength {
  return (SEED_STRENGTHS as readonly number[]).includes(value);
}

export function strengthToByteLength(strength: SeedStrength | number): number {
  if (!isSeedStrength(strength)) {
    throw new NetProofError('MNEMONIC_STRENGTH', `unsupported seed strength: ${strength}`, {
      supported: SEED_STRENGTHS,
    });
  }
  return strength / 8;
}

export function wordCountForStrength(strength: SeedStrength | number): number {
  return (strengthToByteLength(strength) * 8 + 11 - 1) / 11 + 0;
}

/**
 * Turn raw entropy into a BIP39 mnemonic. The entropy must come from
 * `CameraNoiseCollector`, never from a device CSPRNG alone.
 */
export function entropyToMnemonic(entropy: Uint8Array): string {
  if (!SEED_STRENGTHS.includes((entropy.length * 8) as SeedStrength)) {
    throw new NetProofError(
      'MNEMONIC_STRENGTH',
      `entropy must be 16/20/24/28/32 bytes, got ${entropy.length}`,
      { supported: SEED_STRENGTHS },
    );
  }
  return bip39EntropyToMnemonic(entropy, wordlist);
}

export function mnemonicToEntropy(mnemonic: string): Uint8Array {
  const normalized = normalizeMnemonic(mnemonic);
  if (!bip39ValidateMnemonic(normalized, wordlist)) {
    throw new NetProofError('MNEMONIC_INVALID', 'mnemonic failed its BIP39 checksum or wordlist check');
  }
  return bip39MnemonicToEntropy(normalized, wordlist);
}

export function validateMnemonic(mnemonic: string): boolean {
  try {
    return bip39ValidateMnemonic(normalizeMnemonic(mnemonic), wordlist);
  } catch {
    return false;
  }
}

/**
 * Collapse whitespace and apply NFKD, as BIP39 requires for localized wordlists
 * and for the passphrase salt. Users paste mnemonics with stray newlines and
 * full-width spaces, so normalizing here prevents "correct mnemonic, wrong seed".
 */
export function normalizeMnemonic(mnemonic: string): string {
  return mnemonic.normalize('NFKD').trim().replace(/\s+/gu, ' ');
}

export function mnemonicWords(mnemonic: string): string[] {
  const normalized = normalizeMnemonic(mnemonic);
  return normalized.length === 0 ? [] : normalized.split(' ');
}

export function wordCount(mnemonic: string): number {
  return mnemonicWords(mnemonic).length;
}

/**
 * BIP39 seed derivation: PBKDF2-HMAC-SHA512 over the mnemonic, salted with
 * "mnemonic" + passphrase, 2048 iterations. Both inputs are NFKD-normalized by
 * the underlying implementation.
 *
 * The passphrase is the "25th word": a second factor that produces a completely
 * different wallet from the same 24 words. We never store it — it is re-entered
 * for every signing operation.
 */
export function mnemonicToSeed(mnemonic: string, passphrase = ''): Uint8Array {
  const normalized = normalizeMnemonic(mnemonic);
  if (!bip39ValidateMnemonic(normalized, wordlist)) {
    throw new NetProofError('MNEMONIC_INVALID', 'mnemonic failed its BIP39 checksum or wordlist check');
  }
  return mnemonicToSeedSync(normalized, passphrase ?? '');
}

/**
 * Wordlist autocomplete for the recovery screen. Returns candidates by prefix,
 * plus "close" suggestions for typos using a cheap edit-distance ranking.
 */
export function suggestWords(prefix: string, limit = 6): string[] {
  const normalized = prefix.normalize('NFKD').trim().toLowerCase();
  if (normalized.length === 0) return [];
  const exact = WORDLIST.filter((word) => word.startsWith(normalized));
  if (exact.length >= limit) return exact.slice(0, limit);
  const fuzzy = WORDLIST.filter(
    (word) => !exact.includes(word) && editDistanceWithin(word.slice(0, normalized.length + 1), normalized, 1),
  );
  return [...exact, ...fuzzy].slice(0, limit);
}

function editDistanceWithin(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      best = Math.min(best, current[j]);
    }
    if (best > max) return false;
    previous = current;
  }
  return previous[b.length] <= max;
}

/** BIP39 word counts and their entropy strengths in bits. */
export const VALID_WORD_COUNTS = [12, 15, 18, 21, 24] as const;

/**
 * Split user input into candidate mnemonic words.
 *
 * `normalizeMnemonic` only collapses whitespace, which is correct for *deriving* a
 * seed from an already-canonical phrase but wrong for parsing what people actually
 * paste. Real input looks like:
 *
 *     1. abandon   2. ability   3. able
 *     abandon, ability, able
 *     abandon、ability、able
 *     abandon\u200b ability\u200b able      (zero-width spaces from a web page)
 *     ABANDON   ABILITY\tABLE
 *
 * A single-space split turns the comma and numbered-list forms into *one* token, so
 * the phrase looks like "1 word" and the user is told nothing useful. This tokenizer
 * handles all of the above and keeps a mistyped word such as `aband0n` as a single
 * token, so the error message can name it and suggest a correction.
 *
 * Only the BIP39 English wordlist is used by this project, and those words are plain
 * ASCII letters, so treating punctuation as a separator is safe.
 */
export function tokenizeMnemonic(input: string): string[] {
  return (
    input
      .normalize('NFKD')
      .toLowerCase()
      // Zero-width characters survive copy-paste from web pages and notes.
      .replace(/[\u200b-\u200d\ufeff]/gu, ' ')
      // Every whitespace flavour (\s misses none we care about with the u flag),
      // plus the punctuation people use to separate words, becomes one space.
      .replace(/[\s,;:|/\\、，。；：｜／]+/gu, ' ')
      // Strip list numbering: "1. abandon" / "2) ability" / "3、able".
      .replace(/(^|\s)\d+[.)\-、]\s*/gu, '$1')
      .trim()
      .split(' ')
      .filter((word) => word.length > 0)
  );
}

export interface InvalidWord {
  index: number;
  word: string;
  suggestions: string[];
}

export interface MnemonicInspection {
  words: string[];
  /** The phrase in canonical form: single spaces, lowercase, NFKD. Use this to derive. */
  canonical: string;
  wordCount: number;
  /** Words that are not in the BIP39 English wordlist, with near-miss suggestions. */
  invalidWords: InvalidWord[];
  allWordsKnown: boolean;
  validWordCount: boolean;
  /** The whole phrase verifies, checksum included. */
  checksumValid: boolean;
  /** Detected entropy strength in bits, or null when the word count is invalid. */
  strength: number | null;
  /** A single human-readable reason the phrase cannot be used, when there is one. */
  issue: string | null;
}

/**
 * Validate a typed or pasted mnemonic and explain precisely what is wrong.
 *
 * Importing an existing wallet is where users make mistakes that are expensive and
 * silent: a transposed word, a word typed in the wrong language, a stray newline.
 * A plain `validateMnemonic` boolean tells the user "no" and leaves them stuck, so
 * this reports per-word problems and wordlist suggestions instead — the difference
 * between "invalid" and "你就第 7 个单词拼错了，是不是 abandon？".
 *
 * Note what it explicitly cannot do: it verifies that the words form a *well-formed*
 * BIP39 phrase, not that they are *your* words. A phrase with two words swapped can
 * still carry a valid checksum, and no offline device can tell. That is why the
 * import flow shows the derived fingerprint and first address for the user to
 * compare against their existing wallet before anything is funded.
 */
export function inspectMnemonic(input: string): MnemonicInspection {
  const words = tokenizeMnemonic(input);
  const canonical = words.join(' ');
  const wordCount = words.length;

  const invalidWords: InvalidWord[] = [];
  words.forEach((word, index) => {
    if (!WORDLIST.includes(word)) {
      invalidWords.push({ index, word, suggestions: suggestWords(word, 4) });
    }
  });

  const validWordCount = (VALID_WORD_COUNTS as readonly number[]).includes(wordCount);
  const allWordsKnown = invalidWords.length === 0;
  const checksumValid = validWordCount && allWordsKnown && bip39ValidateMnemonic(canonical, wordlist);
  const strength = validWordCount ? (wordCount * 32) / 3 : null;

  let issue: string | null = null;
  if (wordCount === 0) {
    issue = '还没有输入助记词';
  } else if (!validWordCount) {
    issue = `单词数量为 ${wordCount}，BIP39 只接受 12 / 15 / 18 / 21 / 24 个单词`;
  } else if (!allWordsKnown) {
    const first = invalidWords[0]!;
    issue = `第 ${first.index + 1} 个单词「${first.word}」不在 BIP39 词表中`;
  } else if (!checksumValid) {
    issue = '单词都在词表中，但校验位不匹配——很可能是单词顺序错了，或者抄写时有笔误';
  }

  return {
    words,
    canonical,
    wordCount,
    invalidWords,
    allWordsKnown,
    validWordCount,
    checksumValid,
    strength,
    issue,
  };
}
