/**
 * Message channel names for the page <-> content-script bridge.
 *
 * Kept in a module (rather than as literals in both content scripts) for two
 * reasons: one typo in a channel name would silently break the provider, and both
 * scripts need to be *modules* so TypeScript does not treat their top-level
 * declarations as globals shared with each other.
 */
export const CHANNEL_REQUEST = 'netproof:request';
export const CHANNEL_RESPONSE = 'netproof:response';
export const CHANNEL_EVENT = 'netproof:event';
export const CHANNEL_INFO = 'netproof:provider-info';

/** EIP-6963 provider identity, advertised to dApps. */
export const PROVIDER_INFO = {
  uuid: 'a1f2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  name: 'NetProof Companion',
  rdns: 'io.netproof.companion',
} as const;

export const PROVIDER_ICON =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjggMTI4Ij48cmVjdCB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgcng9IjI4IiBmaWxsPSIjMEIwQjBGIi8+PHBhdGggZD0iTTM0IDg4VjQwaDEybDE4IDI4VjQwaDEydjQ4SDY0TDQ2IDYwdjI4SDM0eiIgZmlsbD0iI2ZmZiIvPjwvc3ZnPg==';
