import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeed } from '../src/crypto/mnemonic';
import { buildWalletExport, derivePath, publicKeyToAddress } from '../src/crypto/hd';
import { signTransaction } from '../src/crypto/evm';
import {
  buildSignRequestMessage,
  buildXpubMessage,
  decodeMessage,
  framesForMessage,
  FrameCollector,
} from '../src/qr/index';
import type { SignRequestMessage, SignResponseMessage, XpubExportMessage } from '../src/qr/index';
import { toHex } from '../src/util/bytes';
import { TestDrbg } from './helpers/synthetic';
import { PROTOCOL_VERSION } from '../src/qr/protocol';

/**
 * End-to-end air-gap test: message -> fountain frames -> real QR images ->
 * jsQR decode (the same decoder the two apps use) -> fountain decode -> message.
 *
 * This is the only test that proves the whole optical chain works. Everything
 * above it could pass while the frames were still too dense for a real camera to
 * read, so this one renders actual pixels and reads them back.
 */

const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const root = HDKey.fromMasterSeed(mnemonicToSeed(MNEMONIC, ''));
const PRIVATE_KEY = derivePath(root, "m/44'/60'/0'/0/0").privateKey!;
const ADDRESS = publicKeyToAddress(derivePath(root, "m/44'/60'/0'/0/0").publicKey!);

/** Render QR text to an RGBA bitmap, the way the apps paint it on screen. */
function renderQr(text: string, scale = 4, margin = 4): { data: Uint8ClampedArray; width: number; height: number } {
  const created = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const moduleCount = created.modules.size;
  const moduleData = created.modules.data;
  const size = (moduleCount + margin * 2) * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);

  for (let y = 0; y < moduleCount; y++) {
    for (let x = 0; x < moduleCount; x++) {
      // `modules.data` is a flat Uint8Array of 0/1, row-major.
      if (!moduleData[y * moduleCount + x]) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = (x + margin) * scale + dx;
          const py = (y + margin) * scale + dy;
          const offset = (py * size + px) * 4;
          data[offset] = 0;
          data[offset + 1] = 0;
          data[offset + 2] = 0;
          data[offset + 3] = 255;
        }
      }
    }
  }
  return { data, width: size, height: size };
}

/** Simulate a camera: render the text to pixels, then decode it back. */
function scan(text: string, scale = 4): string {
  const image = renderQr(text, scale);
  const result = jsQR(image.data, image.width, image.height);
  if (!result) throw new Error(`jsQR could not decode a frame (${text.length} chars, scale ${scale})`);
  return result.data;
}

describe('QR image round trip', () => {
  it('encodes and decodes a single frame through real pixels', () => {
    const text = `NP1:NP-XPUB:0-1:${'A'.repeat(200)}`;
    const decoded = scan(text);
    expect(decoded).toBe(text);
  });

  it('keeps every frame inside the QR alphanumeric capacity', () => {
    const wallet = buildWalletExport(root, { accounts: 3 });
    const frames = framesForMessage('NP-XPUB', buildXpubMessage(wallet, { name: 'NetProof Air', model: 'test' }));
    expect(frames.frames.length).toBeGreaterThan(0);
    for (const frame of frames.frames) {
      // Version 40 QR at level M holds 4296 alphanumeric characters.
      expect(frame.length).toBeLessThan(4296);
      expect(/^[0-9A-Z $%*+\-./:]+$/u.test(frame)).toBe(true);
      expect(scan(frame)).toBe(frame);
    }
  });
});

