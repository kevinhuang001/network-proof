import { existsSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

const root = resolve('apps/extension/dist');
for (const filename of [
  'manifest.json', 'popup.html', 'tab.html', 'background.js',
  'inject.js', 'bridge.js', 'icon-16.png', 'icon-128.png'
]) {
  assert.ok(existsSync(resolve(root, filename)), `Extension build missing: ${filename}`);
}
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, '0.2.0');
assert.ok(manifest.key, 'The stable extension key/ID must not change');
assert.ok(manifest.background.service_worker);
assert.ok(!manifest.permissions.includes('debugger'));
console.log('Extension manifest and required entry points validated');
