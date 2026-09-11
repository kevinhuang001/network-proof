import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import type { EntropyResult, SignRequestMessage, SignResponseMessage } from '@netproof/core';
import { SessionProvider, useSession } from './state/session';
import { CaptureScreen } from './screens/Capture';
import { entropyToMnemonic } from '@netproof/core';
import {
  BackupScreen,
  PassphraseScreen,
  UnlockScreen,
  VaultPasswordScreen,
  WelcomeScreen,
} from './screens/Onboarding';
import {
  DeviceHomeScreen,
  LoginQrScreen,
  WalletHomeScreen,
  WalletsScreen,
} from './screens/DeviceHome';
import { ReviewScreen, ScanRequestScreen, SignatureScreen } from './screens/Sign';
import { DiagnosticsScreen } from './screens/Diagnostics';
import { ImportWalletScreen } from './screens/ImportWallet';
import { NameWalletScreen } from './screens/NameWallet';
import { Alert, Button, Header } from './components/primitives';

/**
 * Screen router.
 *
 * The prototype uses an explicit discriminated union rather than a URL router:
 * there are no deep links on an air-gapped device, and keeping the whole flow in
 * one file makes the state transitions (and their security implications) visible
 * at a glance.
 */
type Route =
  | { name: 'welcome' }
  | { name: 'capture' }
  | { name: 'backup'; entropy: EntropyResult }
  | { name: 'passphrase'; entropy: EntropyResult }
  | { name: 'password'; entropy: EntropyResult; passphrase: string }
  | { name: 'import' }
  | { name: 'unlock' }
  | { name: 'device' }
  | { name: 'login-qr' }
  | { name: 'wallets' }
  | { name: 'wallet'; id: string }
  | { name: 'add-capture' }
  | { name: 'add-backup'; entropy: EntropyResult }
  | { name: 'add-passphrase'; entropy: EntropyResult }
  | { name: 'add-name'; entropy: EntropyResult; passphrase: string }
  | { name: 'add-import' }
  | { name: 'scan' }
  | { name: 'review'; request: SignRequestMessage }
  | { name: 'signature'; response: SignResponseMessage }
  | { name: 'diagnostics' };

export function App(): ReactNode {
  return (
    <SessionProvider>
      {/*
        One wrapper for every screen.
        Previously each screen decided for itself, and all but the welcome and unlock
        screens forgot — so on a desktop browser the device stretched to the full
        window width. The constraint belongs in one place, not in fourteen.
      */}
      <div className="np-app">
        <Router />
      </div>
    </SessionProvider>
  );
}

