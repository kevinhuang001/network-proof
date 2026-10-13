import type { EntropyResult, SignRequestMessage, SignResponseMessage } from '@netproof/core';

/** Explicit offline screen graph; transitions remain in the router. */
export type Route =
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

