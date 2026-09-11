import { describe, expect, it } from 'vitest';
import { NetProofError } from '../src/errors';
import {
  bytesToUint256,
  cborBytesToHex,
  decodeCbor,
  encodeCbor,
  hexToCborBytes,
  uint256ToBytes,
} from '../src/qr/cbor';
import type { CborValue } from '../src/qr/cbor';
import {
  DEFAULT_FRAGMENT_LENGTH,
  FountainDecoder,
  FountainEncoder,
  Prng,
  chooseFragments,
  degreeDistribution,
} from '../src/qr/fountain';
import {
  FrameCollector,
  MAX_MESSAGE_BYTES,
  buildFrameSequence,
  encodeFrameBinary,
  frameText,
  parseFrame,
} from '../src/qr/frames';
import {
  PROTOCOL_VERSION,
  buildSignRequestMessage,
  buildXpubMessage,
  collectorFor,
  decodeMessage,
  deriveAddressFromXpub,
  encodeMessage,
  framesForMessage,
  signRequestClaim,
} from '../src/qr/protocol';
import type { SignRequestMessage, XpubExportMessage } from '../src/qr/protocol';
import { concat, crc32, toHex, u32be, utf8 } from '../src/util/bytes';
import { TestDrbg } from './helpers/synthetic';
import { mnemonicToSeed } from '../src/crypto/mnemonic';
import { HDKey } from '@scure/bip32';
import * as hdModule from '../src/crypto/hd';
import { buildWalletExport } from '../src/crypto/hd';

/** Protocol-level hex always carries the 0x prefix, matching viem. */
const hexId = (seed: string): string => toHex(new TestDrbg(seed).bytes(16), true);

const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const root = HDKey.fromMasterSeed(mnemonicToSeed(MNEMONIC, ''));

