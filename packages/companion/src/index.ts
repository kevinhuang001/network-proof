/**
 * @netproof/companion — everything a watch-only companion wallet needs.
 *
 * Framework-free on purpose: the same policy layer backs the Chrome extension and
 * the plain web companion, so a rule like "signing methods become approval
 * requests, never local signatures" cannot be true in one build and false in the
 * other. Storage and rendering are the caller's problem.
 */
export * from './types';
export * from './settings';
export * from './storage';
export * from './tokens';
export * from './fees';
export * from './accounts';
export * from './jsonrpc';
export * from './node';
export * from './rpc';
