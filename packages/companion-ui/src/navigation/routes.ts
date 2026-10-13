/** Typed navigation and URL decoding for the companion UI. */
export type Route =
  | { name: 'home' }
  | { name: 'connect' }
  /** One asset — 'native' or a token address. */
  | { name: 'asset'; asset: string }
  | { name: 'activity' }
  | { name: 'addresses' }
  | { name: 'set-passcode'; required: boolean }
  | { name: 'send'; token?: string }
  | { name: 'receive'; token?: string }
  | { name: 'add-token' }
  | { name: 'sign'; id: string }
  | { name: 'settings' };


export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/u, '');
  if (path.startsWith('/connect')) return { name: 'connect' };
  if (path.startsWith('/activity')) return { name: 'activity' };
  if (path.startsWith('/addresses')) return { name: 'addresses' };
  if (path.startsWith('/set-passcode')) return { name: 'set-passcode', required: false };
  if (path.startsWith('/asset/')) {
    return { name: 'asset', asset: path.slice('/asset/'.length) || 'native' };
  }
  // `/send/<token address>` opens the send form already pointed at that token.
  if (path.startsWith('/send/')) return { name: 'send', token: path.slice('/send/'.length) };
  if (path.startsWith('/send')) return { name: 'send' };
  if (path.startsWith('/receive/')) return { name: 'receive', token: path.slice('/receive/'.length) };
  if (path.startsWith('/receive')) return { name: 'receive' };
  if (path.startsWith('/add-token')) return { name: 'add-token' };
  if (path.startsWith('/sign/')) return { name: 'sign', id: path.slice('/sign/'.length) };
  if (path.startsWith('/settings')) return { name: 'settings' };
  return { name: 'home' };
}

