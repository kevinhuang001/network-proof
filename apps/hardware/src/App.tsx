import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
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

/**
 * The screen stack, and the system back button.
 *
 * The router is state, not history, which is deliberate — an offline device has no business
 * with a URL — but that left the Android back button with nothing to do: the WebView had no
 * history to walk, so pressing it either did nothing or dropped the user out of the app. A
 * wallet you cannot back out of a screen is a wallet whose back gesture teaches the wrong
 * thing.
 *
 * Three transitions, and the difference between them is the whole design:
 *
 *   - `go` — forward, and remember where from.
 *   - `back` — the same move the on-screen back arrow makes, so the gesture and the button
 *     cannot disagree.
 *   - `finish` — a flow that is over. Going back into a completed wallet creation, or into a
 *     signature that has already been delivered, would be going back into nothing.
 */
function Router(): ReactNode {
  const session = useSession();
  const [stack, setStack] = useState<Route[]>([{ name: 'welcome' }]);
  const [error, setError] = useState<string | null>(null);
  const route = stack[stack.length - 1] ?? { name: 'welcome' };
  // Read by the back listener, which fires outside React's render cycle.
  const depthRef = useRef(stack.length);
  depthRef.current = stack.length;

  const go = useCallback((next: Route) => {
    setError(null);
    setStack((previous) => [...previous, next]);
    // `pushState` gives the WebView — and a browser — something to go back to.
    try {
      window.history.pushState({ screen: next.name }, '');
    } catch {
      // A WebView that refuses history still has the in-app stack.
    }
  }, []);

  /** Up one screen. Used by every on-screen back arrow and by the system gesture. */
  const back = useCallback(() => {
    setError(null);
    setStack((previous) => (previous.length > 1 ? previous.slice(0, -1) : previous));
  }, []);

  /** A finished flow: whatever comes next is a beginning, not a return. */
  const finish = useCallback((next: Route) => {
    setError(null);
    setStack([next]);
    try {
      window.history.replaceState({ screen: next.name }, '');
    } catch {
      // Same as above: cosmetic.
    }
  }, []);

  useEffect(() => {
    const onPop = (): void => {
      setError(null);
      // A pop we did not ask for is the user going back. If there is nothing left to pop, the
      // history entry was ours and the screen stays put.
      setStack((previous) => (previous.length > 1 ? previous.slice(0, -1) : previous));
    };
    window.addEventListener('popstate', onPop);

    /*
     * Capacitor's back event. `canGoBack` is the WebView's opinion of history; the stack is
     * ours. Leaving the app is right only when there is nowhere left to go.
     */
    let listener: { remove: () => void } | undefined;
    void (async () => {
      try {
        const { App } = await import('@capacitor/app');
        listener = await App.addListener('backButton', ({ canGoBack }) => {
          if (depthRef.current > 1 || canGoBack) window.history.back();
          else void App.exitApp();
        });
      } catch {
        // Not in a Capacitor shell; the browser back button is the same event.
      }
    })();

    return () => {
      window.removeEventListener('popstate', onPop);
      listener?.remove();
    };
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
          onCancel={back}
          onComplete={createFromEntropy}
        />
      );

    case 'backup':
      return (
        <BackupScreen
          entropy={route.entropy}
          onBack={back}
          onNext={() => go({ name: 'passphrase', entropy: route.entropy })}
        />
      );

    case 'passphrase':
      return (
        <PassphraseScreen
          onBack={back}
          onNext={(passphrase) => go({ name: 'password', entropy: route.entropy, passphrase })}
        />
      );

    case 'password':
      return (
        <VaultPasswordScreen
          passphraseEnabled={route.passphrase.length > 0}
          onBack={back}
          onNext={(password, label) => {
            try {
              session.createWallet({
                entropy: route.entropy,
                passphrase: route.passphrase,
                password,
                label,
              });
              finish({ name: 'device' });
            } catch (caught) {
              setError((caught as Error).message);
            }
          }}
        />
      );

    case 'import':
      return (
        <ImportWalletScreen
          onBack={back}
          onDone={() => finish({ name: 'device' })}
        />
      );

    case 'unlock':
      return (
        <UnlockScreen
          onBack={back}
          onUnlocked={() => finish({ name: 'device' })}
        />
      );

    case 'device':
      if (!session.unlocked) {
        return <LockedNotice onUnlock={() => finish({ name: 'unlock' })} onHome={back} />;
      }
      return (
        <DeviceHomeScreen
          onOpenWallet={(id) => go({ name: 'wallet', id })}
          onManage={() => go({ name: 'wallets' })}
          onSettings={() => go({ name: 'diagnostics' })}
          onLock={() => {
            session.lock();
            finish({ name: 'welcome' });
          }}
        />
      );

    case 'wallet':
      if (!session.unlocked) {
        return <LockedNotice onUnlock={() => finish({ name: 'unlock' })} onHome={back} />;
      }
      return (
        <WalletHomeScreen
          walletId={route.id}
          onBack={back}
          onLogin={() => go({ name: 'login-qr' })}
          onSign={() => go({ name: 'scan' })}
          onSettings={() => go({ name: 'diagnostics' })}
          onLock={() => {
            session.lock();
            finish({ name: 'welcome' });
          }}
        />
      );

    case 'wallets':
      return (
        <WalletsScreen
          onBack={back}
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
          onCancel={back}
          onComplete={(entropy) => go({ name: 'add-backup', entropy })}
        />
      );

    case 'add-backup':
      return (
        <BackupScreen
          entropy={route.entropy}
          onBack={back}
          onNext={() => go({ name: 'add-passphrase', entropy: route.entropy })}
        />
      );

    case 'add-passphrase':
      return (
        <PassphraseScreen
          onBack={back}
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
          onBack={back}
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
              finish({ name: 'device' });
            } catch (caught) {
              setError((caught as Error).message);
            }
          }}
        />
      );

    case 'add-import':
      return (
        <ImportWalletScreen
          onBack={back}
          onDone={() => finish({ name: 'device' })}
          addToExisting
        />
      );

    case 'login-qr':
      if (!session.unlocked) {
        return <LockedNotice onUnlock={() => finish({ name: 'unlock' })} onHome={back} />;
      }
      return <LoginQrScreen onBack={back} />;

    case 'scan':
      return (
        <ScanRequestScreen
          onBack={back}
          onDecoded={(request) => go({ name: 'review', request })}
        />
      );

    case 'review':
      return (
        <ReviewScreen
          request={route.request}
          onBack={back}
          onSigned={(response) => go({ name: 'signature', response })}
        />
      );

    case 'signature':
      return <SignatureScreen response={route.response} onDone={() => finish({ name: 'device' })} />;

    case 'diagnostics':
      return (
        <DiagnosticsScreen
          onBack={back}
          onWipe={() => finish({ name: 'welcome' })}
        />
      );

    default:
      return (
        <>
          <Header title="出错了" />
          <div className="np-main">
            <Alert tone="danger">{error ?? '未知状态'}</Alert>
            <Button block onClick={() => finish({ name: 'welcome' })}>
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
