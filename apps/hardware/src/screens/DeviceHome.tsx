import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import {
  buildXpubMessage,
  deriveSolanaKeypair,
  framesForMessage,
  mnemonicToSeed,
  solanaAccountPaths,
} from '@netproof/core';
import { NETWORKS } from '@netproof/ui/networks';
import { ROBUST_FALLBACK_MS } from '../lib/qrPresets';
import { useRobustQrFallback } from '../lib/useRobustQrFallback';
import { Alert, Button, Header, haptic } from '../components/primitives';
import { DeviceMenu } from '../components/DeviceMenu';
import { heroColors } from '../components/heroColor';
import { TextField } from '@netproof/ui/text-field';
import { QrDisplay } from '../components/QrDisplay';
import {
  ChainLogo,
  CheckIcon,
  ChevronRightIcon,
  EyeIcon,
  KeyIcon,
  PlusIcon,
  ShieldIcon,
  TrashIcon,
  WalletIcon,
} from '../components/icons';
import { useSession } from '../state/session';

/**
 * Device screens after unlock.
 *
 * Two jobs, two buttons. Everything else here exists only so those two jobs can be
 * pointed at the right wallet and the right network.
 */

export function DeviceHomeScreen({
  onOpenWallet,
  onManage,
  onSettings,
  onLock,
}: {
  /** Enter the wallet whose hero card was tapped. */
  onOpenWallet: (id: string) => void;
  onManage: () => void;
  onSettings: () => void;
  onLock: () => void;
}): ReactNode {
  const { wallets, selectWallet } = useSession();
  // Colours are assigned from the whole set at once: "different" is a property of the set,
  // and hashing each wallet on its own is how two cards end up identical.
  const colors = useMemo(() => heroColors(wallets.map((entry) => entry.id)), [wallets]);

  return (
    <>
      <Header title="NetProof Air" action={<DeviceMenu onSettings={onSettings} onLock={onLock} />} />
      <div className="np-main">
        {wallets.map((entry, index) => (
          <button
            key={entry.id}
            type="button"
            className="np-card np-card--hero"
            style={{
              ...CARD_BUTTON,
              border: 0,
              background: colors[entry.id]?.background,
              boxShadow: colors[entry.id]?.shadow,
              // The card's ink travels with its colour; see `heroColor.ts`.
              ['--np-hero-ink' as string]: colors[entry.id]?.ink,
              ['--np-hero-ink-soft' as string]: colors[entry.id]?.inkSoft,
            }}
            onClick={() => {
              haptic(12);
              selectWallet(entry.id);
              onOpenWallet(entry.id);
            }}
          >
            <div className="np-row np-row--between">
              <span className="np-label">钱包 {index + 1}</span>
              <ShieldIcon size={16} />
            </div>
            <div className="np-hero-amount" style={{ marginTop: 8, fontSize: 24 }}>
              {entry.label}
            </div>
            {/*
              Just the wallet. The card used to add "24 词 · 摄像头熵" (or 导入) underneath —
              how the wallet was created is a fact about the past, and the hero is there to
              be recognised and tapped. The word count stays: it is what the user wrote on
              paper, and a mismatch is worth seeing without opening anything.
            */}
            <div className="np-row" style={{ marginTop: 10, gap: 12 }}>
              <span className="np-body np-body--tight">{entry.words} 词</span>
            </div>
          </button>
        ))}

        <Button variant="secondary" block onClick={onManage}>
          管理钱包
        </Button>
      </div>
    </>
  );
}

/** Inside one wallet: its two jobs. */
export function WalletHomeScreen({
  walletId,
  onLogin,
  onSign,
  onBack,
  onSettings,
  onLock,
}: {
  walletId: string;
  onLogin: () => void;
  onSign: () => void;
  onBack: () => void;
  onSettings: () => void;
  onLock: () => void;
}): ReactNode {
  const { wallets, passphrase, passphraseRequired } = useSession();
  const entry = wallets.find((candidate) => candidate.id === walletId);

  return (
    <>
      <Header
        title={entry?.label ?? '钱包'}
        subtitle="两个操作"
        onBack={onBack}
        action={<DeviceMenu onSettings={onSettings} onLock={onLock} />}
      />
      <div className="np-main">
        {passphraseRequired && passphrase.length === 0 ? (
          <Alert tone="warn">未载入 passphrase——将使用不带 passphrase 的账户。</Alert>
        ) : null}

        <BigAction
          icon={<EyeIcon size={26} />}
          title="登录插件钱包"
          hint="显示二维码，让电脑扫描"
          onClick={onLogin}
        />
        <BigAction
          icon={<KeyIcon size={26} />}
          title="扫描并签名"
          hint="扫请求 → 本机确认 → 显示签名"
          onClick={onSign}
        />
      </div>
    </>
  );
}

