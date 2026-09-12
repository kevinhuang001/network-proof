import { vaultDeserialize, vaultSerialize } from '@netproof/core';
import type { VaultBlob } from '@netproof/core';

/**
 * Device-side vault storage.
 *
 * For the prototype this is `localStorage` inside the WebView sandbox, which is
 * already stronger than it sounds: the WebView origin is app-private, the data
 * never leaves the device, and the payload is encrypted with Argon2id +
 * XChaCha20-Poly1305 before it is written, so a filesystem dump yields ciphertext.
 *
 * The interface is deliberately narrow so a hardened build can swap in
 * `@capacitor/preferences` backed by the Android Keystore (hardware-backed key,
 * requiring user authentication) without touching any screen code.
 */

const VAULT_KEY = 'netproof.vault.v1';
const SETTINGS_KEY = 'netproof.settings.v1';

export interface DeviceSettings {
  deviceName: string;
  /**
   * Whether the encrypted vault contains a BIP39 passphrase.
   *
   * No longer a user preference — the product decision is that a passphrase is
   * always stored alongside the mnemonic, so signing never asks for it again. This
   * value is written automatically and exists only so the *unlock* screen can say
   * what to expect before the vault has been decrypted (the real answer lives inside
   * the ciphertext and is unreadable until then).
   */
  storePassphrase: boolean;
  /** Number of account indices exported. */
  /** Preferred derivation scheme id. */
  preferredScheme: string;
  /**
   * How many Solana addresses the device exports.
   *
   * Solana has no watchable account key (SLIP-0010 is hardened-only), so the device
   * sends addresses rather than xpubs. That makes the count a real decision: each one
   * is a piece of the wallet handed to the companion.
   */
  solanaAddressCount: number;
  /** Frame interval for animated QR, in ms. */
  qrFrameDurationMs: number;
  /** Fragment size in bytes; smaller is more robust, larger is faster. */
  qrFragmentLength: number;
}

export const DEFAULT_SETTINGS: DeviceSettings = {
  deviceName: 'NetProof Air',
  storePassphrase: false,
  preferredScheme: 'bip44',
  solanaAddressCount: 5,
  qrFrameDurationMs: 420,
  qrFragmentLength: 300,
};

function safeStorage(): Storage | null {
  try {
    // Private-mode WebViews throw on access rather than returning null.
    const probe = '__netproof_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

export function hasVault(): boolean {
  return safeStorage()?.getItem(VAULT_KEY) !== null;
}

export function saveVault(blob: VaultBlob): void {
  const storage = safeStorage();
  if (!storage) throw new Error('此设备的本地存储不可用，无法保存钱包');
  storage.setItem(VAULT_KEY, vaultSerialize(blob));
}

export function loadVault(): VaultBlob | null {
  const storage = safeStorage();
  const raw = storage?.getItem(VAULT_KEY);
  if (!raw) return null;
  return vaultDeserialize(raw);
}

export function clearVault(): void {
  safeStorage()?.removeItem(VAULT_KEY);
}

export function loadSettings(): DeviceSettings {
  const raw = safeStorage()?.getItem(SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<DeviceSettings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: DeviceSettings): void {
  safeStorage()?.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/** App-level metadata the companion displays so the user can recognise the device. */
export function deviceDescriptor(settings: DeviceSettings): { name: string; model: string } {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const android = /Android\s+([\d.]+)/u.exec(ua)?.[1];
  const model = /;\s*([^;)]+)\s+Build\//u.exec(ua)?.[1]?.trim();
  return {
    name: settings.deviceName,
    model: model ?? (android ? `Android ${android}` : 'Air-gapped device'),
  };
}

/** Best-effort wipe of secrets from memory. JS strings cannot be reliably zeroed. */
export function wipe(...buffers: (Uint8Array | undefined | null)[]): void {
  for (const buffer of buffers) buffer?.fill(0);
}
