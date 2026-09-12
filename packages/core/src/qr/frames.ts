import { base32nopad } from '@scure/base';
import { NetProofError } from '../errors';
import { concat, crc32, readU32be, u32be } from '../util/bytes';
import { FountainDecoder, FountainEncoder } from './fountain';
import type { DecoderProgress, FountainFrame } from './fountain';

/**
 * Text framing for animated QR codes.
 *
 *   NP1:<TYPE>:<seqNum>-<fragmentCount>:<BASE32>
 *
 * Every character is in the QR "alphanumeric" mode charset (0-9, A-Z and
 * space $ % * + - . / :), which packs 5.5 bits per module instead of 8. That is
 * worth ~35% more payload per QR version than base64 in byte mode, and it lets a
 * cheap 128x128 screen still show a usable code.
 *
 * The base32 blob decodes to:
 *
 *   [0..4)    digest prefix   — seeds the fountain plan, identifies the transfer
 *   [4..8)    crc32(header||fragment) — reject a misread scan immediately
 *   [8..10)   message length, big-endian uint16
 *   [10..)    fragment data
 */
export const FRAME_MAGIC = 'NP1';
export const FRAME_HEADER_BYTES = 10;
/** Longest message a single transfer can carry, bounded by the uint16 length field. */
export const MAX_MESSAGE_BYTES = 0xffff;

export type FrameType = 'NP-XPUB' | 'NP-REQ' | 'NP-SIG' | 'NP-ACK';

export const FRAME_TYPES: FrameType[] = ['NP-XPUB', 'NP-REQ', 'NP-SIG', 'NP-ACK'];

export interface EncodedFrame {
  type: FrameType;
  seqNum: number;
  fragmentCount: number;
  text: string;
  bytes: Uint8Array;
}

export function encodeFrameBinary(frame: FountainFrame): Uint8Array {
  if (frame.messageLength > MAX_MESSAGE_BYTES) {
    throw new NetProofError(
      'QR_FRAME_INVALID',
      `message of ${frame.messageLength} bytes exceeds the ${MAX_MESSAGE_BYTES}-byte frame format limit`,
    );
  }
  const header = concat(
    frame.digestPrefix,
    new Uint8Array([(frame.messageLength >> 8) & 0xff, frame.messageLength & 0xff]),
  );
  const checksum = u32be(crc32(concat(header, frame.data)));
  return concat(header, checksum, frame.data);
}

export function frameText(type: FrameType, seqNum: number, fragmentCount: number, binary: Uint8Array): string {
  if (!Number.isInteger(seqNum) || seqNum < 0) {
    throw new NetProofError('QR_FRAME_INVALID', `seqNum must be a non-negative integer, got ${seqNum}`);
  }
  if (!Number.isInteger(fragmentCount) || fragmentCount < 1) {
    throw new NetProofError('QR_FRAME_INVALID', `fragmentCount must be >= 1, got ${fragmentCount}`);
  }
  return `${FRAME_MAGIC}:${type}:${seqNum}-${fragmentCount}:${base32nopad.encode(binary)}`;
}

export interface ParsedFrame extends FountainFrame {
  type: FrameType;
}

/** Parse a scanned QR string back into a fountain frame. */
export function parseFrame(text: string): ParsedFrame {
  const match = /^NP1:([A-Z0-9-]+):(\d+)-(\d+):([A-Z2-7]+)$/u.exec(text.trim());
  if (!match) {
    throw new NetProofError('QR_FRAME_INVALID', 'not a NetProof QR frame');
  }
  const [, rawType, rawSeq, rawCount, body] = match;
  const type = rawType as FrameType;
  if (!FRAME_TYPES.includes(type)) {
    throw new NetProofError('QR_FRAME_INVALID', `unknown frame type ${rawType}`);
  }
  const seqNum = Number.parseInt(rawSeq, 10);
  const fragmentCount = Number.parseInt(rawCount, 10);
  if (fragmentCount < 1) {
    throw new NetProofError('QR_FRAME_INVALID', 'fragmentCount must be >= 1');
  }
  let binary: Uint8Array;
  try {
    binary = base32nopad.decode(body);
  } catch {
    throw new NetProofError('QR_FRAME_INVALID', 'frame body is not valid base32');
  }
  if (binary.length < FRAME_HEADER_BYTES) {
    throw new NetProofError('QR_FRAME_INVALID', `frame body is only ${binary.length} bytes`);
  }
  const digestPrefix = binary.subarray(0, 4);
  const messageLength = (binary[4] << 8) | binary[5];
  const expectedChecksum = readU32be(binary, 6);
  const data = binary.subarray(FRAME_HEADER_BYTES);
  const actualChecksum = crc32(concat(digestPrefix, binary.subarray(4, 6), data));
  if (expectedChecksum !== actualChecksum) {
    throw new NetProofError('QR_CHECKSUM_MISMATCH', 'frame checksum mismatch (misread scan)');
  }
  if (messageLength === 0) {
    throw new NetProofError('QR_FRAME_INVALID', 'frame declares a zero-length message');
  }
  if (messageLength > fragmentCount * data.length) {
    throw new NetProofError(
      'QR_FRAME_INVALID',
      `messageLength ${messageLength} exceeds the capacity of ${fragmentCount} fragments`,
    );
  }
  return { type, seqNum, fragmentCount, digestPrefix, messageLength, data };
}