const CARD_BUTTON = {
  display: 'block' as const,
  width: '100%',
  textAlign: 'left' as const,
  font: 'inherit',
  color: 'inherit',
  cursor: 'pointer',
};

function BigAction({
  icon,
  title,
  hint,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      className="np-card np-card--raised"
      style={CARD_BUTTON}
      onClick={() => {
        haptic(12);
        onClick();
      }}
    >
      <div className="np-row">
        <span
          style={{
            width: 44,
            height: 44,
            minWidth: 44,
            borderRadius: 14,
            background: 'var(--np-ink)',
            color: '#fff',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          {icon}
        </span>
        <div className="np-grow">
          <div className="np-title" style={{ fontSize: 18 }}>
            {title}
          </div>
          <div className="np-body np-body--tight">{hint}</div>
        </div>
        <ChevronRightIcon size={20} />
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Wallets
// ---------------------------------------------------------------------------

export function WalletsScreen({
  onCreate,
  onImport,
  onBack,
}: {
  onCreate: () => void;
  onImport: () => void;
  onBack: () => void;
}): ReactNode {
  const { wallets, activeWallet, selectWallet, deleteWallet, renameWallet } = useSession();
  // Same colours as the hero cards, so a wallet is recognisable in both places.
  const colors = useMemo(() => heroColors(wallets.map((entry) => entry.id)), [wallets]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Header title="钱包" onBack={onBack} />
      <div className="np-main">
        <div className="np-list">
          {wallets.map((entry) => {
            const active = entry.id === activeWallet?.id;
            return (
              <div className="np-list__item" key={entry.id}>
                <button
                  type="button"
                  className="np-icon-btn"
                  style={{
                    background: colors[entry.id]?.background ?? 'var(--np-bg-sunken)',
                    color: colors[entry.id]?.ink ?? 'var(--np-ink)',
                    border: 0,
                    boxShadow: active ? 'inset 0 0 0 2px var(--np-ink)' : 'none',
                  }}
                  onClick={() => selectWallet(entry.id)}
                  aria-label={active ? '当前钱包' : '切换到该钱包'}
                >
                  {active ? <CheckIcon size={16} /> : <WalletIcon size={16} />}
                </button>
                <div className="np-grow" style={{ minWidth: 0 }}>
                  {renaming === entry.id ? (
                    <TextField
                      className="np-input"
                      style={{ padding: '6px 10px', fontSize: 14 }}
                      value={draft}
                      autoFocus
                      onChange={setDraft}
                      onBlur={() => {
                        renameWallet(entry.id, draft);
                        setRenaming(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      style={{
                        background: 'none',
                        border: 0,
                        padding: 0,
                        textAlign: 'left',
                        font: 'inherit',
                        color: 'inherit',
                        cursor: 'pointer',
                      }}
                      onClick={() => {
                        setRenaming(entry.id);
                        setDraft(entry.label);
                      }}
                    >
                      <div className="np-subtitle">{entry.label}</div>
                    </button>
                  )}
                  <div className="np-body np-body--tight">{entry.words} 词</div>
                </div>
                <button
                  type="button"
                  className="np-icon-btn np-icon-btn--plain"
                  onClick={() => setConfirming(entry.id)}
                  aria-label="删除钱包"
                >
                  <TrashIcon size={18} />
                </button>
              </div>
            );
          })}
        </div>

        <div className="np-grid-2">
          <Button onClick={onCreate}>
            <PlusIcon size={18} /> 新建钱包
          </Button>
          <Button variant="secondary" onClick={onImport}>
            导入钱包
          </Button>
        </div>

        {error ? <Alert tone="danger">{error}</Alert> : null}

        {confirming ? (
          <div className="np-mask" onClick={() => setConfirming(null)}>
            <div className="np-sheet np-sheet--compact" onClick={(event) => event.stopPropagation()}>
              <div className="np-title">
                删除「{wallets.find((entry) => entry.id === confirming)?.label}」？
              </div>
              <div className="np-body np-body--tight">
                <span className="np-ink">没有备份的助记词删掉就永久失去了。</span>
              </div>
              <Button
                variant="danger"
                block
                onClick={() => {
                  try {
                    deleteWallet(confirming);
                    setError(null);
                  } catch (caught) {
                    setError((caught as Error).message);
                  }
                  setConfirming(null);
                }}
              >
                删除
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(null)}>
                取消
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Login (action 1)
// ---------------------------------------------------------------------------

/**
 * One export, every network.
 *
 * The device does not ask which chain to log into, because it does not need to know:
 * EVM account xpubs are identical on Ethereum, BNB Chain, Polygon, Arbitrum, Base and
 * every other EVM chain (they all share coin type 60), and the Solana addresses ride
 * along in the same payload. The *companion* decides which network to display, so
 * choosing here would only be a second place to get it wrong.
 */
/**
 * Networks this export covers, shown with their marks.
 *
 * One export serves all of them: EVM account xpubs are identical across every EVM
 * chain, and the Solana addresses travel in the same payload. The device does not pick
 * — the companion does — so this is a statement of what is included, not a choice.
 */
/**
 * What one export covers.
 *
 * The device does not choose a network — the companion does, and one exported account
 * public key serves every EVM chain at once (coin type 60). Solana is the exception and
 * is listed separately: the addresses are derived here, because the companion cannot get
 * them from an EVM public key.
 */
const SUPPORTED_NETWORKS = NETWORKS;

export function LoginQrScreen({ onBack }: { onBack: () => void }): ReactNode {
  const { wallet, deviceInfo, settings, activeWallet, mnemonic, passphrase } = useSession();
  // If this code has been on screen this long, the other camera is not getting it.
  const scanSpeed = useRobustQrFallback(true, ROBUST_FALLBACK_MS.login, {
    fragmentLength: settings.qrFragmentLength,
    frameDurationMs: settings.qrFrameDurationMs,
  });

  const frames = useMemo(() => {
    if (!wallet) return [];
    const message = buildXpubMessage(
      {
        masterFingerprint: wallet.masterFingerprint,
        passphraseProtected: wallet.passphraseProtected,
        rootXpub: wallet.rootXpub,
        coinType: wallet.coinType,
        accounts: wallet.accounts,
        schemes: wallet.schemes,
        // Solana has no watchable account key, so the addresses themselves travel.
        addresses:
          mnemonic === null
            ? []
            : solanaAccountPaths(settings.solanaAddressCount).map((path) => ({
                path,
                address: deriveSolanaKeypair(mnemonicToSeed(mnemonic, passphrase), path).address,
              })),
      },
      deviceInfo,
    );
    return framesForMessage('NP-XPUB', message, scanSpeed.preset.fragmentLength).frames;
  }, [
    wallet,
    deviceInfo,
    scanSpeed.preset.fragmentLength,
    settings.solanaAddressCount,
    mnemonic,
    passphrase,
  ]);

  if (!wallet) return null;

  return (
    <>
      <Header title="登录插件钱包" subtitle={activeWallet?.label} onBack={onBack} />
      <div className="np-main">
        <QrDisplay
          frames={frames}
          frameDurationMs={scanSpeed.preset.frameDurationMs}
          caption={scanSpeed.downgraded ? '已切到稳健速度 · 用电脑上的插件钱包扫描' : '用电脑上的插件钱包扫描'}
        />

        <div className="np-card np-card--sunken">
          <div className="np-label">支持的网络</div>
          <div className="np-grid-3" style={{ marginTop: 10 }}>
            {SUPPORTED_NETWORKS.map((network) => (
              <div
                key={network.label}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <ChainLogo chainId={network.chainId} size={30} />
                <span style={{ fontSize: 11, opacity: 0.75 }}>{network.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
