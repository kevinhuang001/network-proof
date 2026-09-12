import { describe, expect, it } from 'vitest';
import { SHARP_WIDTH, cameraInfo, pickRearCameraId } from '../src/lib/camera';
import { scanCameraNote, scanHint } from '../src/lib/scanner';
import type { FrameCollectorProgress } from '@netproof/core';

/**
 * The camera, as far as it can be tested without a camera.
 *
 * Two separate complaints are pinned here. The first: the screen said 「正在打开摄像头…」 for
 * as long as the user was willing to believe it, because the hint was derived from the decode
 * progress — which does not exist until a frame has been read, so a live camera that simply
 * was not seeing a code kept claiming it had not started. The second: the preview was soft, and
 * nothing anywhere said how soft or why.
 */

function fakeStream(settings: Record<string, unknown>, label = 'camera2 0, facing back'): MediaStream {
  return {
    getVideoTracks: () => [{ getSettings: () => settings, label }],
  } as unknown as MediaStream;
}

describe('what the camera actually gave us', () => {
  it('reads the stream back, including what it does not say', () => {
    expect(cameraInfo(fakeStream({ width: 1920, height: 1080, frameRate: 30, facingMode: 'environment' }))).toEqual({
      width: 1920,
      height: 1080,
      frameRate: 30,
      label: 'camera2 0, facing back',
      facingMode: 'environment',
    });
    // A WebView that reports nothing is a zero, not an undefined that becomes "NaN×NaN" in
    // the one line meant to explain a blurry picture.
    expect(cameraInfo(fakeStream({}))).toEqual({
      width: 0,
      height: 0,
      frameRate: null,
      label: 'camera2 0, facing back',
      facingMode: null,
    });
  });

  it('picks the rear camera by name, and never a front one when there is a choice', () => {
    const devices = [
      { kind: 'videoinput', deviceId: 'a', label: 'camera2 1, facing front' },
      { kind: 'videoinput', deviceId: 'b', label: 'camera2 0, facing back' },
      { kind: 'audioinput', deviceId: 'c', label: 'microphone' },
    ];
    expect(pickRearCameraId(devices)).toBe('b');
    // Chinese labels exist too, and an unlabelled camera is still a candidate.
    expect(
      pickRearCameraId([
        { kind: 'videoinput', deviceId: 'x', label: '前置摄像头' },
        { kind: 'videoinput', deviceId: 'y', label: '后置摄像头' },
      ]),
    ).toBe('y');
    expect(pickRearCameraId([{ kind: 'videoinput', deviceId: 'z', label: '' }])).toBe('z');
  });

  it('falls back to the only camera there is, and to nothing when there is none', () => {
    // A phone with one front camera can still scan; refusing to try would be worse.
    expect(pickRearCameraId([{ kind: 'videoinput', deviceId: 'f', label: 'camera2 1, facing front' }])).toBe('f');
    expect(pickRearCameraId([])).toBeNull();
    expect(pickRearCameraId([{ kind: 'audioinput', deviceId: 'm', label: 'microphone' }])).toBeNull();
  });
});

describe('what the scan screen says', () => {
  const progress = (solved: number): FrameCollectorProgress =>
    ({ solved, total: 12, hint: `${solved}/12 分片`, duplicateFrames: 0, rejectedFrames: 0 }) as FrameCollectorProgress;

  it('tells the truth about a camera that is open and not seeing anything', () => {
    expect(scanHint({ status: null, progress: null })).toBe('正在打开摄像头…');
    expect(scanHint({ status: { phase: 'opening', info: null }, progress: null })).toBe('正在打开摄像头…');
    // The bug: this used to keep saying 「正在打开摄像头…」 forever.
    expect(scanHint({ status: { phase: 'live', info: null }, progress: null })).toBe('把二维码放进取景框');
    expect(scanHint({ status: { phase: 'searching', info: null }, progress: null })).toContain('还没扫到');
  });

  it('hands over to the transfer once frames are arriving', () => {
    // Progress beats status: the moment a code is being read, the count is the useful thing.
    expect(scanHint({ status: { phase: 'live', info: null }, progress: progress(3) })).toBe('3/12 分片');
    expect(scanHint({ status: { phase: 'searching', info: null }, progress: progress(1) })).toBe('1/12 分片');
  });

  it('puts a number on a soft picture', () => {
    expect(scanCameraNote(null)).toBeNull();
    expect(scanCameraNote({ width: 0, height: 0, frameRate: null, label: '', facingMode: null })).toBeNull();
    expect(
      scanCameraNote({ width: 1920, height: 1080, frameRate: 30, label: '', facingMode: null }),
    ).toBe('摄像头 1920×1080');
    // The number that explains the blur, and what to do about it.
    const low = scanCameraNote({ width: 640, height: 480, frameRate: 30, label: '', facingMode: null });
    expect(low).toContain('640×480');
    expect(low).toContain('放近');
    expect(SHARP_WIDTH).toBe(960);
  });
});
