import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  DEFAULT_KDF_PARAMS,
  HDKey,
  buildWalletExport,
  createVault,
  entropyToMnemonic,
  mnemonicToSeed,
  normalizeMnemonic,
  openVault,
  randomBytes,
  sealWithKey,
  secretFromWallet,
  toHex,
  validateMnemonic,
} from '@netproof/core';
import type { EntropyResult, VaultBlob, VaultData, VaultSecret, VaultWallet, WalletExport } from '@netproof/core';
import {
  clearVault,
  deviceDescriptor,
  hasVault,
  loadSettings,
  loadVault,
  saveSettings,
  saveVault,
} from '../lib/storage';
import type { DeviceSettings } from '../lib/storage';

/**
 * Session state.
 *
 * The rule this file exists to enforce: **the mnemonic and the BIP39 passphrase
 * live in memory only.** They are never written anywhere unencrypted, they are
 * dropped on lock, and the derived xpubs are all the companion ever sees.
 *
 * The vault password encrypts the mnemonic at rest with Argon2id (64 MiB, 3
 * passes) + XChaCha20-Poly1305, with the KDF parameters authenticated so they
 * cannot be downgraded by an attacker who can rewrite storage.
 */

export interface SessionValue {
  hasVault: boolean;
  unlocked: boolean;
  /** Every wallet on the device, decrypted. */
  wallets: VaultWallet[];
  /** The wallet currently selected for export and signing. */
  activeWallet: VaultWallet | null;
  selectWallet: (id: string) => void;
  /** Add a wallet to the vault, re-encrypting under the already-derived key. */
  addWallet: (input: { mnemonic: string; passphrase: string; label?: string; provenance?: VaultWallet['provenance'] }) => void;
  /** Delete a wallet. Refuses to remove the last one. */
  deleteWallet: (id: string) => void;
  renameWallet: (id: string, label: string) => void;
  wallet: WalletExport | null;
  settings: DeviceSettings;
  /** Session passphrase. Held in memory only, dropped on lock. */
  passphrase: string;
  /**
   * True when this device's wallet was created with a BIP39 passphrase.
   *
   * Distinct from "a passphrase is currently loaded": the user may have chosen not
   * to store it, in which case the session can legitimately hold none — and then the
   * device is showing the *decoy* account, which the UI must say out loud.
   */
  passphraseRequired: boolean;
  /**
   * The mnemonic, available only while unlocked. It is the one secret that must
   * exist in memory to sign; `lock()` drops the reference.
   */
  mnemonic: string | null;
  deviceInfo: { name: string; model: string };
  entropy: EntropyResult | null;
  createWallet: (input: {
    entropy: EntropyResult;
    passphrase: string;
    password: string;
    /** Name shown on the device's wallet list. */
    label?: string;
  }) => void;
  /**
   * Import an existing wallet from a mnemonic.
   *
   * A separate entry point from `createWallet` on purpose: the provenance recorded
   * in the vault is different, and the UI must be able to say plainly that this
   * wallet's phrase was *not* produced by this device's camera. Collapsing the two
   * would let an imported wallet masquerade as a camera-generated one.
   */
  importWallet: (input: {
    mnemonic: string;
    passphrase: string;
    password: string;
    label?: string;
  }) => void;
  unlock: (password: string, passphrase?: string) => void;
  rekey: (passphrase: string) => void;
  updateSettings: (patch: Partial<DeviceSettings>) => void;
  lock: () => void;
  wipe: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}