describe('cbor', () => {
  it('round-trips every supported type', () => {
    const value: CborValue = {
      neg: -1000,
      zero: 0,
      small: 23,
      byte24: 24,
      byte256: 256,
      byte65536: 65536,
      byte4g: 4294967296,
      big: 18446744073709551615n,
      text: 'hello 世界',
      bytes: new Uint8Array([1, 2, 3, 255]),
      flag: true,
      off: false,
      nothing: null,
      array: [1, 'two', new Uint8Array([3]), [4]],
      nested: { a: { b: [null, true] } },
      emptyArray: [],
      emptyBytes: new Uint8Array(0),
    };
    const decoded = decodeCbor(encodeCbor(value)) as Record<string, CborValue>;
    expect(decoded.neg).toBe(-1000);
    expect(decoded.small).toBe(23);
    expect(decoded.byte24).toBe(24);
    expect(decoded.byte256).toBe(256);
    expect(decoded.byte65536).toBe(65536);
    expect(decoded.byte4g).toBe(4294967296);
    // The encoder accepts up to 2^64-1, so the decoder must return it unchanged.
    expect(decoded.big).toBe(18446744073709551615n);
    expect(decodeCbor(encodeCbor(9007199254740993n))).toBe(9007199254740993n);
    expect(decoded.text).toBe('hello 世界');
    expect(decoded.bytes).toEqual(new Uint8Array([1, 2, 3, 255]));
    expect(decoded.flag).toBe(true);
    expect(decoded.off).toBe(false);
    expect(decoded.nothing).toBeNull();
    expect(decoded.array).toHaveLength(4);
    expect(decoded.emptyArray).toEqual([]);
    expect((decoded.emptyBytes as Uint8Array).length).toBe(0);
  });

  it('produces the RFC 8949 canonical encoding for the classic examples', () => {
    // These byte sequences are from the CBOR spec's diagnostic examples.
    expect(toHex(encodeCbor(0))).toBe('00');
    expect(toHex(encodeCbor(23))).toBe('17');
    expect(toHex(encodeCbor(24))).toBe('1818');
    expect(toHex(encodeCbor(1000))).toBe('1903e8');
    expect(toHex(encodeCbor(-1))).toBe('20');
    expect(toHex(encodeCbor(-1000))).toBe('3903e7');
    expect(toHex(encodeCbor(false))).toBe('f4');
    expect(toHex(encodeCbor(true))).toBe('f5');
    expect(toHex(encodeCbor(null))).toBe('f6');
    expect(toHex(encodeCbor('IETF'))).toBe('6449455446');
    expect(toHex(encodeCbor(new Uint8Array([1, 2, 3, 4])))).toBe('4401020304');
    expect(toHex(encodeCbor([1, 2, 3]))).toBe('83010203');
    expect(toHex(encodeCbor([]))).toBe('80');
    expect(toHex(encodeCbor({ a: 1, b: [2, 3] }))).toBe('a26161016162820203');
  });

  it('is deterministic: key order in the source object does not matter', () => {
    const a = encodeCbor({ z: 1, a: 2, m: 3 });
    const b = encodeCbor({ a: 2, m: 3, z: 1 });
    expect(toHex(a)).toBe(toHex(b));
    // Keys sort bytewise, so an uppercase key precedes a lowercase one.
    // 'A' (0x41) sorts before 'b' (0x62); 0x61 is the one-byte text head.
    expect(toHex(encodeCbor({ b: 1, A: 2 }))).toBe('a2614102616201');
  });

  it('rejects rather than guesses on unsupported input', () => {
    expect(() => encodeCbor(1.5)).toThrow(/non-integer/);
    expect(() => encodeCbor(undefined as never)).toThrow(/unsupported CBOR value type/);
    expect(() => encodeCbor(1n << 64n)).toThrow(/above 2\^64-1/);
    expect(() => decodeCbor(new Uint8Array([0xff]))).toThrow(/unsupported/);
    // Indefinite-length arrays are refused, not silently accepted.
    expect(() => decodeCbor(new Uint8Array([0x9f, 0x01, 0xff]))).toThrow(/indefinite-length/);
    // A truncated item must be an error, never a partial value.
    expect(() => decodeCbor(new Uint8Array([0x18]))).toThrow(/unexpected end/);
    expect(() => decodeCbor(new Uint8Array([0x44, 0x01]))).toThrow(/needs 4 bytes/);
    // Trailing garbage is an error: it would hide a second message.
    expect(() => decodeCbor(new Uint8Array([0x01, 0x02]))).toThrow(/trailing bytes/);
    // Duplicate keys are ambiguous and therefore refused.
    expect(() => decodeCbor(new Uint8Array([0xa2, 0x61, 0x61, 0x01, 0x61, 0x61, 0x02]))).toThrow(
      /duplicate CBOR map key/,
    );
  });

  it('carries uint256 quantities exactly as fixed-width byte strings', () => {
    const max = (1n << 256n) - 1n;
    expect(toHex(uint256ToBytes(1n))).toBe('00'.repeat(31) + '01');
    expect(bytesToUint256(uint256ToBytes(max))).toBe(max);
    expect(() => uint256ToBytes(1n << 256n)).toThrow(/out of uint256 range/);
    expect(() => bytesToUint256(new Uint8Array(31))).toThrow(/32-byte quantity/);
    expect(cborBytesToHex(hexToCborBytes('0xdeadbeef'))).toBe('0xdeadbeef');
  });
});