/**
 * The QR version this wallet aims to display.
 *
 * Measured, not guessed. A signing request is 315 bytes of CBOR and an xpub export 476; at the
 * old flat 300-byte fragment those became **73×73** module codes. A phone camera photographing
 * another screen has to resolve every one of those modules, and 73 of them across the middle
 * square of a 480-pixel scan is about four pixels per module — which is where jsQR stops
 * working, and what 「扫不到二维码」 looks like from the other side of the glass.
 *
 * At 57 modules (version 10) the same request needs eight frames instead of seven. One extra
 * frame, at 420 ms, in exchange for 28% more pixels per module, is not a trade — it is the
 * difference between a code that scans and a code that does not.
 */
export const TARGET_FRAME_CHARS = 280;

/**
 * How many distinct frames a transfer may contain before density wins over frame count.
 *
 * Below this the rule is "as few modules as possible"; above it, waiting for 30 frames becomes
 * the worse problem, and a denser code is the lesser evil.
 */
export const MAX_AUTO_FRAMES = 24;

/** Characters a frame text of this fragment length takes, measured against the real encoder. */
function frameCharsFor(fragmentLength: number): number {
  // ceil(bytes × 8 / 5) for base32, plus the `NP1:<TYPE>:<seq>-<count>:` header.
  return Math.ceil((fragmentLength * 8) / 5) + 31;
}

/** Frames the builder will produce for this payload, matching `buildFrameSequence`. */
function framesFor(payloadLength: number, fragmentLength: number): number {
  const fragmentCount = Math.max(1, Math.ceil(payloadLength / fragmentLength));
  return Math.ceil(fragmentCount * 1.6) + 3;
}

/**
 * The fragment length to use for a payload of this size, never above the user's own preset.
 *
 * The preset keeps its meaning — it is the *ceiling*, "how dense am I willing to let a frame
 * be" — and this lowers it until a frame is small enough to resolve, unless doing so would
 * stretch the transfer past `MAX_AUTO_FRAMES`, in which case the ceiling wins.
 */
export function chooseFragmentLength(
  payloadLength: number,
  ceiling = 300,
  options: { targetFrameChars?: number; maxFrames?: number } = {},
): number {
  const target = options.targetFrameChars ?? TARGET_FRAME_CHARS;
  const maxFrames = options.maxFrames ?? MAX_AUTO_FRAMES;
  if (payloadLength <= 0) return ceiling;

  // Largest first: the first candidate that is small enough wins.
  const candidates = [ceiling, 400, 300, 250, 200, 160, 128, 100, 80, 64]
    .filter((length, index, all) => length <= ceiling && all.indexOf(length) === index)
    .sort((a, b) => b - a);

  for (const candidate of candidates) {
    if (framesFor(payloadLength, candidate) > maxFrames) break; // smaller means even more frames
    if (frameCharsFor(candidate) <= target) return candidate;
  }
  return ceiling;
}

export interface FrameSequenceOptions {
  fragmentLength?: number;
  /** Number of distinct frames to generate before wrapping around. */
  frameCount?: number;
}

export interface AnimatedFrames {
  type: FrameType;
  fragmentCount: number;
  /** Total payload size in bytes. */
  messageLength: number;
  /** Distinct frames to loop through, in order. */
  frames: string[];
  /** Ideal number of scans needed for a receiver to complete. */
  idealScans: number;
}

/**
 * Build the frame set to animate. We generate somewhat more than `fragmentCount`
 * distinct frames because the last few fragments of a fountain transfer are the
 * expensive ones to collect ("coupon collector"): extra frames raise the chance
 * that any given scan is useful.
 */