export function SessionProvider({ children }: { children: ReactNode }): ReactNode {
  const [settings, setSettings] = useState<DeviceSettings>(() => loadSettings());
  const [vault, setVault] = useState<VaultBlob | null>(() => loadVault());
  const [vaultData, setVaultData] = useState<VaultData | null>(null);
  /**
   * The derived vault key, held only while unlocked.
   *
   * Deliberately the key and not the password: adding or deleting a wallet has to
   * re-encrypt the payload, and re-prompting for the password each time would make
   * the feature useless. The password itself is never retained.
   */
  const vaultKeyRef = useRef<Uint8Array | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [entropy, setEntropy] = useState<EntropyResult | null>(null);

  const deriveWallet = useCallback(
    (value: VaultSecret, sessionPassphrase: string): WalletExport => {
      const seed = mnemonicToSeed(value.mnemonic, sessionPassphrase);
      const root = HDKey.fromMasterSeed(seed);
      // One account key, at `m/44'/60'/0'/0`: its children are the accounts, so the companion
      // never needs the device again to add one.
      return buildWalletExport(root, {
        passphraseProtected: sessionPassphrase.length > 0,
      });
    },
    [],
  );

  const activeWallet = useMemo<VaultWallet | null>(() => {
    if (!vaultData) return null;
    return (
      vaultData.wallets.find((entry) => entry.id === vaultData.activeWalletId) ??
      vaultData.wallets[0] ??
      null
    );
  }, [vaultData]);

  const secret = useMemo(() => (activeWallet ? secretFromWallet(activeWallet) : null), [activeWallet]);

  const wallet = useMemo<WalletExport | null>(() => {
    if (!secret) return null;
    return deriveWallet(secret, passphrase);
  }, [secret, passphrase, deriveWallet]);

  /** Re-encrypt the payload under the in-memory key and persist it. */
  const persistData = useCallback(
    (next: VaultData) => {
      const blob = vault ?? loadVault();
      const key = vaultKeyRef.current;
      if (!blob || !key) throw new Error('设备未解锁');
      const sealed = sealWithKey(blob, key, next);
      saveVault(sealed);
      setVault(sealed);
      setVaultData(next);
    },
    [vault],
  );

  /**
   * Encrypt, persist and activate a wallet. The single place where a secret reaches
   * storage, so both the generate and import paths cannot diverge in how they key
   * the vault or what they remember.
   */
  const persist = useCallback(
    (nextSecret: VaultSecret, password: string, label = '主钱包') => {
      const nextVault = createVault(nextSecret, password, {
        kdf: { ...DEFAULT_KDF_PARAMS, salt: '' },
        label,
      });
      saveVault(nextVault);
      // Unlock immediately and keep the derived key, so the user is not asked for the
      // password again when they add a second wallet.
      const opened = openVault(nextVault, password);
      vaultKeyRef.current = opened.key;
      const nextSettings = {
        ...settings,
        // Mirrors the vault rather than recording a choice: a passphrase, when one
        // exists, is always inside the vault from now on.
        storePassphrase: nextSecret.passphrase !== undefined,
      };
      saveSettings(nextSettings);
      setSettings(nextSettings);
      setVault(nextVault);
      setVaultData(opened.data);
    },
    [settings],
  );

  const createWallet = useCallback<SessionValue['createWallet']>(
    ({ entropy: result, passphrase: userPassphrase, password, label }) => {
      const mnemonic = entropyToMnemonic(result.bytes);
      persist(
        {
          mnemonic,
          // Always stored when present. The consequence is documented in
          // docs/SECURITY.md §4.11: the vault password now protects both factors, so
          // compromising it compromises the wallet outright.
          ...(userPassphrase.length > 0 ? { passphrase: userPassphrase } : {}),
          ...(userPassphrase.length > 0 ? { passphraseRequired: true } : {}),
          entropy: {
            source: result.sources
              .filter((source) => source.estimatedMinEntropyBits > 0)
              .map((source) => source.name)
              .join('+'),
            frames: result.stats.frames,
            estimatedMinEntropyBits: result.estimatedMinEntropyBits,
            transcriptDigest: result.transcriptDigest,
          },
          createdAt: Date.now(),
          words: mnemonic.split(' ').length,
        },
        password,
        label && label.trim().length > 0 ? label.trim() : '主钱包',
      );
      setPassphrase(userPassphrase);
      setEntropy(result);
    },
    [persist],
  );

  const importWallet = useCallback<SessionValue['importWallet']>(
    ({ mnemonic, passphrase: userPassphrase, password, label }) => {
      if (!validateMnemonic(mnemonic)) {
        throw new Error('助记词校验失败，请检查单词拼写与顺序');
      }
      const normalized = normalizeMnemonic(mnemonic);
      // Force the PBKDF2 derivation here, so a passphrase typo surfaces at import
      // time — when the user can still compare the fingerprint — rather than at the
      // first (and possibly only) signing attempt.
      mnemonicToSeed(normalized, userPassphrase);
      persist(
        {
          mnemonic: normalized,
          ...(userPassphrase.length > 0 ? { passphrase: userPassphrase } : {}),
          ...(userPassphrase.length > 0 ? { passphraseRequired: true } : {}),
          entropy: {
            source: 'imported-mnemonic',
            frames: 0,
            estimatedMinEntropyBits: 0,
            transcriptDigest: '',
          },
          createdAt: Date.now(),
          words: normalized.split(' ').length,
        },
        password,
        label && label.trim().length > 0 ? label.trim() : '导入的钱包',
      );
      setPassphrase(userPassphrase);
      setEntropy(null);
    },
    [persist],
  );

  const unlock = useCallback<SessionValue['unlock']>(
    (password, providedPassphrase) => {
      const blob = vault ?? loadVault();
      if (!blob) throw new Error('这台设备上还没有钱包');
      const opened = openVault(blob, password);
      vaultKeyRef.current = opened.key;
      setVault(blob);
      setVaultData(opened.data);
      const active =
        opened.data.wallets.find((entry) => entry.id === opened.data.activeWalletId) ??
        opened.data.wallets[0];
      // A stored passphrase is used automatically; otherwise the user supplies it.
      setPassphrase(active?.passphrase ?? providedPassphrase ?? '');
    },
    [vault],
  );

  const rekey = useCallback<SessionValue['rekey']>((next) => setPassphrase(next), []);

  const selectWallet = useCallback(
    (id: string) => {
      if (!vaultData) return;
      const target = vaultData.wallets.find((entry) => entry.id === id);
      if (!target) return;
      persistData({ ...vaultData, activeWalletId: id });
      setPassphrase(target.passphrase ?? '');
    },
    [vaultData, persistData],
  );

  const addWallet = useCallback<SessionValue['addWallet']>(
    ({ mnemonic, passphrase: userPassphrase, label, provenance }) => {
      if (!vaultData) throw new Error('设备未解锁');
      const normalized = normalizeMnemonic(mnemonic);
      if (!validateMnemonic(normalized)) {
        throw new Error('助记词校验失败，请检查单词拼写与顺序');
      }
      // Derive now so a bad passphrase surfaces while the user is still looking at the
      // fingerprint, rather than at the first signing attempt.
      mnemonicToSeed(normalized, userPassphrase);
      const wallet: VaultWallet = {
        id: toHex(randomBytes(16), true),
        label: label && label.trim().length > 0 ? label.trim() : `钱包 ${vaultData.wallets.length + 1}`,
        mnemonic: normalized,
        ...(userPassphrase.length > 0 ? { passphrase: userPassphrase } : {}),
        ...(userPassphrase.length > 0 ? { passphraseRequired: true } : {}),
        provenance: provenance ?? {
          source: 'imported-mnemonic',
          frames: 0,
          estimatedMinEntropyBits: 0,
          transcriptDigest: '',
        },
        createdAt: Date.now(),
        words: normalized.split(' ').length,
      };
      persistData({
        ...vaultData,
        wallets: [...vaultData.wallets, wallet],
        activeWalletId: wallet.id,
      });
      setPassphrase(userPassphrase);
      const nextSettings = { ...settings, storePassphrase: userPassphrase.length > 0 };
      saveSettings(nextSettings);
      setSettings(nextSettings);
    },
    [vaultData, persistData, settings],
  );

  const deleteWallet = useCallback<SessionValue['deleteWallet']>(
    (id) => {
      if (!vaultData) throw new Error('设备未解锁');
      const remaining = vaultData.wallets.filter((entry) => entry.id !== id);
      // Refusing to empty the vault keeps the app from reaching a state with no
      // wallet, where every action would fail with a confusing error.
      if (remaining.length === 0) {
        throw new Error('至少需要保留一个钱包。要清空设备请使用「清除数据」。');
      }
      const activeWalletId =
        vaultData.activeWalletId === id ? remaining[0]!.id : vaultData.activeWalletId;
      persistData({ ...vaultData, wallets: remaining, activeWalletId });
      const active = remaining.find((entry) => entry.id === activeWalletId);
      setPassphrase(active?.passphrase ?? '');
    },
    [vaultData, persistData],
  );

  const renameWallet = useCallback<SessionValue['renameWallet']>(
    (id, label) => {
      if (!vaultData) return;
      persistData({
        ...vaultData,
        wallets: vaultData.wallets.map((entry) =>
          entry.id === id ? { ...entry, label: label.trim() || entry.label } : entry,
        ),
      });
    },
    [vaultData, persistData],
  );

  const updateSettings = useCallback<SessionValue['updateSettings']>(
    (patch) => {
      const next = { ...settings, ...patch };
      saveSettings(next);
      setSettings(next);
    },
    [settings],
  );

  const lock = useCallback(() => {
    // Zero the key we were holding: locking must actually remove the ability to
    // decrypt, not merely hide the UI.
    vaultKeyRef.current?.fill(0);
    vaultKeyRef.current = null;
    setVaultData(null);
    setPassphrase('');
  }, []);

  const wipe = useCallback(() => {
    clearVault();
    vaultKeyRef.current?.fill(0);
    vaultKeyRef.current = null;
    setVault(null);
    setVaultData(null);
    setPassphrase('');
    setEntropy(null);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      hasVault: vault !== null || hasVault(),
      unlocked: secret !== null,
      wallet,
      settings,
      passphrase,
      passphraseRequired: secret?.passphraseRequired === true,
      wallets: vaultData?.wallets ?? [],
      activeWallet,
      selectWallet,
      addWallet,
      deleteWallet,
      renameWallet,
      mnemonic: activeWallet?.mnemonic ?? null,
      deviceInfo: deviceDescriptor(settings),
      entropy,
      createWallet,
      importWallet,
      unlock,
      rekey,
      updateSettings,
      lock,
      wipe,
    }),
    [
      vault,
      vaultData,
      activeWallet,
      secret,
      wallet,
      settings,
      passphrase,
      entropy,
      createWallet,
      importWallet,
      unlock,
      rekey,
      selectWallet,
      addWallet,
      deleteWallet,
      renameWallet,
      updateSettings,
      lock,
      wipe,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
