import { waitForAuthResponse } from './authEmailFlows.js';

export async function requireReplaySession(client, ownerId, getOwner, checkTrustedSession, timeoutMs = 20000) {
  const assertOwner = () => {
    if (!ownerId || getOwner() !== ownerId) throw Object.assign(new Error('OFFLINE_OWNER_CHANGED'), { code: 'OFFLINE_OWNER_CHANGED' });
  };
  assertOwner();
  const { data, error } = await waitForAuthResponse(() => client.auth.getUser(), timeoutMs);
  assertOwner();
  if (error) throw error;
  if (data?.user?.id !== ownerId) throw Object.assign(new Error('SESSION_REJECTED'), { code: 'SESSION_REJECTED' });
  const security = await waitForAuthResponse(() => client.rpc('get_session_security_state'), timeoutMs);
  assertOwner();
  if (security.error) throw security.error;
  if (security.data?.user_id && security.data.user_id !== ownerId || !security.data?.profile_found || !security.data?.is_active) {
    throw Object.assign(new Error('SESSION_REJECTED'), { code: 'SESSION_REJECTED' });
  }
  const trusted = await waitForAuthResponse(checkTrustedSession, timeoutMs);
  assertOwner();
  if (!trusted.supported || trusted.state?.valid !== true) {
    throw Object.assign(new Error('SESSION_REJECTED'), { code: 'SESSION_REJECTED' });
  }
  return true;
}