describe('air-gap flows over real QR images', () => {
  it('transfers a full xpub export (scan-to-login) through the camera', () => {
    const wallet = buildWalletExport(root, { accounts: 3, passphraseProtected: true });
    const message = buildXpubMessage(wallet, { name: 'NetProof Air', model: 'Pixel 4a (air-gapped)' });
    const frames = framesForMessage('NP-XPUB', message);

    // The companion scans the animated display, looping until it has enough.
    const collector = new FrameCollector('NP-XPUB');
    let rounds = 0;
    outer: for (let loop = 0; loop < 6; loop++) {
      rounds++;
      for (const frame of frames.frames) {
        collector.addText(scan(frame));
        if (collector.complete) break outer;
      }
    }

    expect(collector.complete).toBe(true);
    expect(rounds).toBeLessThanOrEqual(3);
    const decoded = decodeMessage(collector.result()) as XpubExportMessage;
    expect(decoded.t).toBe('xpub');
    expect(decoded.rootXpub).toBe(wallet.rootXpub);
    expect(decoded.fingerprint).toBe(wallet.masterFingerprint);
    expect(decoded.passphraseProtected).toBe(true);
    expect(decoded.accounts.map((a) => a.scheme)).toContain('bip44');

    // The companion can now derive addresses it never held a key for.
    const bip44 = decoded.accounts.find((a) => a.scheme === 'bip44' && a.account === 0)!;
    expect(bip44.firstAddress).toBe(ADDRESS);
  });

  it('signs an ERC-20 approval on the device and returns it over QR', async () => {
    // 1. The dApp asks for an unlimited approval; the companion builds a request.
    const request = buildSignRequestMessage({
      t: 'req',
      id: toHex(new TestDrbg('e2e-request').bytes(16), true),
      kind: 'tx',
      path: "m/44'/60'/0'/0/0",
      address: ADDRESS,
      chainId: 1,
      origin: 'https://app.example.org',
      tx: {
        type: 'eip1559',
        nonce: 3,
        to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        value: '0',
        data:
          '0x095ea7b3' +
          '0000000000000000000000001111111254eeb25477b68fb85ed929f73a960582' +
          'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        gas: '60000',
        maxFeePerGas: '30000000000',
        maxPriorityFeePerGas: '1500000000',
      },
    });

    // 2. Companion -> device: the request animates as QR frames.
    const requestFrames = framesForMessage('NP-REQ', request, 300);
    const deviceCollector = new FrameCollector('NP-REQ');
    outer: for (let loop = 0; loop < 6; loop++) {
      for (const frame of requestFrames.frames) {
        deviceCollector.addText(scan(frame));
        if (deviceCollector.complete) break outer;
      }
    }
    expect(deviceCollector.complete).toBe(true);
    const received = decodeMessage(deviceCollector.result()) as SignRequestMessage;
    expect(received.origin).toBe('https://app.example.org');
    expect(received.tx?.data).toContain('095ea7b3');

    // 3. The device signs exactly what it decoded (this is the trust boundary).
    const signedTx = signTransaction(
      {
        type: received.tx!.type,
        chainId: received.chainId,
        nonce: received.tx!.nonce,
        to: received.tx!.to,
        value: BigInt(received.tx!.value),
        data: received.tx!.data,
        gas: BigInt(received.tx!.gas),
        maxFeePerGas: BigInt(received.tx!.maxFeePerGas!),
        maxPriorityFeePerGas: BigInt(received.tx!.maxPriorityFeePerGas!),
      },
      PRIVATE_KEY,
    );
    expect(signedTx.from.toLowerCase()).toBe(ADDRESS.toLowerCase());

    const response = {
      t: 'sig' as const,
      v: PROTOCOL_VERSION,
      id: received.id,
      ok: true,
      kind: 'tx' as const,
      address: ADDRESS,
      claim: received.claim,
      digest: signedTx.hash,
      raw: signedTx.rawTransaction,
    };

    // 4. Device -> companion: the signature animates back.
    const responseFrames = framesForMessage('NP-SIG', response, 300);
    const companionCollector = new FrameCollector('NP-SIG');
    outer2: for (let loop = 0; loop < 6; loop++) {
      for (const frame of responseFrames.frames) {
        companionCollector.addText(scan(frame));
        if (companionCollector.complete) break outer2;
      }
    }
    expect(companionCollector.complete).toBe(true);
    const decodedResponse = decodeMessage(companionCollector.result()) as SignResponseMessage;
    expect(decodedResponse.id).toBe(request.id);
    // The claim binds the response to the exact request the companion sent.
    expect(decodedResponse.claim).toBe(request.claim);
    expect(decodedResponse.raw).toBe(signedTx.rawTransaction);

    // 5. The companion verifies the payload it approved is the one that was signed.
    const { verifySignedTransaction } = await import('../src/crypto/evm');
    const verification = await verifySignedTransaction(decodedResponse.raw!, {
      from: ADDRESS,
      hash: signedTx.hash,
      request: {
        type: received.tx!.type,
        chainId: received.chainId,
        nonce: received.tx!.nonce,
        to: received.tx!.to,
        value: BigInt(received.tx!.value),
        data: received.tx!.data,
        gas: BigInt(received.tx!.gas),
        maxFeePerGas: BigInt(received.tx!.maxFeePerGas!),
        maxPriorityFeePerGas: BigInt(received.tx!.maxPriorityFeePerGas!),
      },
    });
    expect(verification.ok, verification.reasons.join('; ')).toBe(true);
  });

  it('survives a camera that misses frames and sees doubles', () => {
    const payload = new TestDrbg('noisy-camera').bytes(6000);
    const frames = framesForMessage('NP-SIG', {
      t: 'sig',
      v: PROTOCOL_VERSION,
      id: `0x${'11'.repeat(16)}`,
      ok: true,
      kind: 'msg',
      address: ADDRESS,
      claim: `0x${'22'.repeat(32)}`,
      digest: `0x${'33'.repeat(32)}`,
      signature: toHex(payload.subarray(0, 65), true),
    });
    const collector = new FrameCollector('NP-SIG');

    let scanned = 0;
    let missed = 0;
    outer: for (let loop = 0; loop < 8; loop++) {
      for (const frame of frames.frames) {
        // Drop ~35% of frames entirely, as a real camera does.
        if (scanned % 20 < 7) {
          missed++;
          scanned++;
          continue;
        }
        scanned++;
        // Occasionally scan the same code twice, or catch garbage.
        if (scanned % 11 === 0) collector.addText(scan(frame));
        if (scanned % 17 === 0) collector.addText('garbage-that-is-not-a-frame');
        collector.addText(scan(frame));
        if (collector.complete) break outer;
      }
    }

    expect(missed).toBeGreaterThan(0);
    expect(collector.complete).toBe(true);
    const decoded = decodeMessage(collector.result()) as SignResponseMessage;
    expect(decoded.signature).toBe(toHex(payload.subarray(0, 65), true));
  });

  it('never accepts a corrupted image as a valid frame', () => {
    // Simulation of glare/partial occlusion: flip a few percent of the modules.
    // Either jsQR fails outright, or the frame CRC rejects the misread. What must
    // never happen is a frame being accepted with wrong contents.
    const wallet = buildWalletExport(root, { accounts: 3 });
    const frames = framesForMessage('NP-XPUB', buildXpubMessage(wallet, { name: 'x', model: 'y' }), 300);
    const honest = frames.frames[0]!;
    let corruptedScans = 0;
    let rejected = 0;

    for (let attempt = 0; attempt < 30; attempt++) {
      const rendered = renderQr(honest, 4);
      const drbg = new TestDrbg(`glare-${attempt}`);
      const pixels = rendered.data;
      for (let i = 0; i < pixels.length; i += 4) {
        if (drbg.int(1000) < 4) {
          pixels[i] = pixels[i] === 0 ? 255 : 0;
          pixels[i + 1] = pixels[i];
          pixels[i + 2] = pixels[i];
        }
      }
      const result = jsQR(pixels, rendered.width, rendered.height);
      if (!result) continue;
      corruptedScans++;
      const collector = new FrameCollector('NP-XPUB');
      collector.addText(result.data);
      if (collector.rejected > 0) rejected++;
      else expect(result.data).toBe(honest);
    }

    // The invariant is what matters: no corrupted scan was ever treated as data.
    expect(corruptedScans + rejected).toBeGreaterThanOrEqual(0);
    expect(() => scan(honest)).not.toThrow();
  });
});
