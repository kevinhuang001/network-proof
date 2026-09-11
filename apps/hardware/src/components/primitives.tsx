import type { ChangeEvent, ReactNode } from 'react';
import { useEffect, useState } from 'react';

/** Small presentational primitives shared by every screen. */

export function Header({
  title,
  onBack,
  action,
  subtitle,
}: {
  title: string;
  onBack?: () => void;
  action?: ReactNode;
  subtitle?: string;
}): ReactNode {
  return (
    <header className="np-header">
      <div className="np-header__side">
        {onBack ? (
          <button type="button" className="np-icon-btn np-icon-btn--plain" onClick={onBack} aria-label="返回">
            ‹
          </button>
        ) : null}
      </div>
      <div className="np-grow np-center">
        <h1 className="np-header__title">{title}</h1>
        {subtitle ? <div className="np-label" style={{ marginTop: 2 }}>{subtitle}</div> : null}
      </div>
      <div className="np-header__side np-header__side--end">{action}</div>
    </header>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'up' | 'down' | 'warn' | 'accent' | 'inverse';
}): ReactNode {
  return <span className={`np-badge${tone === 'neutral' ? '' : ` np-badge--${tone}`}`}>{children}</span>;
}

export function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warn' | 'danger' | 'up';
  title?: string;
  children?: ReactNode;
}): ReactNode {
  const icon = tone === 'danger' ? '⚠' : tone === 'warn' ? '!' : tone === 'up' ? '✓' : 'ℹ';
  return (
    <div className={`np-alert np-alert--${tone}`}>
      <span className="np-alert__icon" aria-hidden>
        {icon}
      </span>
      <div className="np-grow">
        {title ? <div style={{ fontWeight: 700, marginBottom: children ? 2 : 0 }}>{title}</div> : null}
        {children}
      </div>
    </div>
  );
}

export function KeyValue({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  tone?: 'up' | 'down' | 'warn';
}): ReactNode {
  return (
    <div className="np-keyvalue">
      <span className="np-keyvalue__key">{label}</span>
      <span
        className={`np-keyvalue__value${mono ? ' np-mono' : ''}${tone ? ` np-${tone}` : ''}`}
      >
        {value}
      </span>
    </div>
  );
}

export function ProgressBar({ value, tone = 'neutral' }: { value: number; tone?: 'neutral' | 'up' }): ReactNode {
  const percent = Math.max(0, Math.min(100, value * 100));
  return (
    <div className={`np-progress${tone === 'up' ? ' np-progress--up' : ''}`} role="progressbar" aria-valuenow={Math.round(percent)}>
      <div className="np-progress__bar" style={{ width: `${percent}%` }} />
    </div>
  );
}

export function Spinner(): ReactNode {
  return <div className="np-spinner" role="status" aria-label="处理中" />;
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  type = 'button',
  block,
  size,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'danger-soft' | 'up' | 'ghost';
  disabled?: boolean;
  type?: 'button' | 'submit';
  block?: boolean;
  size?: 'small';
}): ReactNode {
  return (
    <button
      type={type}
      className={`np-btn np-btn--${variant}${block ? ' np-btn--block' : ''}${size === 'small' ? ' np-btn--small' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function Toast({ message }: { message: string | null }): ReactNode {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!message) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 2600);
    return () => window.clearTimeout(timer);
  }, [message]);
  if (!message || !visible) return null;
  return (
    <div className="np-toast" role="status">
      {message}
    </div>
  );
}

/** Copy-to-clipboard with a transient confirmation. */
export function CopyButton({ value, label = '复制' }: { value: string; label?: string }): ReactNode {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="np-chip"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? '已复制' : label}
    </button>
  );
}

export function PasswordField({
  value,
  onChange,
  placeholder,
  autoFocus,
  onEnter,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
}): ReactNode {
  const [reveal, setReveal] = useState(false);
  return (
    <div className="np-row">
      <input
        className="np-input np-grow"
        type={reveal ? 'text' : 'password'}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onEnter?.();
        }}
      />
      <button
        type="button"
        className="np-icon-btn"
        onClick={() => setReveal((previous) => !previous)}
        aria-label={reveal ? '隐藏' : '显示'}
      >
        {reveal ? '🙈' : '👁'}
      </button>
    </div>
  );
}

/** Strength meter for the vault password. Honest, not flattering. */
export function PasswordMeter({ score, suggestions }: { score: number; suggestions: string[] }): ReactNode {
  const labels = ['很弱', '弱', '一般', '强', '很强'];
  const tone = score >= 3 ? 'up' : score >= 2 ? 'neutral' : 'down';
  return (
    <div className="np-stack" style={{ gap: 8 }}>
      <div className="np-row np-row--between">
        <span className="np-label">密码强度</span>
        <span className={`np-badge np-badge--${tone === 'neutral' ? 'accent' : tone}`}>{labels[score] ?? '很弱'}</span>
      </div>
      <ProgressBar value={(score + 1) / 5} tone={score >= 3 ? 'up' : 'neutral'} />
      {suggestions.length > 0 ? (
        <ul className="np-body np-body--tight" style={{ margin: 0, paddingLeft: 18 }}>
          {suggestions.map((suggestion) => (
            <li key={suggestion}>{suggestion}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** A short haptic tick, when the platform provides one. */
export function haptic(pattern: number | number[] = 12): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Vibration is a nicety; never let it break a flow.
  }
}