export function buildFrameSequence(
  type: FrameType,
  payload: Uint8Array,
  options: FrameSequenceOptions = {},
): AnimatedFrames {
  const encoder = new FountainEncoder(payload, {
    ...(options.fragmentLength !== undefined ? { fragmentLength: options.fragmentLength } : {}),
  });
  const count = options.frameCount ?? Math.ceil(encoder.fragmentCount * 1.6) + 3;
  const frames: string[] = [];
  for (let i = 0; i < count; i++) {
    const frame = encoder.frame(i);
    frames.push(frameText(type, frame.seqNum, frame.fragmentCount, encodeFrameBinary(frame)));
  }
  return {
    type,
    fragmentCount: encoder.fragmentCount,
    messageLength: encoder.messageLength,
    frames,
    idealScans: encoder.idealFrameCount,
  };
}

export interface FrameCollectorProgress extends DecoderProgress {
  /** Scans that were not usable frames (garbage, other QR codes, wrong type). */
  rejectedFrames: number;
  /** Human-facing hint about what to do next. */
  hint: string;
  /**
   * Set when a transfer was reconstructed but failed verification, or when the
   * scanner saw something unrecoverable. The UI should ask for a fresh start.
   */
  failure?: string;
}

/**
 * Accumulates scanned frames until the whole message is recovered. Tolerates
 * repeated scans, out-of-order scans and frames from other transfers.
 */
export class FrameCollector {
  private decoder: FountainDecoder | null = null;
  private expectedType: FrameType | null = null;
  private rejectedFrames = 0;
  private failure: string | undefined;

  constructor(expectedType?: FrameType) {
    this.expectedType = expectedType ?? null;
  }

  get rejected(): number {
    return this.rejectedFrames;
  }

  /**
   * Feed one scanned string.
   *
   * A camera pointed at the world sees plenty of things that are not our frames:
   * other QR codes, glare, half a code, a code from the wrong transfer. None of
   * that is exceptional, so all of it is counted as a rejected scan rather than
   * thrown at the caller.
   */
  addText(text: string): FrameCollectorProgress {
    let parsed: ParsedFrame;
    try {
      parsed = parseFrame(text);
    } catch (error) {
      if (error instanceof NetProofError) {
        this.rejectedFrames++;
        return this.progressState();
      }
      throw error;
    }
    if (this.expectedType && parsed.type !== this.expectedType) {
      this.rejectedFrames++;
      return this.progressState();
    }
    if (this.decoder === null) {
      this.decoder = FountainDecoder.fromFrame(parsed);
    }
    try {
      this.decoder.addFrame(parsed);
    } catch (error) {
      // Every fragment arrived but the payload failed its digest check. That is
      // not a missed frame, it is a corrupt transfer: stop and tell the user.
      if (error instanceof NetProofError) {
        this.failure = error.message;
        return this.progressState();
      }
      throw error;
    }
    return this.progressState();
  }

  /** Abandon the current transfer and start over. */
  reset(): void {
    this.decoder = null;
    this.rejectedFrames = 0;
    this.failure = undefined;
  }

  get complete(): boolean {
    return (this.decoder?.progress.complete ?? false) && this.failure === undefined;
  }

  get failed(): boolean {
    return this.failure !== undefined;
  }

  /** The recovered message. Throws when the transfer is incomplete. */
  result(): Uint8Array {
    if (this.failure !== undefined) {
      throw new NetProofError('QR_CHECKSUM_MISMATCH', this.failure);
    }
    if (!this.decoder) {
      throw new NetProofError('QR_DECODE_FAILED', 'no frames have been scanned yet');
    }
    return this.decoder.result();
  }

  private progressState(): FrameCollectorProgress {
    const progress: DecoderProgress = this.decoder?.progress ?? {
      solved: 0,
      total: 0,
      usefulFrames: 0,
      duplicateFrames: 0,
      foreignFrames: 0,
      complete: false,
    };
    let hint = '请将取景框对准另一台设备上的动画二维码';
    if (this.failure !== undefined) hint = '接收失败：请重新开始扫码';
    else if (progress.complete) hint = '接收完成';
    else if (progress.total === 0) hint = '等待第一帧…';
    else if (
      (progress.usefulFrames > progress.total * 2 && progress.solved < progress.total * 0.8) ||
      progress.duplicateFrames > progress.total
    ) {
      // Either the frames are not helping, or the same code keeps being seen —
      // both mean the optical link needs fixing, not more patience.
      hint = '进度缓慢：请拉近距离、提高屏幕亮度，或增加二维码尺寸';
    } else if (progress.solved > 0) {
      hint = `已恢复 ${progress.solved}/${progress.total} 个分片，请继续扫描`;
    }
    return {
      ...progress,
      rejectedFrames: this.rejectedFrames,
      ...(this.failure !== undefined ? { failure: this.failure } : {}),
      hint,
    };
  }
}
