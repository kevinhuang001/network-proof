import { describe, expect, it } from 'vitest';
import { cameraInfo, looksLikeFrontCamera, pickRearCameraId } from '../src/lib/camera';
import { scanHint } from '../src/lib/scanner';
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
      deviceId: null,
    });
    // A WebView that reports nothing is a zero, not an undefined that becomes "NaN×NaN" in
    // the one line meant to explain a blurry picture.
    expect(cameraInfo(fakeStream({}))).toEqual({
      width: 0,
      height: 0,
      frameRate: null,
      label: 'camera2 0, facing back',
      facingMode: null,
      deviceId: null,
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

  it('knows a front camera when it sees one', () => {
    // Not a quality judgement: a front camera's picture is mirrored, and a QR code is not
    // symmetric under a mirror, so jsQR can never read one — at any resolution.
    expect(looksLikeFrontCamera({ facingMode: 'user', label: '' })).toBe(true);
    expect(looksLikeFrontCamera({ facingMode: 'environment', label: 'camera2 1, facing front' })).toBe(false);
    expect(looksLikeFrontCamera({ facingMode: null, label: 'camera2 1, facing front' })).toBe(true);
    expect(looksLikeFrontCamera({ facingMode: null, label: '前置摄像头' })).toBe(true);
    // An unlabelled camera is not assumed to be the wrong one.
    expect(looksLikeFrontCamera({ facingMode: null, label: '' })).toBe(false);
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

  it('names the failures a user can act on', () => {
    // Four problems that look identical from the outside: nothing is being decoded.
    const hint = (phase: 'no-signal' | 'dark' | 'blank' | 'frozen') =>
      scanHint({ status: { phase, info: null }, progress: null });
    expect(hint('no-signal')).toContain('没有画面');
    expect(hint('dark')).toContain('全黑');
    expect(hint('blank')).toContain('对比度');
    expect(hint('frozen')).toContain('卡住');
    // And a live camera that simply has not seen the code yet says so, without blaming itself.
    expect(scanHint({ status: { phase: 'live', info: null }, progress: null })).toBe('把二维码放进取景框');
  });

  it('hands over to the transfer once frames are arriving', () => {
    // Progress beats status: the moment a code is being read, the count is the useful thing.
    expect(scanHint({ status: { phase: 'live', info: null }, progress: progress(3) })).toBe('3/12 分片');
    expect(scanHint({ status: { phase: 'searching', info: null }, progress: progress(1) })).toBe('1/12 分片');
  });

});