describe('fountain code', () => {
  it('is deterministic and covers the whole range', () => {
    const draw = (seed: string) => {
      const prng = new Prng(utf8(seed));
      return Array.from({ length: 200 }, () => prng.nextInt(16));
    };
    const first = draw('seed');
    const second = draw('seed');
    expect(second).toEqual(first);
    // Two independent seeds must differ, and a bounded sampler must stay in range.
    expect(draw('other')).not.toEqual(first);
    const buckets = new Set(first);
    expect(Math.min(...first)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...first)).toBeLessThan(16);
    expect(buckets.size).toBe(16);
  });

  it('refuses invalid bounds', () => {
    const prng = new Prng(utf8('seed'));
    expect(() => prng.nextInt(0)).toThrow(/positive bound/);
    expect(() => prng.nextInt(-3)).toThrow(/positive bound/);
    expect(() => prng.nextInt(1.5)).toThrow(/positive bound/);
    expect(prng.nextInt(1)).toBe(0);
    expect(prng.nextInt(2)).toBeLessThan(2);
  });

  it('builds a proper degree distribution', () => {
    for (const k of [1, 2, 5, 20, 100, 1000]) {
      const cumulative = degreeDistribution(k);
      expect(cumulative).toHaveLength(k);
      expect(cumulative[k - 1]).toBeCloseTo(1, 12);
      for (let i = 1; i < k; i++) {
        expect(cumulative[i]).toBeGreaterThanOrEqual(cumulative[i - 1]);
      }
    }
    expect(degreeDistribution(1)).toEqual([1]);
  });

  it('picks deterministic, in-range fragment sets', () => {
    const digest = new Uint8Array(32).fill(7);
    for (const seqNum of [0, 1, 99]) {
      const a = chooseFragments(seqNum, 40, digest);
      const b = chooseFragments(seqNum, 40, digest);
      expect(a).toEqual(b);
      expect(new Set(a).size).toBe(a.length);
      for (const index of a) {
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(40);
      }
    }
    expect(chooseFragments(0, 1, digest)).toEqual([0]);
    // A different digest gives a different (but still valid) plan.
    expect(chooseFragments(3, 40, new Uint8Array(32).fill(8))).not.toEqual(
      chooseFragments(3, 40, digest),
    );
  });

  it('reconstructs a message from frames delivered out of order, with repeats', () => {
    const drbg = new TestDrbg('payload');
    const payload = drbg.bytes(5000);
    const encoder = new FountainEncoder(payload, { fragmentLength: 200 });
    expect(encoder.fragmentCount).toBe(25);

    const decoder = new FountainDecoder({
      fragmentLength: 200,
      digestPrefix: encoder.digestPrefix,
      fragmentCount: encoder.fragmentCount,
      messageLength: payload.length,
    });

    // Deliver a shuffled set of frames, repeating some, skipping others.
    const order = Array.from({ length: 80 }, (_, i) => i);
    let state = 99;
    for (let i = order.length - 1; i > 0; i--) {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      const j = state % (i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (const seqNum of order) {
      decoder.addFrame(encoder.frame(seqNum));
      if (decoder.progress.complete) break;
    }

    expect(decoder.progress.complete).toBe(true);
    expect(decoder.progress.solved).toBe(decoder.progress.total);
    expect(decoder.progress.usefulFrames).toBeGreaterThanOrEqual(encoder.fragmentCount);
    expect(decoder.progress.duplicateFrames).toBeGreaterThan(0);
    expect(toHex(decoder.result())).toBe(toHex(payload));
  });

  it('handles the single-fragment fast path', () => {
    const payload = utf8('a short message');
    const encoder = new FountainEncoder(payload, { fragmentLength: 100 });
    expect(encoder.fragmentCount).toBe(1);
    const decoder = FountainDecoder.fromFrame(encoder.frame(0));
    decoder.addFrame(encoder.frame(0));
    expect(decoder.progress.complete).toBe(true);
    expect(toHex(decoder.result())).toBe(toHex(payload));
  });

  it('wraps frame indices so a sender can animate forever', () => {
    const encoder = new FountainEncoder(TextDrbg(400), { fragmentLength: 100 });
    const a = encoder.frame(0);
    const b = encoder.frame(4);
    expect(toHex(a.data)).not.toBe(toHex(b.data));
    // Frame 4 of a 4-fragment message is distinct from frame 0, and the sequence
    // is infinite because the PRNG is counter-based.
    expect(encoder.frame(9999).data.length).toBe(100);
  });

  it('ignores frames belonging to another transfer', () => {
    const encoderA = new FountainEncoder(TextDrbg(400, 'a'), { fragmentLength: 100 });
    const encoderB = new FountainEncoder(TextDrbg(400, 'b'), { fragmentLength: 100 });
    const decoder = FountainDecoder.fromFrame(encoderA.frame(0));
    decoder.addFrame(encoderB.frame(0));
    expect(decoder.progress.usefulFrames).toBe(0);
    expect(decoder.progress.foreignFrames).toBe(1);
    decoder.addFrame(encoderA.frame(0));
    decoder.addFrame(encoderA.frame(1));
    expect(decoder.progress.solved).toBeGreaterThan(0);
  });

  it('refuses to hand back a payload whose digest does not match', () => {
    const payload = TextDrbg(200);
    const encoder = new FountainEncoder(payload, { fragmentLength: 100 });
    const decoder = new FountainDecoder({
      fragmentLength: 100,
      digestPrefix: encoder.digestPrefix,
      fragmentCount: 2,
      messageLength: 200,
    });
    // Forge a frame whose data does not match the digest it claims.
    const honest = encoder.frame(0);
    const forged = { ...honest, data: new Uint8Array(honest.data.map((b) => b ^ 0xff)) };
    decoder.addFrame(forged);
    // The raw decoder refuses loudly rather than returning corrupt bytes.
    expect(() => decoder.addFrame(encoder.frame(1))).toThrow(/does not match the transmitted digest/);
  });

  it('turns a corrupt transfer into a restartable failure, not a crash', () => {
    const payload = TextDrbg(200);
    const encoder = new FountainEncoder(payload, { fragmentLength: 100 });
    const collected = new FrameCollector('NP-REQ');
    const honest = encoder.frame(0);
    const forged = { ...honest, data: new Uint8Array(honest.data.map((b) => b ^ 0xff)) };
    collected.addText(frameText('NP-REQ', forged.seqNum, forged.fragmentCount, encodeFrameBinary(forged)));
    collected.addText(frameText('NP-REQ', 1, encoder.fragmentCount, encodeFrameBinary(encoder.frame(1))));
    expect(collected.complete).toBe(false);
    expect(collected.failed).toBe(true);
    expect(collected.result.bind(collected)).toBeDefined();
    expect(() => collected.result()).toThrow(/does not match the transmitted digest/);
    // After a reset the collector is usable again.
    collected.reset();
    expect(collected.failed).toBe(false);
    for (const frame of buildFrameSequence('NP-REQ', payload, { fragmentLength: 100 }).frames) {
      collected.addText(frame);
      if (collected.complete) break;
    }
    expect(toHex(collected.result())).toBe(toHex(payload));
  });

  it('validates its inputs', () => {
    expect(() => new FountainEncoder(new Uint8Array(0))).toThrow(/empty payload/);
    expect(() => new FountainEncoder(utf8('x'), { fragmentLength: 4 })).toThrow(/>= 16/);
    expect(
      () => new FountainDecoder({ fragmentLength: 100, digestPrefix: new Uint8Array(3), fragmentCount: 1, messageLength: 10 }),
    ).toThrow(/exactly 4 bytes/);
    expect(
      () => new FountainDecoder({ fragmentLength: 100, digestPrefix: new Uint8Array(4), fragmentCount: 0, messageLength: 10 }),
    ).toThrow(/fragmentCount/);
    expect(
      () => new FountainDecoder({ fragmentLength: 100, digestPrefix: new Uint8Array(4), fragmentCount: 1, messageLength: 0 }),
    ).toThrow(/inconsistent/);
  });

  it('fits the default frame budget inside a QR code', () => {
    const encoder = new FountainEncoder(TextDrbg(DEFAULT_FRAGMENT_LENGTH * 3), {});
    const text = frameText('NP-REQ', 0, encoder.fragmentCount, encodeFrameBinary(encoder.frame(0)));
    // Alphanumeric QR mode caps out at 4296 characters for version 40.
    expect(text.length).toBeLessThan(900);
    expect(/^[0-9A-Z $%*+\-./:]+$/u.test(text)).toBe(true);
  });
});

describe('frame text format', () => {
  it('round-trips a frame through its text form', () => {
    const encoder = new FountainEncoder(TextDrbg(600), { fragmentLength: 128 });
    for (const seqNum of [0, 1, 5]) {
      const frame = encoder.frame(seqNum);
      const text = frameText('NP-REQ', seqNum, encoder.fragmentCount, encodeFrameBinary(frame));
      const parsed = parseFrame(text);
      expect(parsed.type).toBe('NP-REQ');
      expect(parsed.seqNum).toBe(seqNum);
      expect(parsed.fragmentCount).toBe(encoder.fragmentCount);
      expect(toHex(parsed.digestPrefix)).toBe(toHex(encoder.digestPrefix));
      expect(parsed.messageLength).toBe(600);
      expect(toHex(parsed.data)).toBe(toHex(frame.data));
    }
  });

  it('rejects malformed or corrupted frames', () => {
    expect(() => parseFrame('hello world')).toThrow(/not a NetProof QR frame/);
    expect(() => parseFrame('NP1:NP-XXX:0-1:AAAA')).toThrow(/unknown frame type/);
    expect(() => parseFrame('NP1:NP-REQ:0-0:AAAA')).toThrow(/fragmentCount must be >= 1/);
    expect(() => parseFrame('NP1:NP-REQ:0-1:!!!!')).toThrow(/not a NetProof QR frame/);
    expect(() => parseFrame('NP1:NP-REQ:0-1:AA')).toThrow(/only .* bytes/);

    const encoder = new FountainEncoder(TextDrbg(300), { fragmentLength: 128 });
    const good = frameText('NP-REQ', 0, encoder.fragmentCount, encodeFrameBinary(encoder.frame(0)));
    // Flip a character in the base32 body: the CRC must catch it.
    const body = good.slice(0, -1) + (good.endsWith('A') ? 'B' : 'A');
    expect(() => parseFrame(body)).toThrow(NetProofError);
  });

  it('refuses a message that does not fit its declared geometry', () => {
    // A frame whose checksum is valid but whose declared length exceeds what its
    // fragment count could possibly hold.
    const data = new Uint8Array(32).fill(9);
    const header = concat(new Uint8Array([1, 2, 3, 4]), new Uint8Array([0xff, 0xff]));
    const binary = concat(header, u32be(crc32(concat(header, data))), data);
    expect(() => parseFrame(frameText('NP-REQ', 0, 1, binary))).toThrow(/exceeds the capacity/);

    // And a payload too large for the 16-bit length field cannot be framed at all.
    expect(MAX_MESSAGE_BYTES).toBe(0xffff);
    const huge = new FountainEncoder(TextDrbg(64), { fragmentLength: 64 });
    expect(() =>
      encodeFrameBinary({ ...huge.frame(0), messageLength: MAX_MESSAGE_BYTES + 1 }),
    ).toThrow(/exceeds the 65535-byte frame format limit/);
  });

  it('validates frame coordinates', () => {
    const frame = new FountainEncoder(TextDrbg(64), { fragmentLength: 64 }).frame(0);
    const binary = encodeFrameBinary(frame);
    expect(() => frameText('NP-REQ', -1, 1, binary)).toThrow(/non-negative/);
    expect(() => frameText('NP-REQ', 0, 0, binary)).toThrow(/fragmentCount/);
  });
});

describe('frame collector', () => {
  it('collects an animated sequence and reports progress', () => {
    const payload = new TestDrbg('collector').bytes(1500);
    const sequence = buildFrameSequence('NP-XPUB', payload, { fragmentLength: 200 });
    const collector = new FrameCollector('NP-XPUB');
    expect(collector.complete).toBe(false);

    // Scan the frames in the order they are displayed, looping as a camera would.
    let scans = 0;
    outer: for (let round = 0; round < 4; round++) {
      for (const frame of sequence.frames) {
        collector.addText(frame);
        scans++;
        if (collector.complete) break outer;
      }
    }
    expect(collector.complete).toBe(true);
    expect(scans).toBeGreaterThanOrEqual(sequence.fragmentCount);
    expect(toHex(collector.result())).toBe(toHex(payload));
  });

  it('tolerates corrupt scans, foreign frames and repeated scans', () => {
    const payload = new TestDrbg('tolerant').bytes(400);
    const sequence = buildFrameSequence('NP-SIG', payload, { fragmentLength: 200 });
    const collector = new FrameCollector('NP-SIG');
    const other = buildFrameSequence('NP-XPUB', new TestDrbg('other').bytes(400), { fragmentLength: 200 });

    // Noise the camera will inevitably see: not a frame at all, and a valid frame
    // from a different transfer. Neither may throw.
    collector.addText('not a frame');
    collector.addText('https://example.com/some-other-qr');
    expect(collector.addText(other.frames[0]!).rejectedFrames).toBe(3);
    for (const frame of sequence.frames) {
      collector.addText(frame);
      collector.addText(frame); // the same code scanned twice
    }
    expect(collector.complete).toBe(true);
    expect(collector.rejected).toBeGreaterThan(0);
    expect(collector.addText(sequence.frames[0]!).rejectedFrames).toBeGreaterThan(2);
  });

  it('explains what is happening while progress is slow', () => {
    const payload = new TestDrbg('slow').bytes(4000);
    const sequence = buildFrameSequence('NP-REQ', payload, { fragmentLength: 400 });
    const collector = new FrameCollector('NP-REQ');

    expect(collector.addText(sequence.frames[0]!).hint).toMatch(/取景框/);
    // Scan distinct frames until something has actually been solved.
    let solved = 0;
    for (const frame of sequence.frames) {
      const progress = collector.addText(frame);
      solved = progress.solved;
      if (solved > 0) break;
    }
    expect(solved).toBeGreaterThan(0);
    expect(collector.addText(sequence.frames[0]!).hint).toMatch(/已恢复/);

    // A camera stuck on one code produces duplicates, which must be reported as a
    // link problem rather than silent patience.
    for (let i = 0; i < sequence.fragmentCount + 6; i++) collector.addText(sequence.frames[0]!);
    expect(collector.addText(sequence.frames[0]!).hint).toMatch(/进度缓慢/);
  });

  it('throws when asked for a result it does not have', () => {
    const collector = new FrameCollector('NP-REQ');
    expect(() => collector.result()).toThrow(/no frames have been scanned/);
    const sequence = buildFrameSequence('NP-REQ', new TestDrbg('partial').bytes(2000), { fragmentLength: 200 });
    collector.addText(sequence.frames[0]!);
    expect(() => collector.result()).toThrow(/transfer incomplete/);
  });
});

describe('protocol messages', () => {
  const wallet = buildWalletExport(root, { accounts: 2, passphraseProtected: true });

  it('round-trips an xpub export with every derivation scheme', () => {
    const message = buildXpubMessage(wallet, { name: 'NetProof Air', model: 'Pixel 4a (offline)' });
    const decoded = decodeMessage(encodeMessage(message)) as XpubExportMessage;
    expect(decoded.t).toBe('xpub');
    expect(decoded.v).toBe(PROTOCOL_VERSION);
    expect(decoded.fingerprint).toBe(wallet.masterFingerprint);
    expect(decoded.rootXpub).toBe(wallet.rootXpub);
    expect(decoded.passphraseProtected).toBe(true);
    expect(decoded.device.name).toBe('NetProof Air');
    expect(decoded.accounts).toHaveLength(wallet.accounts.length);
    expect(decoded.schemes.map((s) => s.id)).toEqual(['bip44']);
    expect(decoded.accounts[0]!.xpub).toBe(wallet.accounts[0]!.xpub);
    expect(decoded.accounts[0]!.firstAddress).toBe(wallet.accounts[0]!.firstAddress);
  });

  it('round-trips a transaction sign request with exact uint256 values', () => {
    const request = buildSignRequestMessage({
      t: 'req',
      id: hexId('req-id'),
      kind: 'tx',
      path: "m/44'/60'/0'/0/3",
      address: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
      chainId: 1,
      origin: 'https://app.uniswap.org',
      tx: {
        type: 'eip1559',
        nonce: 12,
        to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        value: ((1n << 256n) - 1n).toString(),
        data: '0xa9059cbb00000000000000000000000070997970c51812dc3a010c7d01b50e0d17dc79c8',
        gas: '60000',
        maxFeePerGas: '30000000000',
        maxPriorityFeePerGas: '1500000000',
      },
    });
    const decoded = decodeMessage(encodeMessage(request)) as SignRequestMessage;
    expect(decoded.kind).toBe('tx');
    expect(decoded.origin).toBe('https://app.uniswap.org');
    expect(decoded.tx?.value).toBe(((1n << 256n) - 1n).toString());
    // Addresses travel as raw bytes; the receiving side re-derives the EIP-55
    // checksum for display (see describeTransaction).
    expect(decoded.tx?.to?.toLowerCase()).toBe('0x70997970c51812dc3a010c7d01b50e0d17dc79c8');
    expect(decoded.tx?.gas).toBe('60000');
    expect(decoded.claim).toBe(request.claim);
  });

  it('carries the network the user selected on the device', () => {
    // The device asks for a network before showing its login code, so the companion
    // can land on the right token list instead of defaulting to Ethereum.
    const withChain = buildXpubMessage(
      { ...wallet, chainId: 42161 },
      { name: 'NetProof Air', model: 'test' },
    );
    expect(withChain.chainId).toBe(42161);
    const decoded = decodeMessage(encodeMessage(withChain)) as XpubExportMessage;
    expect(decoded.chainId).toBe(42161);

    // A payload from a device that did not send one still decodes; the companion then
    // keeps whatever network it was already on.
    const withoutChain = buildXpubMessage(wallet, { name: 'NetProof Air', model: 'test' });
    expect(withoutChain.chainId).toBeUndefined();
    expect((decodeMessage(encodeMessage(withoutChain)) as XpubExportMessage).chainId).toBeUndefined();
  });

  it('binds a request to its exact bytes via the claim', () => {
    const request = buildSignRequestMessage({
      t: 'req',
      id: hexId('claim-id'),
      kind: 'msg',
      path: "m/44'/60'/0'/0/0",
      address: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
      chainId: 1,
      message: { text: 'Sign in to NetProof' },
    });
    // The claim is reproducible from the decoded message (the device does exactly this).
    const decoded = decodeMessage(encodeMessage(request)) as SignRequestMessage;
    const { claim: _claim, ...rest } = decoded;
    expect(signRequestClaim(rest)).toBe(request.claim);
    // Changing any field changes the claim.
    expect(signRequestClaim({ ...rest, chainId: 137 })).not.toBe(request.claim);
    expect(signRequestClaim({ ...rest, address: '0x0000000000000000000000000000000000000001' })).not.toBe(
      request.claim,
    );
  });

  it('round-trips a legacy transaction request and a typed-data request', () => {
    const legacy = buildSignRequestMessage({
      t: 'req',
      id: hexId('legacy-id'),
      kind: 'tx',
      path: "m/44'/60'/1'/0/0",
      address: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
      chainId: 56,
      tx: {
        type: 'legacy',
        nonce: 0,
        to: null,
        value: '0',
        data: '0x60806040',
        gas: '1000000',
        gasPrice: '5000000000',
      },
    });
    const decodedLegacy = decodeMessage(encodeMessage(legacy)) as SignRequestMessage;
    expect(decodedLegacy.tx?.type).toBe('legacy');
    expect(decodedLegacy.tx?.to).toBeNull();
    expect(decodedLegacy.tx?.gasPrice).toBe('5000000000');
    expect(decodedLegacy.tx?.maxFeePerGas).toBeUndefined();

    const typed = buildSignRequestMessage({
      t: 'req',
      id: hexId('typed-id'),
      kind: 'typed',
      path: "m/44'/60'/0'/0/0",
      address: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
      chainId: 1,
      typed: {
        domain: { name: 'Permit2', chainId: 1, verifyingContract: '0x000000000022D473030F116dDEE9F6B43aC78BA3' },
        types: { PermitTransferFrom: [{ name: 'permitted', type: 'TokenPermissions' }] },
        primaryType: 'PermitTransferFrom',
        message: { permitted: { token: '0x0000000000000000000000000000000000000001', amount: '1000' } },
      },
    });
    const decodedTyped = decodeMessage(encodeMessage(typed)) as SignRequestMessage;
    expect(decodedTyped.kind).toBe('typed');
    expect(decodedTyped.typed?.primaryType).toBe('PermitTransferFrom');
    expect(decodedTyped.typed?.domain.name).toBe('Permit2');
  });

  it('round-trips signature responses and acknowledgements', () => {
    const signed = {
      t: 'sig' as const,
      v: PROTOCOL_VERSION,
      id: hexId('sig-id'),
      ok: true,
      kind: 'tx' as const,
      address: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
      claim: `0x${'ab'.repeat(32)}`,
      digest: `0x${'cd'.repeat(32)}`,
      raw: '0x02f86b0180843b9aca00847735940082520894',
    };
    const decoded = decodeMessage(encodeMessage(signed));
    expect(decoded).toEqual(signed);

    const ack = { t: 'ack' as const, v: PROTOCOL_VERSION, id: signed.id, ok: false, error: '用户取消' };
    expect(decodeMessage(encodeMessage(ack))).toEqual(ack);
  });

  it('rejects malformed or misleading messages', () => {
    expect(() => decodeMessage(encodeCbor({ t: 'req', v: 99 }))).toThrow(/unsupported protocol version/);
    expect(() => decodeMessage(encodeCbor({ t: 'nope', v: 1 }))).toThrow(/unknown message type/);
    expect(() => decodeMessage(encodeCbor([1, 2, 3]))).toThrow(/must be a CBOR map/);
    expect(() => decodeMessage(encodeCbor({ t: 'xpub', v: 1 }))).toThrow(/field "fp"/);
    // A "successful" signature response with no signature is a protocol violation.
    expect(() =>
      decodeMessage(
        encodeCbor({
          t: 'sig',
          v: 1,
          id: new Uint8Array(16),
          ok: true,
          k: 'tx',
          a: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
          claim: new Uint8Array(32),
          dg: new Uint8Array(32),
        }),
      ),
    ).toThrow(/must carry a signature/);
    expect(() =>
      decodeMessage(
        encodeCbor({ t: 'req', v: 1, id: new Uint8Array(16), k: 'weird', p: 'm', a: '0x1', c: 1, claim: new Uint8Array(32) }),
      ),
    ).toThrow(/unknown sign request kind/);
  });

  it('frames a message and recovers it through the collector', () => {
    const message = buildXpubMessage(wallet, { name: 'NetProof Air', model: 'test' });
    const frames = framesForMessage('NP-XPUB', message, 200);
    expect(frames.frames.length).toBeGreaterThan(frames.idealScans);
    const collector = collectorFor('NP-XPUB');
    for (const frame of frames.frames) {
      collector.addText(frame);
      if (collector.complete) break;
    }
    expect(collector.complete).toBe(true);
    const decoded = decodeMessage(collector.result()) as XpubExportMessage;
    expect(decoded.rootXpub).toBe(wallet.rootXpub);
  });

  it('derives companion-side addresses from an exported xpub without any private key', () => {
    const message = buildXpubMessage(wallet, { name: 'NetProof Air', model: 'test' });
    // Independent reference: derive the same addresses straight from the seed.
    const reference = (path: string): string => {
      const { publicKeyToAddress: toAddress } = hdModule;
      return toAddress(hdModule.derivePath(root, path).publicKey!);
    };

    const bip44 = message.accounts.find((a) => a.scheme === 'bip44' && a.account === 0)!;
    for (const index of [0, 1, 7, 42]) {
      const resolved = deriveAddressFromXpub(bip44.xpub, 'bip44', 0, index);
      expect(resolved.address, `index ${index}`).toBe(reference(`m/44'/60'/0'/0/${index}`));
      expect(resolved.path).toBe(`m/44'/60'/0'/0/${index}`);
    }

    // Account 1 must resolve to a different family of addresses.
    const bip44Account1 = message.accounts.find((a) => a.scheme === 'bip44' && a.account === 1)!;
    for (const index of [0, 3]) {
      const resolved = deriveAddressFromXpub(bip44Account1.xpub, 'bip44', 1, index);
      expect(resolved.address).toBe(reference(`m/44'/60'/1'/0/${index}`));
    }
    expect(() => deriveAddressFromXpub(bip44.xpub, 'nonexistent', 0, 0)).toThrow(/unknown derivation scheme/);
  });
});

/** Small helper: deterministic byte payload of a given length. */
function TextDrbg(length: number, seed = 'text-drbg'): Uint8Array {
  return new TestDrbg(seed).bytes(length);
}
