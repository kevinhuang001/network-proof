import type { ReactNode } from 'react';
import { useState } from 'react';
import { Alert, Button, PasswordField, Spinner } from '../ui/kit';
import { BrandMark } from '../ui/brand';
import { createPasscodeRecord, type PasscodeRecord } from '../lib/lock';

/**
 * The lock screen.
 *
 * Two shapes, and the difference is stated rather than hidden behind a padlock icon:
 *
 *  - With a passcode: entering it unlocks. The passcode is verified by an Argon2id
 *    derivation, and it is never stored.
 *  - Without one: there is nothing to verify, so unlocking is one tap — and the screen says
 *    plainly that the lock only hides the view. Pretending otherwise would be the kind of
 *    false assurance that gets a wallet left open on a shared machine.
 */
export function LockScreen({
  hasPasscode,
  onUnlock,
  setPasscode,
}: {
  hasPasscode: boolean;
  /** Verify a passcode; returns whether it was right. */
  onUnlock: (passcode: string) => boolean;
  /** Store a passcode chosen from the locked state, for a wallet that had none. */
  setPasscode: (record: PasscodeRecord) => void;
}): ReactNode {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const submitPasscode = (): void => {
    setBusy(true);
    // Let the spinner paint before the KDF blocks the main thread.
    setTimeout(() => {
      const ok = onUnlock(value);
      if (!ok) {
        setError('密码不正确');
        setValue('');
      }
      setBusy(false);
    }, 16);
  };

  const setFirst = (): void => {
    if (value !== confirm) {
      setError('两次输入不一致');
      return;
    }
    if (value.length < 6) {
      setError('至少 6 位');
      return;
    }
    setBusy(true);
    setTimeout(() => {
      setPasscode(createPasscodeRecord(value));
      onUnlock(value);
      setBusy(false);
    }, 16);
  };

  return (
    <div className="np-fullscreen">
      <div className="np-fullscreen__body">
        <span className="np-brand-mark">
          <BrandMark size={40} />
        </span>
        <h1 className="np-headline">已锁定</h1>

        {hasPasscode ? (
          <>
            <PasswordField
              value={value}
              onChange={(next) => {
                setValue(next);
                setError(null);
              }}
              autoFocus
              placeholder="输入密码"
              onEnter={submitPasscode}
            />
            {error ? <Alert tone="danger">{error}</Alert> : null}
          </>
        ) : (
          <>
            <p className="np-body np-body--tight" style={{ maxWidth: 280 }}>
              还没有设密码。现在解锁只需点一下——锁定只是把界面遮住，任何人都能打开。
            </p>
            <div className="np-stack" style={{ width: '100%' }}>
              <PasswordField
                value={value}
                onChange={setValue}
                placeholder="设一个密码（至少 6 位）"
              />
              <PasswordField value={confirm} onChange={setConfirm} placeholder="再输一次" />
              {error ? <Alert tone="danger">{error}</Alert> : null}
            </div>
          </>
        )}
      </div>

      <div className="np-fullscreen__actions">
        {hasPasscode ? (
          <Button block disabled={busy || value.length === 0} onClick={submitPasscode}>
            {busy ? <Spinner /> : '解锁'}
          </Button>
        ) : (
          <>
            <Button block disabled={busy || value.length < 6} onClick={setFirst}>
              {busy ? <Spinner /> : '设置密码并解锁'}
            </Button>
            <Button variant="ghost" block onClick={() => onUnlock('')}>
              不设密码，直接解锁
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