function Router(): ReactNode {
  const session = useSession();
  const [route, setRoute] = useState<Route>({ name: 'welcome' });
  const [error, setError] = useState<string | null>(null);

  const go = useCallback((next: Route) => {
    setError(null);
    setRoute(next);
  }, []);

  const createFromEntropy = (entropy: EntropyResult): void => {
    go({ name: 'backup', entropy });
  };

  switch (route.name) {
    case 'welcome':
      return (
        <WelcomeScreen
          hasVault={session.hasVault}
          onCreate={() => go({ name: 'capture' })}
          onImport={() => go({ name: 'import' })}
          onUnlock={() => go({ name: 'unlock' })}
          onDiagnostics={() => go({ name: 'diagnostics' })}
        />
      );

    case 'capture':
      return (
        <CaptureScreen
          requiredBits={256}
          onCancel={() => go({ name: 'welcome' })}
          onComplete={createFromEntropy}
        />
      );

    case 'backup':
      return (
        <BackupScreen
          entropy={route.entropy}
          onBack={() => go({ name: 'welcome' })}
          onNext={() => go({ name: 'passphrase', entropy: route.entropy })}
        />
      );

    case 'passphrase':
      return (
        <PassphraseScreen
          onBack={() => go({ name: 'backup', entropy: route.entropy })}
          onNext={(passphrase) => go({ name: 'password', entropy: route.entropy, passphrase })}
        />
      );

    case 'password':
      return (
        <VaultPasswordScreen
          passphraseEnabled={route.passphrase.length > 0}
          onBack={() => go({ name: 'passphrase', entropy: route.entropy })}
          onNext={(password, label) => {
            try {
              session.createWallet({
                entropy: route.entropy,
                passphrase: route.passphrase,
                password,
                label,
              });
              go({ name: 'device' });
            } catch (caught) {
              setError((caught as Error).message);
            }
          }}
        />
      );

    case 'import':
      return (
        <ImportWalletScreen
          onBack={() => go({ name: 'welcome' })}
          onDone={() => go({ name: 'device' })}
        />
      );

    case 'unlock':
      return (
        <UnlockScreen
          onBack={() => go({ name: 'welcome' })}
          onUnlocked={() => go({ name: 'device' })}
        />
      );

    case 'device':
      if (!session.unlocked) {
        return <LockedNotice onUnlock={() => go({ name: 'unlock' })} onHome={() => go({ name: 'welcome' })} />;
      }
      return (
        <DeviceHomeScreen
          onOpenWallet={(id) => go({ name: 'wallet', id })}
          onManage={() => go({ name: 'wallets' })}
          onSettings={() => go({ name: 'diagnostics' })}
          onLock={() => {
            session.lock();
            go({ name: 'welcome' });
          }}
        />
      );

    case 'wallet':
      if (!session.unlocked) {
        return <LockedNotice onUnlock={() => go({ name: 'unlock' })} onHome={() => go({ name: 'welcome' })} />;
      }
      return (
        <WalletHomeScreen
          walletId={route.id}
          onBack={() => go({ name: 'device' })}
          onLogin={() => go({ name: 'login-qr' })}
          onSign={() => go({ name: 'scan' })}
          onSettings={() => go({ name: 'diagnostics' })}
          onLock={() => {
            session.lock();
            go({ name: 'welcome' });
          }}
        />
      );

    case 'wallets':
      return (
        <WalletsScreen
          onBack={() => go({ name: 'device' })}
          onCreate={() => go({ name: 'add-capture' })}
          onImport={() => go({ name: 'add-import' })}
        />
      );

    // Adding a wallet reuses the create/import screens but stops before the password
    // step: the vault is already unlocked and its key is in memory, so asking for the
    // device password again would be pure friction.
    case 'add-capture':
      return (
        <CaptureScreen
          requiredBits={256}
          onCancel={() => go({ name: 'wallets' })}
          onComplete={(entropy) => go({ name: 'add-backup', entropy })}
        />
      );

    case 'add-backup':
      return (
        <BackupScreen
          entropy={route.entropy}
          onBack={() => go({ name: 'wallets' })}
          onNext={() => go({ name: 'add-passphrase', entropy: route.entropy })}
        />
      );

    case 'add-passphrase':
      return (
        <PassphraseScreen
          onBack={() => go({ name: 'add-backup', entropy: route.entropy })}
          onNext={(passphrase) => go({ name: 'add-name', entropy: route.entropy, passphrase })}
        />
      );

    case 'add-name':
      return (
        <NameWalletScreen
          title="命名并保存"
          subtitle="第 4 / 4 步"
          actionLabel="保存"
          defaultName={`钱包 ${session.wallets.length + 1}`}
          onBack={() => go({ name: 'add-passphrase', entropy: route.entropy })}
          onConfirm={(label) => {
            try {
              session.addWallet({
                mnemonic: entropyToMnemonic(route.entropy.bytes),
                passphrase: route.passphrase,
                label,
                provenance: {
                  source: route.entropy.sources
                    .filter((source) => source.estimatedMinEntropyBits > 0)
                    .map((source) => source.name)
                    .join('+'),
                  frames: route.entropy.stats.frames,
                  estimatedMinEntropyBits: route.entropy.estimatedMinEntropyBits,
                  transcriptDigest: route.entropy.transcriptDigest,
                },
              });
              go({ name: 'device' });
            } catch (caught) {
              setError((caught as Error).message);
            }
          }}
        />
      );

    case 'add-import':
      return (
        <ImportWalletScreen
          onBack={() => go({ name: 'wallets' })}
          onDone={() => go({ name: 'device' })}
          addToExisting
        />
      );

    case 'login-qr':
      if (!session.unlocked) {
        return <LockedNotice onUnlock={() => go({ name: 'unlock' })} onHome={() => go({ name: 'welcome' })} />;
      }
      return <LoginQrScreen onBack={() => go({ name: 'device' })} />;

    case 'scan':
      return (
        <ScanRequestScreen
          onBack={() => go({ name: 'device' })}
          onDecoded={(request) => go({ name: 'review', request })}
        />
      );

    case 'review':
      return (
        <ReviewScreen
          request={route.request}
          onBack={() => go({ name: 'device' })}
          onSigned={(response) => go({ name: 'signature', response })}
        />
      );

    case 'signature':
      return <SignatureScreen response={route.response} onDone={() => go({ name: 'device' })} />;

    case 'diagnostics':
      return (
        <DiagnosticsScreen
          onBack={() => go(session.unlocked ? { name: 'device' } : { name: 'welcome' })}
          onWipe={() => go({ name: 'welcome' })}
        />
      );

    default:
      return (
        <>
          <Header title="出错了" />
          <div className="np-main">
            <Alert tone="danger">{error ?? '未知状态'}</Alert>
            <Button block onClick={() => go({ name: 'welcome' })}>
              回到首页
            </Button>
          </div>
        </>
      );
  }
}

function LockedNotice({ onUnlock, onHome }: { onUnlock: () => void; onHome: () => void }): ReactNode {
  return (
    <>
      <Header title="设备已锁定" onBack={onHome} />
      <div className="np-main">
        <Alert tone="warn" title="需要先解锁">
          登录和签名都要用到助记词。锁定会立即清除它。
        </Alert>
      </div>
      <div className="np-footer">
        <Button block onClick={onUnlock}>
          去解锁
        </Button>
      </div>
    </>
  );
}

/** Surfaces the error banner that `Router` sets for vault failures. */
export function RouteError({ message }: { message: string | null }): ReactNode {
  if (!message) return null;
  return <Alert tone="danger">{message}</Alert>;
}
