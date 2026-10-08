import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Use disposable, unlinked objects so ordinary roles must not read them.
export async function verifyStorageAccess(anonymous, clients) {
  const admin = clients.find(item => item.role === 'admin').client;
  const { data: identity, error: identityError } = await admin.auth.getUser();
  assert.ok(!identityError && identity?.user?.id, 'Storage verification requires a valid administrator');
  const bucket = 'technical-documents';
  const path = `${identity.user.id}/${randomUUID()}.png`;
  const cleanupPaths = [path];
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jr1cAAAAASUVORK5CYII=', 'base64');
  let uploaded = false;
  try {
    const { error: uploadError } = await admin.storage.from(bucket).upload(path, bytes, { contentType: 'image/png', upsert: false });
    assert.ok(!uploadError, `Administrator must upload a synthetic private Storage object (${uploadError?.statusCode || uploadError?.code || 'NO_CODE'}; ${/row.level|policy|permission/i.test(uploadError?.message || '') ? 'ACCESS_POLICY' : /bucket/i.test(uploadError?.message || '') ? 'BUCKET' : 'STORAGE_RESPONSE'})`);
    uploaded = true;
    const { data: content, error: downloadError } = await admin.storage.from(bucket).download(path);
    assert.ok(!downloadError && content, 'Administrator must read the uploaded object');
    assert.deepEqual(Buffer.from(await content.arrayBuffer()), bytes);
    const { error: anonymousError } = await anonymous.storage.from(bucket).download(path);
    assert.ok(anonymousError, 'Anonymous users must not read private Storage');
    for (const { role, client } of clients.filter(item => item.role !== 'admin')) {
      const { error: readError } = await client.storage.from(bucket).download(path);
      assert.ok(readError, `${role} must not read unlinked private documents`);
      const { data: user } = await client.auth.getUser();
      const deniedPath = `${user.user.id}/${randomUUID()}.png`;
      cleanupPaths.push(deniedPath);
      const { error: writeError } = await client.storage.from(bucket).upload(deniedPath, bytes, { contentType: 'image/png', upsert: false });
      assert.ok(writeError, `${role} must not upload technical documents`);
      await client.storage.from(bucket).remove([path]);
      const { error: preservedError } = await admin.storage.from(bucket).download(path);
      assert.ok(!preservedError, `${role} must not delete the administrator object`);
    }
  } finally {
    if (uploaded) {
      const { error } = await admin.storage.from(bucket).remove(cleanupPaths);
      assert.ok(!error, 'Synthetic Storage cleanup failed');
      const { error: missingError } = await admin.storage.from(bucket).download(path);
      assert.ok(missingError, 'Synthetic Storage object must be removed');
    }
  }
}
