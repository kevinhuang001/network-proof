import type { CompanionSettings } from '@netproof/companion';

/**
 * Settings that live on a wallet rather than on the app. Kept in one place so the split is
 * visible: `updateSettings` routes these keys to the active wallet and everything else to
 * the global record, which lets every existing screen keep calling `updateSettings`.
 */
const WALLET_SCOPED = ['accountIndex', 'addressIndex', 'visibleAccounts', 'hiddenAccounts'] as const;

export function splitSettings(patch: Partial<CompanionSettings>): {
  scoped: Partial<CompanionSettings>;
  global: Partial<CompanionSettings>;
} {
  const scoped: Record<string, unknown> = {};
  const global: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if ((WALLET_SCOPED as readonly string[]).includes(key)) scoped[key] = value;
    else global[key] = value;
  }
  return { scoped: scoped as Partial<CompanionSettings>, global: global as Partial<CompanionSettings> };
}

