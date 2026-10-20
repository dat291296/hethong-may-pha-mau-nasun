import assert from 'node:assert/strict';
export async function registerTestSession(client) {
  const result = await client.rpc('register_trusted_device_session', {
    p_device_id: `NASUN-STAGING-${crypto.randomUUID()}`, p_device_label: 'Synthetic security test', p_timezone: 'UTC',
  });
  assert.ifError(result.error);
  assert.equal(result.data?.valid, true, 'Real Auth session must register successfully');
}
