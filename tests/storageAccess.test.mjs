import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyStorageAccess } from '../scripts/verify-storage-access.mjs';
function fixtures(exposed = false) {
  const files = new Map();
  const storage = { list: async directory => ({ data: [...files.keys()].filter(path => path.startsWith(directory + '/')).map(path => ({ name: path.split('/')[1] })), error: null }), upload: async (path, bytes) => { files.set(path, bytes); return { error: null }; },
    download: async path => files.has(path) ? { data: new Blob([files.get(path)]), error: null } : { error: { code: 'NOT_FOUND' } },
    remove: async paths => { paths.forEach(path => files.delete(path)); return { error: null }; } };
  const admin = { auth: { getUser: async () => ({ data: { user: { id: '00000000-0000-0000-0000-000000000001' } } }) }, storage: { from: () => storage } };
  const anonymous = { storage: { from: () => ({ download: async () => ({ error: exposed ? null : { code: 'DENIED' } }) }) } };
  return { files, admin, anonymous };
}
test('Storage verification removes its synthetic object after success', async () => {
  const fixture = fixtures();
  await verifyStorageAccess(fixture.anonymous, [{ role: 'admin', client: fixture.admin }]);
  assert.equal(fixture.files.size, 0);
});
test('Storage verification fails on anonymous exposure and still cleans up', async () => {
  const fixture = fixtures(true);
  await assert.rejects(verifyStorageAccess(fixture.anonymous, [{ role: 'admin', client: fixture.admin }]), /Anonymous/);
  assert.equal(fixture.files.size, 0);
});
